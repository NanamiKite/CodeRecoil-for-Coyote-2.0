"use strict";
const vscode = require("vscode");
const { randomBytes } = require("crypto");
const { waveforms } = require("../coyote/waveforms");
const { normalizeConfig, planErrors } = require("../coyote/rules");
const { dashboardHtml } = require("./dashboardHtml");
const { mcpConfig } = require("../mcp/configs");
const { defaultStory } = require("../coyote/CodeChallenge");

class CoyoteSidebarProvider {
  constructor(context, controller, runtime, bridge, challenge) {
    this.context = context;
    this.controller = controller;
    this.runtime = runtime;
    this.bridge = bridge;
    this.challenge = challenge;
    this.errorCount = 0;
    this.previousErrors = 0;
    this.streak = 0;
    this.autoStatus = "等待保存或 VS Code 构建任务";
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
      connected: c.connected, battery: c.battery, deviceName: c.device?.name || "", deviceId: c.device?.id || "", version: c.version,
      connecting: c.connecting || c.scanning, connection: c.connection,
      channelA: c.channelA, channelB: c.channelB, errorCount: this.errorCount,
      manual: this.manual, intensitySource:c.intensitySource, intensityUpdatedAt:c.intensityUpdatedAt,
      hasDeviceIntensity: c.intensitySource === "notification",
      controlEpoch:r.epoch,
      previousErrors: this.previousErrors, streak: this.streak,
      autoStatus: r.config.autoTrigger ? this.autoStatus : "自动触发已关闭：在规则页勾选并保存规则",
      config: r.config, running: r.running, pending: r.pending, lastProposal: r.lastProposal,
      cooldownRemaining: Math.max(0, Math.ceil((r.cooldownUntil - Date.now()) / 1000)),
      events: r.events, raw: c.lastIntensityRaw, bridgeEnabled: !!this.bridge.server,
      challenge: this.challenge?.status(),
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
        if (this.controller.connected || this.controller.connecting || this.controller.scanning) break;
        {
        const connected = await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification, title: "Coyote：连接设备", cancellable: false,
        }, async progress => {
          const report = connection => progress.report({ message: connection.message });
          this.controller.on("connectionChanged", report);
          try {
            const devices = await this.controller.scanDevices();
            if (!devices.length) return false;
            const selected = await vscode.window.showQuickPick(devices.map(device => ({
              label: `V${device.version} · ${device.name}`,
              description: device.id,
              detail: "设备 ID：" + device.id,
              id: device.id,
            })), { placeHolder: "选择要连接的郊狼主机（按设备 ID 区分）", matchOnDescription: true });
            if (!selected) { this.controller.cancelSelection(); return false; }
            if (!this.controller.scanning) return false;
            await this.controller.connect(selected.id);
            return true;
          }
          finally { this.controller.off("connectionChanged", report); }
        });
        if (!connected) break;
        this.runtime.record("设备已连接"); break;
        }
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
        if (this.controller.scanning) this.controller.cancelSelection();
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
        const config = mcpConfig(m.client || "harness", entry, this.bridge.port, this.bridge.token);
        await vscode.env.clipboard.writeText(config);
        this.runtime.record("已复制 " + ({codex:"Codex",claude:"Claude Code",harness:"Harness"}[m.client || "harness"]) + " MCP 配置（含本次会话凭据，请勿公开）"); break;
      }
      case "challengeStart":
        if (!vscode.workspace.isTrusted) throw new Error("请先信任此工作区");
        this.challenge.start(m.story || defaultStory);
        this.runtime.record("代码闯关已开始；设备不会因闯关自动输出"); break;
      case "challengeStop":
        this.challenge.stop();
        this.runtime.record("代码闯关已结束"); break;
      case "copyChallengePrompt": {
        const story = this.challenge.status().story;
        const prompt = [
          "你是我的写代码闯关主持人。场景设定：" + story,
          "先调用 coyote_challenge_status 读取当前关卡；每次我保存或运行 VS Code 构建任务后再读取状态，依据实际关卡推进剧情，不编造通关结果。",
          "可调用 coyote_status 和 coyote_scene_list 了解规则；若剧情需要反馈，只能通过 coyote_scene_propose 提案，并等待我在插件侧边栏点击应用。pending 不代表已输出。",
          "我要求停止时立即调用 coyote_scene_stop。不要自行提高强度或延长时长。",
        ].join("\n");
        await vscode.env.clipboard.writeText(prompt);
        this.runtime.record("已复制代码闯关主持词"); break;
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
