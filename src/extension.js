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
    const maximum = Math.max(0, max);
    const minimum = Math.min(Math.max(0, base), maximum);
    const k = 0.15;
    const p = 1.4;
    const referenceErrors = 100;
    const progress = Math.log1p(k * Math.pow(Math.max(1, errorCount), p));
    const fullScale = Math.log1p(k * Math.pow(referenceErrors, p));
    return Math.round(Math.min(maximum, minimum + (maximum - minimum) * progress / fullScale));
  }

  // Duration remains a user-configured linear range and is capped separately.
  function scaleDurationByErrorCount(errorCount, base, max) {
    base = Math.min(Math.max(0, base), Math.max(0, max));
    max = Math.max(0, max);
    const t = Math.min((Math.max(1, errorCount) - 1) / 99, 1);
    return Math.round(base + (max - base) * t);
  }

  /*
   * Discrete error states.  A zero-error state intentionally has no output:
   * automatic punishment must never energize the device without an error.
   */
  function getSteppedPunishment(errorCount, cfg) {
    const maximum = Math.max(0, cfg.maxIntensity);
    const base = Math.min(Math.max(0, cfg.intensity), maximum);
    const maximumDuration = Math.max(0, cfg.maxDurationMs);
    const baseDuration = Math.min(Math.max(0, cfg.durationMs), maximumDuration);

    // Typical editor diagnostics are sparse for one-off edits, but a failed
    // refactor often produces several related errors at once.  Keep 1–3 as a
    // reminder, reserve 4–15 for an actionable warning, and escalate only
    // when 16+ errors indicate a broader compilation/module failure.
    const reminderEnd = 3;
    const warningEnd = 15;

    if (errorCount <= reminderEnd) {
      return {
        name: "提醒（1–3）",
        intensity: base,
        durationMs: baseDuration,
        // 5 Hz intermittent "beep" pulses.
        waveformData: [[1, 199, 8], [1, 199, 0], [1, 199, 8], [1, 199, 0], [1, 199, 8], [1, 199, 0], [1, 199, 0], [1, 199, 0], [1, 199, 0], [1, 199, 0]],
      };
    }

    if (errorCount <= warningEnd) {
      return {
        name: "警示（4–15）",
        intensity: Math.round(base + (maximum - base) * 0.5),
        durationMs: Math.round(baseDuration + (maximumDuration - baseDuration) * 0.5),
        // 50 Hz for 0.5 s, followed by a 0.5 s pause.
        waveformData: [[1, 19, 12], [1, 19, 12], [1, 19, 12], [1, 19, 12], [1, 19, 12], [1, 19, 0], [1, 19, 0], [1, 19, 0], [1, 19, 0], [1, 19, 0]],
      };
    }

    const rampFrames = [[1, 99, 4], [2, 48, 7], [3, 30, 10], [4, 21, 13], [5, 15, 15], [3, 37, 11], [2, 68, 8], [1, 149, 5], [4, 24, 12], [1, 19, 15]];
    const waveformData = Array.from({ length: 10 }, () => {
      const frame = rampFrames[Math.floor(Math.random() * rampFrames.length)];
      return [...frame];
    });

    return {
      name: "惩罚/暴走（16+）",
      intensity: maximum,
      durationMs: maximumDuration,
      // A new bounded sparse/dense sawtooth sequence is selected per trigger.
      waveformData,
    };
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
    let waveformData = cfg.waveformData || null;
    let modeName = "固定";

    if (cfg.scaleByErrors) {
      if (cfg.errorMapping === "stepped") {
        const stepped = getSteppedPunishment(errorCount, cfg);
        finalIntensity = stepped.intensity;
        finalDurationMs = stepped.durationMs;
        waveformData = stepped.waveformData;
        modeName = stepped.name;
      } else {
        finalIntensity = scaleIntensityByErrorCount(errorCount, cfg.intensity, cfg.maxIntensity);
        finalDurationMs = scaleDurationByErrorCount(errorCount, cfg.durationMs, cfg.maxDurationMs);
        modeName = "对数-幂律";
      }
    } else {
      finalIntensity = cfg.intensity;
      finalDurationMs = cfg.durationMs;
    }

    console.log(
      `[Coyote Punisher] ${errorCount} 个错误 (${modeName}) -> 强度: ${finalIntensity}, 时长: ${finalDurationMs}ms`
    );

    await controller.triggerPunishment({
      targetIntensity: finalIntensity,
      maxIntensity: cfg.maxIntensity,
      durationMs: finalDurationMs,
      maxDurationMs: cfg.maxDurationMs,
      channelA: true,
      channelB: false,
      waveformData,
      waveformInterval: 100,
    });

    lastPunishTime = Date.now();
    startCooldownDisplay(cooldownMs);
    sidebar.setLastPunish(`${errorCount} 个错误（${modeName}）-> 强度 ${finalIntensity}，${finalDurationMs}ms`);
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
