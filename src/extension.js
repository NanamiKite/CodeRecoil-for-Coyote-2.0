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
      const a = await vscode.window.showInputBox({
        prompt: "Channel A intensity",
        value: "10",
      });

      if (a === undefined) {
        return;
      }

      const b = await vscode.window.showInputBox({
        prompt: "Channel B intensity",
        value: "0",
      });

      if (b === undefined) {
        return;
      }

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

  /*
   * 冷却时间状态。
   *
   * 每次触发惩罚后，在 cooldown 秒内
   * 不再重复触发。
   */
  let lastPunishTime = 0;

  /*
   * 获取当前配置。
   */
  function getConfig() {
    const cfg = vscode.workspace.getConfiguration("coyotePunisher");
    return {
      maxIntensity: cfg.get("maxIntensity", 200),
      maxDuration: cfg.get("maxDuration", 5000),
      cooldown: cfg.get("cooldown", 15),
      autoTrigger: cfg.get("autoTrigger", false),
    };
  }

  /*
   * 根据错误数量计算惩罚强度和时长。
   *
   * 映射策略（线性阶梯）：
   *
   *   1 个错误  →  基础强度 × 1,   基础时长 × 1
   *   2~5 个    →  基础强度 × 1.5, 基础时长 × 1.5
   *   6~10 个   →  基础强度 × 2,   基础时长 × 2
   *   11~20 个  →  基础强度 × 2.5, 基础时长 × 2.5
   *   20+ 个    →  基础强度 × 3,   基础时长 × 3
   *
   * 最终结果受 maxIntensity / maxDuration 钳制。
   */
  function mapErrorToPunishment(errorCount, baseIntensity, baseDuration, maxIntensity, maxDuration) {
    let multiplier = 1;

    if (errorCount >= 20) {
      multiplier = 3;
    } else if (errorCount >= 11) {
      multiplier = 2.5;
    } else if (errorCount >= 6) {
      multiplier = 2;
    } else if (errorCount >= 2) {
      multiplier = 1.5;
    }

    return {
      intensity: Math.min(Math.round(baseIntensity * multiplier), maxIntensity),
      durationMs: Math.min(Math.round(baseDuration * multiplier), maxDuration),
    };
  }

  /*
   * 统计当前工作区中 Error 级别的诊断数量。
   */
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

  /**
   * 惩罚触发核心函数
   */
  async function checkAndPunish() {
    if (!controller.connected) {
      return;
    }

    const config = getConfig();

    /*
     * 检查 autoTrigger 开关。
     */
    if (!config.autoTrigger) {
      return;
    }

    /*
     * 检查冷却时间。
     */
    const now = Date.now();
    const cooldownMs = config.cooldown * 1000;
    if (now - lastPunishTime < cooldownMs) {
      console.log(
        `[Coyote Punisher] 冷却中，剩余 ${(cooldownMs - (now - lastPunishTime)) / 1000}s`
      );
      return;
    }

    const errorCount = getErrorCount();

    if (errorCount <= 0) {
      return;
    }

    /*
     * 从侧边栏获取用户配置的惩罚参数。
     */
    const punishConfig = sidebar.getPunishConfig();

    /*
     * 根据错误数量映射强度和时长。
     */
    const mapped = mapErrorToPunishment(
      errorCount,
      punishConfig.intensity,
      punishConfig.durationMs,
      config.maxIntensity,
      config.maxDuration
    );

    console.log(
      `[Coyote Punisher] ${errorCount} 个错误 -> 强度: ${mapped.intensity}, 时长: ${mapped.durationMs}ms`
    );

    /*
     * 以对象形式传入，确保所有参数都被正确解析。
     */
    await controller.triggerPunishment({
      targetIntensity: mapped.intensity,
      maxIntensity: config.maxIntensity,
      durationMs: mapped.durationMs,
      maxDurationMs: config.maxDuration,
      channelA: true,
      channelB: false,
      waveformData: punishConfig.waveformData || null,
      waveformInterval: 100,
    });

    lastPunishTime = Date.now();

    sidebar.update();
  }

  /*
   * 实时更新侧边栏的 Error 数量。
   */
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(() => {
      const errorCount = getErrorCount();
      sidebar.setErrorCount(errorCount);

      /*
       * 直接在诊断变化事件中触发惩罚判断，
       * 替代原先 onDidSaveTextDocument + setTimeout(100ms) 的方式。
       * 这样无论诊断更新的快慢（TypeScript tsserver 可能需要数秒），
       * 都能在结果就绪后精确触发。
       */
      checkAndPunish();
    }),
  );

  /*
   * 保留 onDidSaveTextDocument 触发作为备用路径。
   *
   * 某些语言服务在保存时不会立即触发 onDidChangeDiagnostics，
   * 因此保留此监听器，但延迟增加到 500ms 以提高命中率。
   */
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      setTimeout(() => {
        checkAndPunish();
      }, 500);
    }),
  );

  /*
   * 终端/Task 编译进程执行完毕时触发。
   */
  context.subscriptions.push(
    vscode.tasks.onDidEndTaskProcess((event) => {
      if (event.exitCode !== 0) {
        setTimeout(() => {
          checkAndPunish();
        }, 500);
      }
    }),
  );

  // -------------------------------------------------------------

  context.subscriptions.push({
    dispose() {
      controller.dispose();
    },
  });
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
