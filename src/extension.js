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
  let timer, disposed = false, lastFingerprint = "";
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
    if (!keys.length) lastFingerprint = "";
  }
  async function evaluate(uri) {
    if (disposed || !runtime.config.autoTrigger || !controller.connected || runtime.running || runtime.pending || !vscode.workspace.isTrusted) return;
    const keys = diagnostics(runtime.config.scope, uri);
    const errors = runtime.config.onlyNew ? keys.filter(k => !baseline.has(k)) : keys;
    if (!errors.length) {
      sidebar.streak++;
      runtime.record("本轮没有待处理错误 · 连续通过 " + sidebar.streak + " 次");
      lastFingerprint = "";
      return;
    }
    const fingerprint = JSON.stringify([runtime.config, errors]);
    if (fingerprint === lastFingerprint || Date.now() < runtime.cooldownUntil) return;
    sidebar.streak = 0;
    await runtime.start(planErrors(errors.length, runtime.config), "保存 / 构建 · " + errors.length + " 个错误");
    lastFingerprint = fingerprint;
  }
  function schedule(uri) {
    clearTimeout(timer);
    const epoch = runtime.epoch;
    timer = setTimeout(() => {
      if (epoch !== runtime.epoch || disposed) return;
      evaluate(uri).catch(e => runtime.record("自动触发失败：" + e.message));
    }, 500);
  }
  const isBuild = task => task.group?.id === "build" || /\b(build|compile|tsc|webpack|vite)\b/i.test(task.name || "");
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(refreshCount),
    vscode.window.onDidChangeActiveTextEditor(refreshCount),
    vscode.workspace.onDidSaveTextDocument(doc => schedule(doc.uri)),
    vscode.workspace.onDidChangeTextDocument(() => clearTimeout(timer)),
    vscode.tasks.onDidStartTask(event => { if (isBuild(event.execution.task)) schedule(); }),
    vscode.tasks.onDidEndTaskProcess(event => { if (isBuild(event.execution.task) && event.exitCode !== 0) schedule(); }),
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
