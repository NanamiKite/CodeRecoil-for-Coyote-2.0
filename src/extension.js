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
  // 全部配置从侧边栏 UI 读取，不依赖 VS Code settings.json
  // -------------------------------------------------------------

  let lastPunishTime = 0;
  let cooldownTimer = null;

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
   * 按错误数线性递增：1 个错误 = 基础值，10 个错误 = 上限值。
   * 中间线性插值。
   */
  function scaleByErrorCount(errorCount, base, max) {
    const t = Math.min((errorCount - 1) / 9, 1);
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
      finalIntensity = scaleByErrorCount(errorCount, cfg.intensity, cfg.maxIntensity);
      finalDurationMs = scaleByErrorCount(errorCount, cfg.durationMs, cfg.maxDurationMs);
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

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(() => {
      const errorCount = getErrorCount();
      sidebar.setErrorCount(errorCount);
      checkAndPunish();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      setTimeout(() => { checkAndPunish(); }, 500);
    }),
  );

  context.subscriptions.push(
    vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.exitCode !== 0) {
        setTimeout(() => { checkAndPunish(); }, 500);
      }
    }),
  );

  context.subscriptions.push({
    dispose() {
      if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
      controller.dispose();
    },
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
