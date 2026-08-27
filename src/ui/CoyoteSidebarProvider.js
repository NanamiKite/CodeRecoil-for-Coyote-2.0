const vscode = require("vscode");

class CoyoteSidebarProvider {
  constructor(extensionUri, controller) {
    this.extensionUri = extensionUri;
    this.controller = controller;
    this.view = undefined;

    this.errorCount = 0;

    this.lastAction = "等待操作";
    this.lastActionType = "info";
    this.lastRaw = "--";

    // 波形执行状态
    this.waveformRunning = false;
    this.waveformTimer = null;
    this.waveformIndex = 0;
    this.waveformEndTime = 0;
    this.waveformName = "--";

    /*
     * 波形激活通道
     * A  = 只输出 A
     * B  = 只输出 B
     * AB = A、B 同时输出
     */
    this.waveformChannel = "A";

    /*
     * 惩罚配置（从 UI 同步过来的值）
     */
    this.punishConfig = {
      intensity: 50,
      durationMs: 1000,
      waveformName: "frequencySweep",
    };
  }

  /*
   * 返回当前惩罚配置，供 extension.js 的 checkAndPunish 调用。
   *
   * 返回值包含 waveformData（波形帧序列），
   * 以便 triggerPunishment 在惩罚期间循环下发。
   */
  getPunishConfig() {
    const waveforms = this.getWaveforms();
    const selected = waveforms[this.punishConfig.waveformName];

    /*
     * 将预设波形中 Z > 15 的帧钳制到 15。
     * 协议文档：Z > 20 会导致脉冲宽度 > 100us，产生刺痛感。
     * 这里预留 5 的余量。
     */
    let safeData = [];
    if (selected) {
      safeData = selected.data.map((frame) => [
        frame[0],
        frame[1],
        Math.min(frame[2], 15),
      ]);
    }

    return {
      intensity: this.punishConfig.intensity,
      durationMs: this.punishConfig.durationMs,
      waveformName: this.punishConfig.waveformName,
      waveformData: safeData.length > 0 ? safeData : null,
    };
  }

  resolveWebviewView(webviewView) {
    console.log("CoyoteSidebarProvider.resolveWebviewView()");

    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      console.log("[Coyote UI]", message.command, message);

      try {
        switch (message.command) {
          case "connect":
            this.setAction("正在连接 Coyote 2.0...", "working");
            this.update();

            await this.controller.connect();

            this.setAction("Coyote 2.0 已连接", "success");
            this.update();
            break;

          case "disconnect":
            this.stopWaveformInternal();

            this.setAction("正在断开连接...", "working");
            this.update();

            await this.controller.disconnect();

            this.setAction("设备已断开", "success");
            this.update();
            break;

          case "battery":
            this.setAction("正在读取电量...", "working");
            this.update();

            await this.controller.readBattery();

            this.setAction(
              "电量：" + String(this.controller.battery) + "%",
              "success"
            );
            this.update();
            break;

          case "setIntensity": {
            const a = Number(message.a);
            const b = Number(message.b);

            if (!Number.isInteger(a) || !Number.isInteger(b)) {
              throw new Error("A / B 强度必须是整数");
            }

            /*
             * 使用安全范围 0~200（App 挡位）。
             */
            if (a < 0 || a > 200 || b < 0 || b > 200) {
              throw new Error("强度范围必须是 0 ~ 200（App 挡位）");
            }

            this.setAction(
              "正在设置 A=" + String(a) + "，B=" + String(b) + "...",
              "working"
            );
            this.update();

            await this.controller.setIntensity(a, b);

            this.setAction(
              "已设置 A=" + String(a) + "，B=" + String(b),
              "success"
            );

            this.lastRaw = this.controller.lastIntensityRaw || "--";
            this.update();
            break;
          }

          case "readIntensity":
            this.setAction("正在读取 A/B 强度...", "working");
            this.update();

            await this.controller.readIntensity();

            this.setAction(
              "读取成功：A=" +
                String(this.controller.channelA) +
                "，B=" +
                String(this.controller.channelB),
              "success"
            );

            this.lastRaw = this.controller.lastIntensityRaw || "--";
            this.update();
            break;

          case "test":
            this.setAction("正在执行手动测试...", "working");
            this.update();

            await this.controller.test();

            this.setAction("手动测试完成", "success");
            this.update();
            break;

          case "stop":
            this.stopWaveformInternal();

            this.setAction("正在执行紧急停止...", "working");
            this.update();

            await this.controller.emergencyStop();

            this.setAction("已执行紧急停止", "success");
            this.update();
            break;

          case "startWaveform": {
            const waveformName = String(message.waveform || "");
            const duration = Number(message.duration);
            const interval = Number(message.interval || 100);
            const channel = String(message.channel || "A").toUpperCase();

            if (!Number.isInteger(duration) || duration <= 0) {
              throw new Error("持续时长必须是正整数");
            }

            if (duration > 30000) {
              throw new Error("持续时长不能超过 30000 ms");
            }

            if (
              !Number.isInteger(interval) ||
              interval < 20 ||
              interval > 5000
            ) {
              throw new Error("波形间隔必须在 20 ~ 5000 ms");
            }

            if (channel !== "A" && channel !== "B" && channel !== "AB") {
              throw new Error("波形激活通道必须是 A、B 或 AB");
            }

            if (!this.controller.connected) {
              throw new Error("请先连接 Coyote 2.0");
            }

            this.startWaveform(waveformName, duration, interval, channel);
            break;
          }

          case "stopWaveform":
            this.stopWaveformInternal();
            this.setAction("波形已停止", "success");
            this.update();
            break;

          /*
           * 惩罚配置更新：从 UI 同步到 provider。
           */
          case "updatePunishConfig": {
            this.punishConfig.intensity = Math.max(0, Math.min(200, Math.round(Number(message.intensity) || 0)));
            this.punishConfig.durationMs = Math.max(100, Math.min(30000, Math.round(Number(message.durationMs) || 1000)));
            this.punishConfig.waveformName = String(message.waveformName || "frequencySweep");
            console.log("[Coyote UI] 惩罚配置已更新:", this.punishConfig);
            break;
          }

          default:
            console.warn("Unknown Coyote UI command:", message.command);
        }
      } catch (error) {
        console.error("Coyote command error:", error);

        this.stopWaveformInternal();
        this.setAction("操作失败：" + String(error.message || error), "error");
        this.update();

        vscode.window.showErrorMessage(
          "Coyote: " + String(error.message || error)
        );
      }
    });

    this.update();
  }

  getWaveforms() {
    return {
      frequencySweep: {
        name: "频率递增",
        description: "频率逐步变化",
        data: [
          [5, 135, 15],
          [5, 125, 15],
          [5, 115, 15],
          [5, 105, 15],
          [5, 95, 15],
          [4, 86, 15],
          [4, 76, 15],
          [4, 66, 15],
          [3, 57, 15],
          [3, 47, 15],
          [3, 37, 15],
          [2, 28, 15],
          [2, 18, 15],
          [1, 14, 15],
          [1, 9, 15],
        ],
      },

      frequencyAlternate: {
        name: "双频切换",
        description: "两个频率之间周期切换",
        data: [
          [5, 95, 15],
          [5, 95, 15],
          [5, 95, 15],
          [5, 95, 15],
          [5, 95, 15],
          [1, 9, 15],
          [1, 9, 15],
          [1, 9, 15],
          [1, 9, 15],
          [1, 9, 15],
        ],
      },

      thrust: {
        name: "推力变化",
        description: "频率基本不变，脉冲宽度变化",
        data: [
          [1, 9, 4],
          [1, 9, 8],
          [1, 9, 12],
          [1, 9, 15],
          [1, 9, 15],
          [1, 9, 15],
          [1, 9, 15],
          [1, 9, 0],
          [1, 9, 0],
          [1, 9, 0],
        ],
      },
    };
  }

  startWaveform(name, duration, interval, channel) {
    const waveforms = this.getWaveforms();
    const waveform = waveforms[name];

    if (!waveform) {
      throw new Error("未知波形：" + name);
    }

    channel = String(channel || "A").toUpperCase();

    if (channel !== "A" && channel !== "B" && channel !== "AB") {
      throw new Error("波形激活通道必须是 A、B 或 AB");
    }

    this.stopWaveformInternal();

    this.waveformRunning = true;
    this.waveformIndex = 0;
    this.waveformName = waveform.name;
    this.waveformChannel = channel;
    this.waveformEndTime = Date.now() + duration;

    if (this.controller.channelA === 0 && this.controller.channelB === 0) {
      vscode.window.showWarningMessage("当前输出强度为 0，请先增加通道强度。");
    }

    let channelText = channel === "AB" ? "A+B" : channel;

    this.setAction(
      "正在执行波形：" +
        waveform.name +
        "（" +
        String(duration) +
        " ms，通道 " +
        channelText +
        "）",
      "working"
    );

    this.update();
    this.sendWaveformStep(waveform, interval);
  }

  async sendWaveformStep(waveform, interval) {
    if (!this.waveformRunning) {
      return;
    }

    if (!this.controller.connected) {
      this.stopWaveformInternal();
      this.setAction("设备已断开，波形停止", "error");
      this.update();
      return;
    }

    if (Date.now() >= this.waveformEndTime) {
      this.stopWaveformInternal();
      this.setAction("波形执行完成：" + waveform.name, "success");
      this.update();
      return;
    }

    const data = waveform.data[this.waveformIndex % waveform.data.length];

    try {
      if (this.waveformChannel === "A") {
        await this.controller.setWaveformA(data[0], data[1], data[2]);
      } else if (this.waveformChannel === "B") {
        await this.controller.setWaveformB(data[0], data[1], data[2]);
      } else if (this.waveformChannel === "AB") {
        await this.controller.setWaveformA(data[0], data[1], data[2]);
        await this.controller.setWaveformB(data[0], data[1], data[2]);
      } else {
        throw new Error("未知波形激活通道：" + String(this.waveformChannel));
      }

      this.lastRaw = data
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(" ");

      this.waveformIndex++;
      this.update();
    } catch (error) {
      this.stopWaveformInternal();
      throw error;
    }

    if (!this.waveformRunning) {
      return;
    }

    this.waveformTimer = setTimeout(() => {
      this.sendWaveformStep(waveform, interval).catch((error) => {
        console.error("Waveform step error:", error);
        this.stopWaveformInternal();
        this.setAction(
          "波形执行失败：" + String(error.message || error),
          "error"
        );
        this.update();
      });
    }, interval);
  }

  stopWaveformInternal() {
    this.waveformRunning = false;

    if (this.waveformTimer) {
      clearTimeout(this.waveformTimer);
      this.waveformTimer = null;
    }

    this.waveformIndex = 0;
    this.waveformName = "--";
    this.waveformEndTime = 0;
  }

  setAction(text, type) {
    this.lastAction = text;
    this.lastActionType = type || "info";
  }

  setErrorCount(count) {
    this.errorCount = count;
    this.update();
  }

  update() {
    if (!this.view) {
      return;
    }

    const controller = this.controller;

    this.view.webview.postMessage({
      command: "state",
      state: {
        connected: !!controller.connected,
        battery: controller.battery,
        active: !!controller.active,
        channelA: controller.channelA == null ? 0 : controller.channelA,
        channelB: controller.channelB == null ? 0 : controller.channelB,
        errorCount: this.errorCount,
        deviceName: controller.device ? controller.device.name : null,
        lastAction: this.lastAction,
        lastActionType: this.lastActionType,
        lastRaw: this.lastRaw,
        waveformRunning: this.waveformRunning,
        waveformName: this.waveformName,
        waveformChannel: this.waveformChannel,
        punishConfig: this.punishConfig,
      },
    });
  }

  getHtml() {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
body { padding: 10px; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font-family: var(--vscode-font-family); font-size: 13px; }
h2 { margin: 0 0 12px 0; font-size: 18px; }
.card { padding: 10px; margin-bottom: 8px; border-radius: 6px; background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); }
.title { font-size: 12px; font-weight: 600; color: var(--vscode-descriptionForeground); margin-bottom: 7px; }
.row { display: flex; justify-content: space-between; align-items: center; margin: 6px 0; }
.value { font-weight: 600; }
.connected { color: var(--vscode-testing-iconPassed); }
.disconnected { color: var(--vscode-testing-iconFailed); }
.working { color: var(--vscode-charts-yellow); }
.success { color: var(--vscode-testing-iconPassed); }
.error { color: var(--vscode-testing-iconFailed); }
.channel { padding: 8px; margin-top: 6px; border-radius: 5px; background: var(--vscode-input-background); }
.channel-header { display: flex; justify-content: space-between; }
.channel-name { font-weight: 600; }
.channel-value { font-size: 16px; font-weight: 700; }
input, select { width: 100px; box-sizing: border-box; padding: 4px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 3px; }
select { width: 100%; }
button { width: 100%; padding: 7px; margin-top: 5px; border: none; border-radius: 4px; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
button:hover { background: var(--vscode-button-hoverBackground); }
button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
button.danger { background: var(--vscode-testing-iconFailed); color: white; }
button:disabled { opacity: 0.5; cursor: default; }
.status-box { padding: 8px; border-radius: 5px; background: var(--vscode-input-background); border-left: 3px solid var(--vscode-textLink-foreground); word-break: break-word; }
.big-number { font-size: 20px; font-weight: 700; }
.raw { margin-top: 7px; font-family: var(--vscode-editor-font-family); font-size: 11px; word-break: break-all; color: var(--vscode-descriptionForeground); }
.hint { margin-top: 6px; font-size: 11px; color: var(--vscode-descriptionForeground); }
.wave-running { padding: 7px; margin-top: 7px; border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-charts-yellow); }
</style>
</head>
<body>
<h2>Coyote 2.0</h2>

<div class="card">
<div class="title">设备状态</div>
<div class="row"><span>连接</span><span id="status" class="value disconnected">○ 未连接</span></div>
<div class="row"><span>设备</span><span id="device" class="value">--</span></div>
<div class="row"><span>电量</span><span id="battery" class="value">--</span></div>
</div>

<div class="card">
<div class="title">当前通道</div>
<div class="channel"><div class="channel-header"><span class="channel-name">Channel A</span><span id="currentA" class="channel-value">0</span></div></div>
<div class="channel"><div class="channel-header"><span class="channel-name">Channel B</span><span id="currentB" class="channel-value">0</span></div></div>
</div>

<div class="card">
<div class="title">设置 A / B 强度</div>
<div class="row"><span>A</span><input id="intensityA" type="number" min="0" max="200" value="0"></div>
<div class="row"><span>B</span><input id="intensityB" type="number" min="0" max="200" value="0"></div>
<button id="setIntensityButton">设置 A / B</button>
<button id="readIntensityButton" class="secondary">从设备读取</button>
</div>

<div class="card">
<div class="title">惩罚配置</div>
<div class="row"><span>基础强度</span><input id="punishIntensity" type="number" min="0" max="200" value="50"></div>
<div class="row"><span>基础时长 (ms)</span><input id="punishDuration" type="number" min="100" max="30000" step="100" value="1000"></div>
<div class="row"><span>惩罚波形</span></div>
<select id="punishWaveform">
<option value="frequencySweep">频率递增</option>
<option value="frequencyAlternate">双频切换</option>
<option value="thrust">推力变化</option>
</select>
<div class="hint">强度/时长会根据错误数量自动阶梯递增，受 VS Code 设置中的上限钳制。</div>
</div>

<div class="card">
<div class="title">波形控制</div>
<div class="row"><span>波形</span></div>
<select id="waveform">
<option value="frequencySweep">频率递增</option>
<option value="frequencyAlternate">双频切换</option>
<option value="thrust">推力变化</option>
</select>
<div class="row"><span>激活通道</span></div>
<select id="waveformChannel">
<option value="A">A 通道</option>
<option value="B">B 通道</option>
<option value="AB">A + B 全部激活</option>
</select>
<div class="row"><span>持续时长</span><input id="duration" type="number" min="100" max="30000" step="100" value="5000"></div>
<div class="row"><span>步进间隔</span><input id="interval" type="number" min="20" max="5000" step="10" value="100"></div>
<div class="hint">波形数据将发送到选择的通道；A+B 会同时发送到两个通道</div>
<button id="startWaveformButton">开始波形</button>
<button id="stopWaveformButton" class="danger">停止波形</button>
<div id="waveformStatus" class="wave-running" style="display:none;">波形运行中</div>
</div>

<div class="card">
<div class="title">VS Code</div>
<div class="row"><span>Error 数量</span><span id="errors" class="big-number">0</span></div>
</div>

<div class="card">
<div class="title">操作</div>
<button id="connectButton">连接 Coyote 2.0</button>
<button id="batteryButton" class="secondary">读取电量</button>
<button id="disconnectButton" class="secondary">断开连接</button>
<button id="testButton">手动测试</button>
<button id="stopButton" class="danger">■ 紧急停止</button>
</div>

<div class="card">
<div class="title">最近操作</div>
<div id="lastAction" class="status-box">等待操作</div>
<div id="rawBox" class="raw">BLE Raw: --</div>
</div>

<script>
const vscode = acquireVsCodeApi();
function send(command, data) {
  vscode.postMessage(Object.assign({ command: command }, data || {}));
}

document.getElementById("connectButton").addEventListener("click", function() { send("connect"); });
document.getElementById("batteryButton").addEventListener("click", function() { send("battery"); });
document.getElementById("disconnectButton").addEventListener("click", function() { send("disconnect"); });

document.getElementById("setIntensityButton").addEventListener("click", function() {
  var a = Number(document.getElementById("intensityA").value);
  var b = Number(document.getElementById("intensityB").value);
  send("setIntensity", { a: a, b: b });
});

document.getElementById("readIntensityButton").addEventListener("click", function() { send("readIntensity"); });

document.getElementById("startWaveformButton").addEventListener("click", function() {
  send("startWaveform", {
    waveform: document.getElementById("waveform").value,
    channel: document.getElementById("waveformChannel").value,
    duration: Number(document.getElementById("duration").value),
    interval: Number(document.getElementById("interval").value)
  });
});

document.getElementById("stopWaveformButton").addEventListener("click", function() { send("stopWaveform"); });

document.getElementById("testButton").addEventListener("click", function() {
  var intensityA = Number(document.getElementById("intensityA").value) || 0;
  var duration = Number(document.getElementById("duration").value) || 1000;
  send("test", { intensity: intensityA, durationMs: duration });
});

document.getElementById("stopButton").addEventListener("click", function() { send("stop"); });

function syncPunishConfig() {
  send("updatePunishConfig", {
    intensity: Number(document.getElementById("punishIntensity").value) || 0,
    durationMs: Number(document.getElementById("punishDuration").value) || 1000,
    waveformName: document.getElementById("punishWaveform").value
  });
}
document.getElementById("punishIntensity").addEventListener("change", syncPunishConfig);
document.getElementById("punishDuration").addEventListener("change", syncPunishConfig);
document.getElementById("punishWaveform").addEventListener("change", syncPunishConfig);

window.addEventListener("message", function(event) {
  var message = event.data;
  if (message.command !== "state") { return; }
  var state = message.state;

  var status = document.getElementById("status");
  if (state.connected) {
    status.textContent = "● 已连接";
    status.className = "value connected";
  } else {
    status.textContent = "○ 未连接";
    status.className = "value disconnected";
  }

  document.getElementById("device").textContent = state.deviceName || "--";
  document.getElementById("battery").textContent = (state.battery == null ? "--" : String(state.battery) + "%");
  document.getElementById("currentA").textContent = (state.channelA == null ? "0" : String(state.channelA));
  document.getElementById("currentB").textContent = (state.channelB == null ? "0" : String(state.channelB));
  document.getElementById("errors").textContent = (state.errorCount == null ? "0" : String(state.errorCount));

  var action = document.getElementById("lastAction");
  action.textContent = (state.lastAction || "等待操作");
  action.className = "status-box " + (state.lastActionType || "info");
  document.getElementById("rawBox").textContent = "BLE Raw: " + (state.lastRaw || "--");

  var waveformChannel = document.getElementById("waveformChannel");
  if (state.waveformChannel) { waveformChannel.value = state.waveformChannel; }

  var waveformStatus = document.getElementById("waveformStatus");
  if (state.waveformRunning) {
    waveformStatus.style.display = "block";
    var channelText = state.waveformChannel === "AB" ? "A + B" : (state.waveformChannel || "A");
    waveformStatus.textContent = "波形运行中：" + (state.waveformName || "--") + "，通道：" + channelText;
  } else {
    waveformStatus.style.display = "none";
  }

  if (state.punishConfig) {
    document.getElementById("punishIntensity").value = state.punishConfig.intensity;
    document.getElementById("punishDuration").value = state.punishConfig.durationMs;
    document.getElementById("punishWaveform").value = state.punishConfig.waveformName || "frequencySweep";
  }
});
</script>
</body>
</html>`;
  }
}


module.exports = {
  CoyoteSidebarProvider,
};
