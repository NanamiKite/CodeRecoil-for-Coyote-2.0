"use strict";
const vscode = require("vscode");
const { CoyoteController } = require("./coyote/CoyoteController");
const { SceneRuntime } = require("./coyote/SceneRuntime");
const { planErrors, normalizeConfig } = require("./coyote/rules");
const { LocalBridge } = require("./mcp/LocalBridge");
const { CoyoteSidebarProvider } = require("./ui/CoyoteSidebarProvider");
let activeSession;
function activate(context) {
  const controller = new CoyoteController();
  const runtime = new SceneRuntime(controller, { ...normalizeConfig(context.workspaceState.get("coyote.config", {})), autoTrigger: false });
  let sidebar;
  const bridge = new LocalBridge(runtime, () => sidebar.status());
  sidebar = new CoyoteSidebarProvider(context, controller, runtime, bridge);
  activeSession = { runtime, bridge, controller };
  context.subscriptions.push(sidebar, vscode.window.registerWebviewViewProvider("coyotePunisher.sidebar", sidebar));
  const command = (name, action) => context.subscriptions.push(vscode.commands.registerCommand("coyotePunisher." + name, async () => {
    try { await action(); sidebar.update(); }
    catch (e) { runtime.record(e.message); vscode.window.showErrorMessage("Coyote: " + e.message); }
  }));
  command("connect", () => sidebar.handle({ command: "connect" }));
  command("disconnect", () => sidebar.handle({ command: "disconnect" }));
  command("emergencyStop", () => sidebar.handle({ command: "stop" }));
  command("manualTest", () => sidebar.handle({ command: "setManualIntensity", a:10, b:0 }));
  command("setIntensity", async () => {
    const validateInput = v => v.trim() && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 200 ? null : "输入 0–200 的整数";
    const a = await vscode.window.showInputBox({ prompt:"设置 A 通道强度", value:String(controller.channelA), validateInput });
    if (a === undefined) return;
    const b = await vscode.window.showInputBox({ prompt:"设置 B 通道强度", value:String(controller.channelB), validateInput });
    if (b !== undefined) await sidebar.handle({ command:"setManualIntensity", a:Number(a), b:Number(b) });
  });
  let timer, scheduledSource, disposed = false, lastTriggered = null;
  function autoStatus(message) {
    sidebar.autoStatus = message;
    sidebar.update();
  }
  function diagnostics(scope = runtime.config.scope, uri = vscode.window.activeTextEditor?.document.uri) {
    const rows = scope === "file" ? (uri ? [[uri, vscode.languages.getDiagnostics(uri)]] : []) : vscode.languages.getDiagnostics();
    const keys = [];
    for (const [file, items] of rows) {
      for (const d of items) {
        if (d.severity === vscode.DiagnosticSeverity.Error) keys.push(JSON.stringify([
          file.toString(), d.range.start.line, d.range.start.character, d.source, d.code?.value ?? d.code, d.message,
        ]));
      }
    }
    return [...new Set(keys)].sort();
  }
  const baseline = new Set(diagnostics("workspace"));
  function refreshCount() {
    const keys = diagnostics();
    sidebar.setErrorCount(keys.length);
    if (!keys.length) lastTriggered = null;
  }
  async function evaluate(uri, source) {
    if (disposed) return;
    if (!runtime.config.autoTrigger) { autoStatus("自动触发未开启：请在规则页勾选并保存规则"); return; }
    if (!vscode.workspace.isTrusted) { autoStatus(source + "未执行：请先信任工作区"); return; }
    if (!controller.connected) { autoStatus(source + "未执行：请先连接设备"); return; }
    if (runtime.running || runtime.pending) { autoStatus(source + "未执行：当前有场景运行或待确认"); return; }
    const keys = diagnostics(runtime.config.scope, uri);
    const errors = runtime.config.onlyNew ? keys.filter(k => !baseline.has(k)) : keys;
    if (!errors.length) {
      sidebar.streak++;
      autoStatus(source + "已检查：" + (keys.length && runtime.config.onlyNew ? "错误均非本次会话新增" : "没有错误"));
      runtime.record("本轮没有待处理错误 · 连续通过 " + sidebar.streak + " 次");
      lastTriggered = null;
      return;
    }
    const fingerprint = JSON.stringify(errors);
    // A changed error set starts a new batch, even if it was seen during cooldown.
    if (lastTriggered && lastTriggered.fingerprint !== fingerprint) lastTriggered = null;
    if (runtime.config.ignoreSameErrors && lastTriggered?.fingerprint === fingerprint) {
      autoStatus(source + "发现 " + errors.length + " 个错误；同一批错误已忽略");
      return;
    }
    if (Date.now() < runtime.cooldownUntil) {
      autoStatus(source + "发现 " + errors.length + " 个错误；冷却剩余 " + Math.ceil((runtime.cooldownUntil - Date.now()) / 1000) + " 秒");
      return;
    }
    if (lastTriggered?.fingerprint === fingerprint && Date.now() - lastTriggered.at < 1000) {
      autoStatus(source + "发现 " + errors.length + " 个错误；本轮已触发");
      return;
    }
    sidebar.streak = 0;
    const plan = planErrors(errors.length, runtime.config);
    if (!plan.intensity || !plan.durationMs) {
      autoStatus(source + "发现 " + errors.length + " 个错误；规则强度或时长为 0，未输出");
      return;
    }
    autoStatus(source + "发现 " + errors.length + " 个错误；正在启动输出…");
    await runtime.start(plan, source + " · " + errors.length + " 个错误");
    lastTriggered = { fingerprint, at: Date.now() };
    autoStatus(source + "已输出：" + errors.length + " 个错误 · " + plan.channel + " 通道 · 强度 " + plan.intensity);
  }
  function schedule(uri, source) {
    clearTimeout(timer);
    scheduledSource = source;
    const epoch = runtime.epoch;
    timer = setTimeout(() => {
      scheduledSource = undefined;
      if (epoch !== runtime.epoch || disposed) return;
      evaluate(uri, source).catch(e => {
        autoStatus(source + "失败：" + e.message);
        runtime.record("自动触发失败：" + e.message);
      });
    }, 500);
  }
  const isBuild = task => task.group?.id === "build" || /\b(build|compile|tsc|webpack|vite)\b/i.test(task.name || "");
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(refreshCount),
    vscode.window.onDidChangeActiveTextEditor(refreshCount),
    vscode.workspace.onDidSaveTextDocument(doc => schedule(doc.uri, "保存")),
    vscode.workspace.onDidChangeTextDocument(() => {
      if (scheduledSource === "保存") { clearTimeout(timer); scheduledSource = undefined; }
    }),
    vscode.tasks.onDidStartTask(event => { if (isBuild(event.execution.task)) schedule(undefined, "构建启动"); }),
    vscode.tasks.onDidEndTaskProcess(event => { if (isBuild(event.execution.task) && event.exitCode !== 0) schedule(undefined, "构建失败"); }),
    { dispose() {
      disposed = true; clearTimeout(timer);
      bridge.close().catch(console.error);
      runtime.dispose().catch(console.error).finally(() => controller.dispose());
    } },
  );
  refreshCount();
}
async function deactivate() {
  if (activeSession) {
    await activeSession.bridge.close();
    await activeSession.runtime.dispose();
    activeSession.controller.dispose();
    activeSession = null;
  }
}
module.exports = { activate, deactivate };
