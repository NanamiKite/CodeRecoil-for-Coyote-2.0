"use strict";
const vscode = require("vscode");
const { randomBytes } = require("crypto");
const { waveforms } = require("../coyote/waveforms");
const { normalizeConfig, planErrors } = require("../coyote/rules");
const { dashboardHtml } = require("./dashboardHtml");

class CoyoteSidebarProvider {
  constructor(context, controller, runtime, bridge) {
    this.context = context;
    this.controller = controller;
    this.runtime = runtime;
    this.bridge = bridge;
    this.errorCount = 0;
    this.previousErrors = 0;
    this.streak = 0;
    this.view = null;
    this.manual = { channel:"A", durationMs:5000, waveformInterval:100 };
    this.onIntensityChanged = () => this.update();
    controller.on("intensityChanged", this.onIntensityChanged);
    this.onConnectionChanged = () => this.update();
    controller.on("connectionChanged", this.onConnectionChanged);
    this.presets = context.workspaceState.get("coyote.presets", {});
    runtime.on("change", () => this.update());
    this.timer = setInterval(() => {
      if (!controller.connected && runtime.running) runtime.stop("设备断开").catch(() => {});
      if (runtime.pending && Date.now() > runtime.pending.expiresAt) runtime.dismiss("expired");
      this.update();
    }, 500);
  }
  getPunishConfig() { return this.runtime.config; }
  setErrorCount(count) {
    this.previousErrors = this.errorCount;
    this.errorCount = count;
    this.update();
  }
  status() {
    const c = this.controller, r = this.runtime;
    return {
      connected: c.connected, battery: c.battery, deviceName: c.device?.name || "",
      connecting: c.connecting, connection: c.connection,
      channelA: c.channelA, channelB: c.channelB, errorCount: this.errorCount,
      manual: this.manual, intensitySource:c.intensitySource, intensityUpdatedAt:c.intensityUpdatedAt,
      controlEpoch:r.epoch,
      previousErrors: this.previousErrors, streak: this.streak,
      config: r.config, running: r.running, pending: r.pending, lastProposal: r.lastProposal,
      cooldownRemaining: Math.max(0, Math.ceil((r.cooldownUntil - Date.now()) / 1000)),
      events: r.events, raw: c.lastIntensityRaw, bridgeEnabled: !!this.bridge.server,
      presets: Object.keys(this.presets),
    };
  }
  update() {
    this.view?.webview.postMessage({ command: "state", state: this.status() });
  }
  resolveWebviewView(view) {
    this.view = view;
    const resources = vscode.Uri.joinPath(this.context.extensionUri, "resources");
    view.webview.options = { enableScripts: true, localResourceRoots: [resources] };
    const nonce = randomBytes(16).toString("hex");
    const css = view.webview.asWebviewUri(vscode.Uri.joinPath(resources, "dashboard.css"));
    const js = view.webview.asWebviewUri(vscode.Uri.joinPath(resources, "dashboard.js"));
    view.webview.html = dashboardHtml(view.webview.cspSource, nonce, css, js);
    view.webview.onDidReceiveMessage(message => {
      this.handle(message).catch(error => {
        this.runtime.record("操作失败：" + error.message);
        this.view?.webview.postMessage({ command: "error", text: error.message });
      });
    }, undefined, this.context.subscriptions);
  }
  async saveConfig(input) {
    await this.runtime.reconfigure(normalizeConfig(input));
    // Auto-trigger is deliberately session-local; all other choices survive reload.
    await this.context.workspaceState.update("coyote.config", { ...this.runtime.config, autoTrigger: false });
    this.view?.webview.postMessage({ command: "configSaved", config: this.runtime.config });
  }
  async handle(m) {
    switch (m.command) {
      case "ready":
        this.view.webview.postMessage({ command: "catalog", waveforms });
        this.update(); break;
      case "connect":
        if (!vscode.workspace.isTrusted) throw new Error("请先信任此工作区");
        if (this.controller.connected || this.controller.connecting) break;
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification, title: "Coyote：连接设备", cancellable: false,
        }, async progress => {
          const report = connection => progress.report({ message: connection.message });
          this.controller.on("connectionChanged", report);
          try { await this.controller.connect(); }
          finally { this.controller.off("connectionChanged", report); }
        });
        this.runtime.record("设备已连接"); break;
      case "disconnect":
        await this.runtime.stop("断开连接");
        await this.controller.disconnect(); break;
      case "battery": await this.controller.readBattery(); break;
      case "readIntensity":
        {
        const result = await this.runtime.write(this.runtime.epoch, () => this.controller.readIntensity());
        if (m.syncManual && result) this.view?.webview.postMessage({ command:"intensityRead", ...result });
        } break;
      case "setManualIntensity":
        if (!vscode.workspace.isTrusted) throw new Error("请先信任此工作区");
        await this.runtime.setManualIntensity(m.a, m.b); break;
      case "manualChannel":
        await this.runtime.setManualChannel(m.channel);
        this.manual.channel = m.channel; break;
      case "stopManual": await this.runtime.stopManualWaveform(); break;
      case "stop":
        this.runtime.config.autoTrigger = false;
        await this.runtime.stop("紧急停止；自动触发已关闭"); break;
      case "config": await this.saveConfig(m.config); break;
      case "simulate":
        this.view.webview.postMessage({ command: "simulation", id: m.id, plan: planErrors(m.count, m.config) }); break;
      case "manual":
        if (!vscode.workspace.isTrusted) throw new Error("请先信任此工作区");
        if (!Object.hasOwn(waveforms, m.waveform)) throw new Error("未知波形");
        {
        const channel = m.channel ?? this.manual.channel;
        const durationMs = m.durationMs ?? this.manual.durationMs;
        const waveformInterval = m.waveformInterval ?? this.manual.waveformInterval;
        if (!Number.isInteger(durationMs) || durationMs < 100 || durationMs > 30000) throw new Error("时长范围为 100–30000ms");
        await this.runtime.startManual({
          intensity:0, channel, durationMs, waveformInterval,
          name: waveforms[m.waveform].name,
          intensityA: m.a ?? this.controller.channelA,
          intensityB: m.b ?? this.controller.channelB,
          waveformData: waveforms[m.waveform].data.map(([x,y,z]) => [x,y,Math.min(z,15)]),
        });
        this.manual = { channel, durationMs, waveformInterval };
        } break;
      case "presetSave": {
        const name = String(m.name || "").trim();
        if (!name || name.length > 40 || ["__proto__","constructor","prototype"].includes(name)) throw new Error("预设名须为 1–40 个字符");
        this.presets[name] = { ...normalizeConfig(m.config), autoTrigger: false };
        await this.context.workspaceState.update("coyote.presets", this.presets);
        this.runtime.record("已保存预设：" + name); break;
      }
      case "presetLoad":
        if (!Object.hasOwn(this.presets, m.name)) throw new Error("未知预设");
        await this.saveConfig(this.presets[m.name]); break;
      case "bridgeToggle":
        if (this.bridge.server) {
          await this.runtime.stop("AI 接入已关闭");
          await this.bridge.close();
        } else {
          if (!vscode.workspace.isTrusted) throw new Error("请先信任此工作区");
          await this.bridge.start();
          this.runtime.record("本地 AI 接入已开启");
        }
        break;
      case "copyMcp": {
        if (!this.bridge.server) throw new Error("请先开启 AI 接入");
        const entry = vscode.Uri.joinPath(this.context.extensionUri, "src", "mcp", "server.js").fsPath;
        const config = [
          "- id: mcp-coyote",
          "  name: '@deepseek-ai/dsh-mcp-client'",
          "  config:",
          "    serverName: coyote",
          "    transport: stdio",
          "    command: node",
          "    args: " + JSON.stringify([entry]),
          "    env:",
          "      COYOTE_BRIDGE_PORT: " + JSON.stringify(String(this.bridge.port)),
          "      COYOTE_BRIDGE_TOKEN: " + JSON.stringify(this.bridge.token),
        ].join("\n");
        await vscode.env.clipboard.writeText(config);
        this.runtime.record("已复制 Harness 配置（含本次会话凭据，请勿公开）"); break;
      }
      case "approve": await this.runtime.approve(m.id); break;
      case "dismiss": this.runtime.dismiss(); this.runtime.record("已跳过 AI 场景"); break;
      default: throw new Error("未知操作");
    }
    this.update();
  }
  dispose() {
    clearInterval(this.timer);
    this.controller.off("intensityChanged", this.onIntensityChanged);
    this.controller.off("connectionChanged", this.onConnectionChanged);
  }
}
module.exports = { CoyoteSidebarProvider };
