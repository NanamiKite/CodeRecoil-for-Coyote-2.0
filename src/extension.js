const vscode = require("vscode");
const { CoyoteController } = require("./coyote/CoyoteController");
const { CoyoteSidebarProvider } = require("./ui/CoyoteSidebarProvider");

function activate(context) {
  console.log("Coyote 2.0 Code Punisher activated");

  const controller = new CoyoteController();
  const sidebar = new CoyoteSidebarProvider(context.extensionUri, controller);

  console.log("Registering Coyote sidebar provider...");

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "coyotePunisher.sidebar",
      sidebar,
    ),
  );

  console.log("Coyote sidebar provider registered.");

  context.subscriptions.push(
    vscode.commands.registerCommand("coyotePunisher.connect", async () => {
    try {
      await controller.connect();
      sidebar.update();
      vscode.window.showInformationMessage("Coyote 2.0 已连接");
    } catch (error) {
      console.error(error);
      vscode.window.showErrorMessage("Coyote 连接失败: " + error.message);
    }
  }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("coyotePunisher.disconnect", async () => {
    await controller.disconnect();
    sidebar.update();
  }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "coyotePunisher.emergencyStop",
      async () => {
        try {
          await controller.emergencyStop();
          sidebar.update();
        } catch (error) {
          vscode.window.showErrorMessage("Coyote 停止失败: " + error.message);
        }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("coyotePunisher.manualTest", async () => {
    try {
      await controller.test();
      sidebar.update();
    } catch (error) {
      vscode.window.showErrorMessage("Coyote 测试失败: " + error.message);
    }
  }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("coyotePunisher.setIntensity", async () => {
    const a = await vscode.window.showInputBox({ prompt: "Channel A intensity", value: "10" });
    if (a === undefined) return;
    const b = await vscode.window.showInputBox({ prompt: "Channel B intensity", value: "0" });
    if (b === undefined) return;
    try {
      await controller.setIntensity(Number(a), Number(b));
      sidebar.update();
    } catch (error) {
      vscode.window.showErrorMessage("设置失败: " + error.message);
    }
  }),
  );

  // -------------------------------------------------------------
  // 惩罚输出触发核心逻辑
  // -------------------------------------------------------------

  let lastPunishTime = 0;
  let cooldownTimer = null;
  let punishCheckTimer = null;

  function getErrorCount() {
    let errorCount = 0;
    for (const [, diagnostics] of vscode.languages.getDiagnostics()) {
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
          errorCount++;
        }
      }
    }
    return errorCount;
  }

  /*
   * S(e) = S_base + A * ln(1 + k * e^p).
   * The user's base and maximum remain authoritative. A is derived so that
   * 100 errors reaches the configured maximum; the clamp is the safety cap.
   */
  function scaleIntensityByErrorCount(errorCount, base, max) {
    const minimum = Math.min(base, max);
    const maximum = Math.max(base, max);
    const k = 0.15;
    const p = 1.4;
    const referenceErrors = 100;
    const progress = Math.log1p(k * Math.pow(Math.max(1, errorCount), p));
    const fullScale = Math.log1p(k * Math.pow(referenceErrors, p));
    return Math.round(Math.min(maximum, minimum + (maximum - minimum) * progress / fullScale));
  }

  // Duration remains a user-configured linear range and is capped separately.
  function scaleDurationByErrorCount(errorCount, base, max) {
    const t = Math.min((Math.max(1, errorCount) - 1) / 99, 1);
    return Math.round(base + (max - base) * t);
  }

  /*
   * 冷却倒计时显示：每秒刷新侧边栏。
   */
  function startCooldownDisplay(cooldownMs) {
    if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
    const tick = () => {
      const remaining = cooldownMs - (Date.now() - lastPunishTime);
      if (remaining <= 0) {
        sidebar.setCooldownRemaining(0);
        clearInterval(cooldownTimer);
        cooldownTimer = null;
        return;
      }
      sidebar.setCooldownRemaining(Math.ceil(remaining / 1000));
    };
    tick();
    cooldownTimer = setInterval(tick, 1000);
  }

  async function checkAndPunish() {
    if (!controller.connected) return;

    const cfg = sidebar.getPunishConfig();

    if (!cfg.autoTrigger) return;

    const now = Date.now();
    const cooldownMs = cfg.cooldown * 1000;
    if (now - lastPunishTime < cooldownMs) {
      console.log(
        `[Coyote Punisher] 冷却中，剩余 ${((cooldownMs - (now - lastPunishTime)) / 1000).toFixed(1)}s`
      );
      return;
    }

    const errorCount = getErrorCount();
    if (errorCount <= 0) return;

    let finalIntensity, finalDurationMs;

    if (cfg.scaleByErrors) {
      finalIntensity = scaleIntensityByErrorCount(errorCount, cfg.intensity, cfg.maxIntensity);
      finalDurationMs = scaleDurationByErrorCount(errorCount, cfg.durationMs, cfg.maxDurationMs);
    } else {
      finalIntensity = cfg.intensity;
      finalDurationMs = cfg.durationMs;
    }

    console.log(
      `[Coyote Punisher] ${errorCount} 个错误 -> 强度: ${finalIntensity}, 时长: ${finalDurationMs}ms`
    );

    await controller.triggerPunishment({
      targetIntensity: finalIntensity,
      maxIntensity: cfg.maxIntensity,
      durationMs: finalDurationMs,
      maxDurationMs: cfg.maxDurationMs,
      channelA: true,
      channelB: false,
      waveformData: cfg.waveformData || null,
      waveformInterval: 100,
    });

    lastPunishTime = Date.now();
    startCooldownDisplay(cooldownMs);
    sidebar.setLastPunish(`${errorCount} 个错误 -> 强度 ${finalIntensity}，${finalDurationMs}ms`);
    sidebar.update();
  }

  function schedulePunishmentCheck() {
    if (punishCheckTimer) clearTimeout(punishCheckTimer);
    // Give the language service / build task time to publish diagnostics.
    punishCheckTimer = setTimeout(() => {
      punishCheckTimer = null;
      checkAndPunish().catch((error) => {
        console.error("[Coyote Punisher] 自动触发失败:", error);
      });
    }, 500);
  }

  function isBuildTask(task) {
    if (task.group && task.group.id === "build") return true;
    const label = String(task.name || task.definition?.label || "");
    return /\b(build|compile|tsc|webpack|vite)\b/i.test(label);
  }

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(() => {
      const errorCount = getErrorCount();
      sidebar.setErrorCount(errorCount);
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      schedulePunishmentCheck();
    }),
  );

  context.subscriptions.push(
    vscode.tasks.onDidStartTask((event) => {
      if (isBuildTask(event.execution.task)) schedulePunishmentCheck();
    }),
  );

  context.subscriptions.push({
    dispose() {
      if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
      if (punishCheckTimer) { clearTimeout(punishCheckTimer); punishCheckTimer = null; }
      controller.dispose();
    },
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
