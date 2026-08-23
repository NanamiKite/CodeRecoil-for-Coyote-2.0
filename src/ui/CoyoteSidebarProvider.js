// const vscode = require("vscode");

// class CoyoteSidebarProvider {
//     constructor(extensionUri, controller) {
//         this.extensionUri = extensionUri;
//         this.controller = controller;
//         this.view = undefined;

//         this.errorCount = 0;

//         this.lastAction = "等待操作";
//         this.lastActionType = "info";
//         this.lastRaw = "--";

//         // 波形执行状态
//         this.waveformRunning = false;
//         this.waveformTimer = null;
//         this.waveformIndex = 0;
//         this.waveformEndTime = 0;
//         this.waveformName = "--";
//     }

//     resolveWebviewView(webviewView) {
//         console.log("CoyoteSidebarProvider.resolveWebviewView()");

//         this.view = webviewView;

//         webviewView.webview.options = {
//             enableScripts: true,
//             localResourceRoots: [
//                 this.extensionUri
//             ]
//         };

//         webviewView.webview.html = this.getHtml();

//         webviewView.webview.onDidReceiveMessage(
//             async (message) => {
//                 console.log("[Coyote UI]", message.command, message);

//                 try {
//                     switch (message.command) {

//                         case "connect":

//                             this.setAction(
//                                 "正在连接 Coyote 2.0...",
//                                 "working"
//                             );

//                             this.update();

//                             await this.controller.connect();

//                             this.setAction(
//                                 "Coyote 2.0 已连接",
//                                 "success"
//                             );

//                             this.update();

//                             break;


//                         case "disconnect":

//                             this.stopWaveformInternal();

//                             this.setAction(
//                                 "正在断开连接...",
//                                 "working"
//                             );

//                             this.update();

//                             await this.controller.disconnect();

//                             this.setAction(
//                                 "设备已断开",
//                                 "success"
//                             );

//                             this.update();

//                             break;


//                         case "battery":

//                             this.setAction(
//                                 "正在读取电量...",
//                                 "working"
//                             );

//                             this.update();

//                             await this.controller.readBattery();

//                             this.setAction(
//                                 "电量：" +
//                                 String(this.controller.battery) +
//                                 "%",
//                                 "success"
//                             );

//                             this.update();

//                             break;


//                         case "setIntensity": {

//                             const a = Number(message.a);
//                             const b = Number(message.b);

//                             if (!Number.isInteger(a) ||
//                                 !Number.isInteger(b)) {

//                                 throw new Error(
//                                     "A / B 强度必须是整数"
//                                 );
//                             }

//                             if (a < 0 || a > 2047 ||
//                                 b < 0 || b > 2047) {

//                                 throw new Error(
//                                     "强度范围必须是 0 ~ 2047"
//                                 );
//                             }

//                             this.setAction(
//                                 "正在设置 A=" +
//                                 String(a) +
//                                 "，B=" +
//                                 String(b) +
//                                 "...",
//                                 "working"
//                             );

//                             this.update();

//                             await this.controller.setIntensity(
//                                 a,
//                                 b
//                             );

//                             this.setAction(
//                                 "已设置 A=" +
//                                 String(a) +
//                                 "，B=" +
//                                 String(b),
//                                 "success"
//                             );

//                             this.lastRaw =
//                                 this.controller.lastIntensityRaw ||
//                                 "--";

//                             this.update();

//                             break;
//                         }


//                         case "readIntensity":

//                             this.setAction(
//                                 "正在读取 A/B 强度...",
//                                 "working"
//                             );

//                             this.update();

//                             await this.controller.readIntensity();

//                             this.setAction(
//                                 "读取成功：A=" +
//                                 String(this.controller.channelA) +
//                                 "，B=" +
//                                 String(this.controller.channelB),
//                                 "success"
//                             );

//                             this.lastRaw =
//                                 this.controller.lastIntensityRaw ||
//                                 "--";

//                             this.update();

//                             break;


//                         case "test":

//                             this.setAction(
//                                 "正在执行手动测试...",
//                                 "working"
//                             );

//                             this.update();

//                             await this.controller.test();

//                             this.setAction(
//                                 "手动测试完成",
//                                 "success"
//                             );

//                             this.update();

//                             break;


//                         case "stop":

//                             this.stopWaveformInternal();

//                             this.setAction(
//                                 "正在执行紧急停止...",
//                                 "working"
//                             );

//                             this.update();

//                             await this.controller.emergencyStop();

//                             this.setAction(
//                                 "已执行紧急停止",
//                                 "success"
//                             );

//                             this.update();

//                             break;


//                         case "startWaveform": {

//                             const waveformName =
//                                 String(message.waveform || "");

//                             const duration =
//                                 Number(message.duration);

//                             const interval =
//                                 Number(message.interval || 100);

//                             if (!Number.isInteger(duration) ||
//                                 duration <= 0) {

//                                 throw new Error(
//                                     "持续时长必须是正整数"
//                                 );
//                             }

//                             if (duration > 30000) {

//                                 throw new Error(
//                                     "持续时长不能超过 30000 ms"
//                                 );
//                             }

//                             if (!Number.isInteger(interval) ||
//                                 interval < 20 ||
//                                 interval > 5000) {

//                                 throw new Error(
//                                     "波形间隔必须在 20 ~ 5000 ms"
//                                 );
//                             }

//                             if (!this.controller.connected) {

//                                 throw new Error(
//                                     "请先连接 Coyote 2.0"
//                                 );
//                             }

//                             this.startWaveform(
//                                 waveformName,
//                                 duration,
//                                 interval
//                             );

//                             break;
//                         }


//                         case "stopWaveform":

//                             this.stopWaveformInternal();

//                             this.setAction(
//                                 "波形已停止",
//                                 "success"
//                             );

//                             this.update();

//                             break;


//                         default:

//                             console.warn(
//                                 "Unknown Coyote UI command:",
//                                 message.command
//                             );
//                     }

//                 } catch (error) {

//                     console.error(
//                         "Coyote command error:",
//                         error
//                     );

//                     this.stopWaveformInternal();

//                     this.setAction(
//                         "操作失败：" +
//                         String(error.message || error),
//                         "error"
//                     );

//                     this.update();

//                     vscode.window.showErrorMessage(
//                         "Coyote: " +
//                         String(error.message || error)
//                     );
//                 }
//             }
//         );

//         this.update();
//     }


//     /*
//      * 内置波形
//      *
//      * 每个元素都是设备要求的 3 字节：
//      *
//      * [byte0, byte1, byte2]
//      *
//      * 这些数据属于 PWM_A34 / PWM_B34 波形数据，
//      * 与 PWM_AB2 的 A/B 强度数据完全分开。
//      */
//     getWaveforms() {

//         return {

//             frequencySweep: {
//                 name: "频率递增",
//                 description: "频率逐步变化",
//                 data: [
//                     [5, 135, 20],
//                     [5, 125, 20],
//                     [5, 115, 20],
//                     [5, 105, 20],
//                     [5, 95, 20],
//                     [4, 86, 20],
//                     [4, 76, 20],
//                     [4, 66, 20],
//                     [3, 57, 20],
//                     [3, 47, 20],
//                     [3, 37, 20],
//                     [2, 28, 20],
//                     [2, 18, 20],
//                     [1, 14, 20],
//                     [1, 9, 20]
//                 ]
//             },

//             frequencyAlternate: {
//                 name: "双频切换",
//                 description: "两个频率之间周期切换",
//                 data: [
//                     [5, 95, 20],
//                     [5, 95, 20],
//                     [5, 95, 20],
//                     [5, 95, 20],
//                     [5, 95, 20],
//                     [1, 9, 20],
//                     [1, 9, 20],
//                     [1, 9, 20],
//                     [1, 9, 20],
//                     [1, 9, 20]
//                 ]
//             },

//             thrust: {
//                 name: "推力变化",
//                 description: "频率基本不变，脉冲宽度变化",
//                 data: [
//                     [1, 9, 4],
//                     [1, 9, 8],
//                     [1, 9, 12],
//                     [1, 9, 16],
//                     [1, 9, 18],
//                     [1, 9, 19],
//                     [1, 9, 20],
//                     [1, 9, 0],
//                     [1, 9, 0],
//                     [1, 9, 0]
//                 ]
//             }
//         };
//     }


//     /*
//      * 开始波形
//      */
//     startWaveform(name, duration, interval) {

//         const waveforms = this.getWaveforms();

//         const waveform = waveforms[name];

//         if (!waveform) {

//             throw new Error(
//                 "未知波形：" + name
//             );
//         }

//         this.stopWaveformInternal();

//         this.waveformRunning = true;
//         this.waveformIndex = 0;
//         this.waveformName = waveform.name;

//         this.waveformEndTime =
//             Date.now() + duration;

//         this.setAction(
//             "正在执行波形：" +
//             waveform.name +
//             "（" +
//             String(duration) +
//             " ms）",
//             "working"
//         );

//         this.update();

//         /*
//          * 立即发送第一个数据。
//          */
//         this.sendWaveformStep(
//             waveform,
//             interval
//         );
//     }


//     /*
//      * 发送一个波形步骤
//      */
//     async sendWaveformStep(waveform, interval) {

//         if (!this.waveformRunning) {
//             return;
//         }

//         if (!this.controller.connected) {

//             this.stopWaveformInternal();

//             this.setAction(
//                 "设备已断开，波形停止",
//                 "error"
//             );

//             this.update();

//             return;
//         }

//         if (Date.now() >= this.waveformEndTime) {

//             this.stopWaveformInternal();

//             this.setAction(
//                 "波形执行完成：" +
//                 waveform.name,
//                 "success"
//             );

//             this.update();

//             return;
//         }

//         const data =
//             waveform.data[
//                 this.waveformIndex %
//                 waveform.data.length
//             ];

//         try {

//             /*
//              * 波形数据写入独立的波形特性。
//              *
//              * controller.setWaveform(data)
//              * 负责真正的 BLE 写入。
//              */
//             await this.controller.setWaveform(data);

//             this.lastRaw =
//                 data
//                     .map(function (value) {
//                         return value
//                             .toString(16)
//                             .padStart(2, "0");
//                     })
//                     .join(" ");

//             this.waveformIndex++;

//             this.update();

//         } catch (error) {

//             this.stopWaveformInternal();

//             throw error;
//         }

//         if (!this.waveformRunning) {
//             return;
//         }

//         this.waveformTimer = setTimeout(
//             () => {
//                 this.sendWaveformStep(
//                     waveform,
//                     interval
//                 );
//             },
//             interval
//         );
//     }


//     /*
//      * 停止波形。
//      *
//      * 这里只停止波形定时器，
//      * 不改变原有 emergencyStop() 行为。
//      */
//     stopWaveformInternal() {

//         this.waveformRunning = false;

//         if (this.waveformTimer) {

//             clearTimeout(
//                 this.waveformTimer
//             );

//             this.waveformTimer = null;
//         }

//         this.waveformIndex = 0;
//         this.waveformName = "--";
//         this.waveformEndTime = 0;
//     }


//     setAction(text, type) {

//         this.lastAction = text;
//         this.lastActionType = type || "info";
//     }


//     setErrorCount(count) {

//         this.errorCount = count;
//         this.update();
//     }


//     update() {

//         if (!this.view) {
//             return;
//         }

//         const controller = this.controller;

//         this.view.webview.postMessage({

//             command: "state",

//             state: {

//                 connected:
//                     !!controller.connected,

//                 battery:
//                     controller.battery,

//                 active:
//                     !!controller.active,

//                 channelA:
//                     controller.channelA == null
//                         ? 0
//                         : controller.channelA,

//                 channelB:
//                     controller.channelB == null
//                         ? 0
//                         : controller.channelB,

//                 errorCount:
//                     this.errorCount,

//                 deviceName:
//                     controller.device
//                         ? controller.device.name
//                         : null,

//                 lastAction:
//                     this.lastAction,

//                 lastActionType:
//                     this.lastActionType,

//                 lastRaw:
//                     this.lastRaw,

//                 waveformRunning:
//                     this.waveformRunning,

//                 waveformName:
//                     this.waveformName
//             }
//         });
//     }


//     getHtml() {

//         return '<!DOCTYPE html>' +
//         '<html>' +
//         '<head>' +

//         '<meta charset="UTF-8">' +

//         '<style>' +

//         'body {' +
//             'padding: 10px;' +
//             'color: var(--vscode-foreground);' +
//             'background: var(--vscode-sideBar-background);' +
//             'font-family: var(--vscode-font-family);' +
//             'font-size: 13px;' +
//         '}' +

//         'h2 {' +
//             'margin: 0 0 12px 0;' +
//             'font-size: 18px;' +
//         '}' +

//         '.card {' +
//             'padding: 10px;' +
//             'margin-bottom: 8px;' +
//             'border-radius: 6px;' +
//             'background: var(--vscode-textCodeBlock-background);' +
//             'border: 1px solid var(--vscode-panel-border);' +
//         '}' +

//         '.title {' +
//             'font-size: 12px;' +
//             'font-weight: 600;' +
//             'color: var(--vscode-descriptionForeground);' +
//             'margin-bottom: 7px;' +
//         '}' +

//         '.row {' +
//             'display: flex;' +
//             'justify-content: space-between;' +
//             'align-items: center;' +
//             'margin: 6px 0;' +
//         '}' +

//         '.value {' +
//             'font-weight: 600;' +
//         '}' +

//         '.connected {' +
//             'color: var(--vscode-testing-iconPassed);' +
//         '}' +

//         '.disconnected {' +
//             'color: var(--vscode-testing-iconFailed);' +
//         '}' +

//         '.working {' +
//             'color: var(--vscode-charts-yellow);' +
//         '}' +

//         '.success {' +
//             'color: var(--vscode-testing-iconPassed);' +
//         '}' +

//         '.error {' +
//             'color: var(--vscode-testing-iconFailed);' +
//         '}' +

//         '.channel {' +
//             'padding: 8px;' +
//             'margin-top: 6px;' +
//             'border-radius: 5px;' +
//             'background: var(--vscode-input-background);' +
//         '}' +

//         '.channel-header {' +
//             'display: flex;' +
//             'justify-content: space-between;' +
//         '}' +

//         '.channel-name {' +
//             'font-weight: 600;' +
//         '}' +

//         '.channel-value {' +
//             'font-size: 16px;' +
//             'font-weight: 700;' +
//         '}' +

//         'input, select {' +
//             'width: 100px;' +
//             'box-sizing: border-box;' +
//             'padding: 4px;' +
//             'color: var(--vscode-input-foreground);' +
//             'background: var(--vscode-input-background);' +
//             'border: 1px solid var(--vscode-input-border);' +
//             'border-radius: 3px;' +
//         '}' +

//         'select {' +
//             'width: 100%;' +
//         '}' +

//         'button {' +
//             'width: 100%;' +
//             'padding: 7px;' +
//             'margin-top: 5px;' +
//             'border: none;' +
//             'border-radius: 4px;' +
//             'cursor: pointer;' +
//             'color: var(--vscode-button-foreground);' +
//             'background: var(--vscode-button-background);' +
//         '}' +

//         'button:hover {' +
//             'background: var(--vscode-button-hoverBackground);' +
//         '}' +

//         'button.secondary {' +
//             'color: var(--vscode-button-secondaryForeground);' +
//             'background: var(--vscode-button-secondaryBackground);' +
//         '}' +

//         'button.danger {' +
//             'background: var(--vscode-testing-iconFailed);' +
//             'color: white;' +
//         '}' +

//         'button:disabled {' +
//             'opacity: 0.5;' +
//             'cursor: default;' +
//         '}' +

//         '.status-box {' +
//             'padding: 8px;' +
//             'border-radius: 5px;' +
//             'background: var(--vscode-input-background);' +
//             'border-left: 3px solid var(--vscode-textLink-foreground);' +
//             'word-break: break-word;' +
//         '}' +

//         '.big-number {' +
//             'font-size: 20px;' +
//             'font-weight: 700;' +
//         '}' +

//         '.raw {' +
//             'margin-top: 7px;' +
//             'font-family: var(--vscode-editor-font-family);' +
//             'font-size: 11px;' +
//             'word-break: break-all;' +
//             'color: var(--vscode-descriptionForeground);' +
//         '}' +

//         '.hint {' +
//             'margin-top: 6px;' +
//             'font-size: 11px;' +
//             'color: var(--vscode-descriptionForeground);' +
//         '}' +

//         '.wave-running {' +
//             'padding: 7px;' +
//             'margin-top: 7px;' +
//             'border-radius: 4px;' +
//             'background: var(--vscode-input-background);' +
//             'color: var(--vscode-charts-yellow);' +
//         '}' +

//         '</style>' +

//         '</head>' +

//         '<body>' +

//         '<h2>Coyote 2.0</h2>' +


//         '<div class="card">' +

//             '<div class="title">设备状态</div>' +

//             '<div class="row">' +
//                 '<span>连接</span>' +
//                 '<span id="status" class="value disconnected">' +
//                     '○ 未连接' +
//                 '</span>' +
//             '</div>' +

//             '<div class="row">' +
//                 '<span>设备</span>' +
//                 '<span id="device" class="value">--</span>' +
//             '</div>' +

//             '<div class="row">' +
//                 '<span>电量</span>' +
//                 '<span id="battery" class="value">--</span>' +
//             '</div>' +

//         '</div>' +


//         '<div class="card">' +

//             '<div class="title">当前通道</div>' +

//             '<div class="channel">' +
//                 '<div class="channel-header">' +
//                     '<span class="channel-name">Channel A</span>' +
//                     '<span id="currentA" class="channel-value">0</span>' +
//                 '</div>' +
//             '</div>' +

//             '<div class="channel">' +
//                 '<div class="channel-header">' +
//                     '<span class="channel-name">Channel B</span>' +
//                     '<span id="currentB" class="channel-value">0</span>' +
//                 '</div>' +
//             '</div>' +

//         '</div>' +


//         '<div class="card">' +

//             '<div class="title">设置 A / B 强度</div>' +

//             '<div class="row">' +
//                 '<span>A</span>' +
//                 '<input id="intensityA" type="number" min="0" max="2047" value="0">' +
//             '</div>' +

//             '<div class="row">' +
//                 '<span>B</span>' +
//                 '<input id="intensityB" type="number" min="0" max="2047" value="0">' +
//             '</div>' +

//             '<button id="setIntensityButton">设置 A / B</button>' +

//             '<button id="readIntensityButton" class="secondary">' +
//                 '从设备读取' +
//             '</button>' +

//         '</div>' +


//         '<div class="card">' +

//             '<div class="title">波形控制</div>' +

//             '<div class="row">' +
//                 '<span>波形</span>' +
//             '</div>' +

//             '<select id="waveform">' +
//                 '<option value="frequencySweep">频率递增</option>' +
//                 '<option value="frequencyAlternate">双频切换</option>' +
//                 '<option value="thrust">推力变化</option>' +
//             '</select>' +

//             '<div class="row">' +
//                 '<span>持续时长</span>' +
//                 '<input id="duration" type="number" min="100" max="30000" step="100" value="5000">' +
//             '</div>' +

//             '<div class="row">' +
//                 '<span>步进间隔</span>' +
//                 '<input id="interval" type="number" min="20" max="5000" step="10" value="100">' +
//             '</div>' +

//             '<div class="hint">' +
//                 '默认每 100 ms 发送一次波形数据' +
//             '</div>' +

//             '<button id="startWaveformButton">' +
//                 '开始波形' +
//             '</button>' +

//             '<button id="stopWaveformButton" class="danger">' +
//                 '停止波形' +
//             '</button>' +

//             '<div id="waveformStatus" class="wave-running" style="display:none;">' +
//                 '波形运行中' +
//             '</div>' +

//         '</div>' +


//         '<div class="card">' +

//             '<div class="title">VS Code</div>' +

//             '<div class="row">' +
//                 '<span>Error 数量</span>' +
//                 '<span id="errors" class="big-number">0</span>' +
//             '</div>' +

//         '</div>' +


//         '<div class="card">' +

//             '<div class="title">操作</div>' +

//             '<button id="connectButton">' +
//                 '连接 Coyote 2.0' +
//             '</button>' +

//             '<button id="batteryButton" class="secondary">' +
//                 '读取电量' +
//             '</button>' +

//             '<button id="disconnectButton" class="secondary">' +
//                 '断开连接' +
//             '</button>' +

//             '<button id="testButton">' +
//                 '手动测试' +
//             '</button>' +

//             '<button id="stopButton" class="danger">' +
//                 '■ 紧急停止' +
//             '</button>' +

//         '</div>' +


//         '<div class="card">' +

//             '<div class="title">最近操作</div>' +

//             '<div id="lastAction" class="status-box">' +
//                 '等待操作' +
//             '</div>' +

//             '<div id="rawBox" class="raw">' +
//                 'BLE Raw: --' +
//             '</div>' +

//         '</div>' +


//         '<script>' +

//         'const vscode = acquireVsCodeApi();' +

//         'function send(command, data) {' +
//             'vscode.postMessage(Object.assign({' +
//                 'command: command' +
//             '}, data || {}));' +
//         '}' +


//         'document.getElementById("connectButton")' +
//         '.addEventListener("click", function() {' +
//             'send("connect");' +
//         '});' +


//         'document.getElementById("batteryButton")' +
//         '.addEventListener("click", function() {' +
//             'send("battery");' +
//         '});' +


//         'document.getElementById("disconnectButton")' +
//         '.addEventListener("click", function() {' +
//             'send("disconnect");' +
//         '});' +


//         'document.getElementById("setIntensityButton")' +
//         '.addEventListener("click", function() {' +

//             'var a = Number(' +
//                 'document.getElementById("intensityA").value' +
//             ');' +

//             'var b = Number(' +
//                 'document.getElementById("intensityB").value' +
//             ');' +

//             'send("setIntensity", {' +
//                 'a: a,' +
//                 'b: b' +
//             '});' +

//         '});' +


//         'document.getElementById("readIntensityButton")' +
//         '.addEventListener("click", function() {' +
//             'send("readIntensity");' +
//         '});' +


//         'document.getElementById("startWaveformButton")' +
//         '.addEventListener("click", function() {' +

//             'var waveform =' +
//                 'document.getElementById("waveform").value;' +

//             'var duration = Number(' +
//                 'document.getElementById("duration").value' +
//             ');' +

//             'var interval = Number(' +
//                 'document.getElementById("interval").value' +
//             ');' +

//             'send("startWaveform", {' +
//                 'waveform: waveform,' +
//                 'duration: duration,' +
//                 'interval: interval' +
//             '});' +

//         '});' +


//         'document.getElementById("stopWaveformButton")' +
//         '.addEventListener("click", function() {' +
//             'send("stopWaveform");' +
//         '});' +


//         'document.getElementById("testButton")' +
//         '.addEventListener("click", function() {' +
//             'send("test");' +
//         '});' +


//         'document.getElementById("stopButton")' +
//         '.addEventListener("click", function() {' +
//             'send("stop");' +
//         '});' +


//         'window.addEventListener("message", function(event) {' +

//             'var message = event.data;' +

//             'if (message.command !== "state") {' +
//                 'return;' +
//             '}' +

//             'var state = message.state;' +


//             'var status = document.getElementById("status");' +

//             'if (state.connected) {' +

//                 'status.textContent = "● 已连接";' +
//                 'status.className = "value connected";' +

//             '} else {' +

//                 'status.textContent = "○ 未连接";' +
//                 'status.className = "value disconnected";' +

//             '}' +


//             'document.getElementById("device").textContent =' +
//                 'state.deviceName || "--";' +


//             'document.getElementById("battery").textContent =' +
//                 '(state.battery == null ? "--" : String(state.battery) + "%");' +


//             'document.getElementById("currentA").textContent =' +
//                 '(state.channelA == null ? "0" : String(state.channelA));' +


//             'document.getElementById("currentB").textContent =' +
//                 '(state.channelB == null ? "0" : String(state.channelB));' +


//             'document.getElementById("errors").textContent =' +
//                 '(state.errorCount == null ? "0" : String(state.errorCount));' +


//             'var action = document.getElementById("lastAction");' +

//             'action.textContent =' +
//                 '(state.lastAction || "等待操作");' +

//             'action.className =' +
//                 '"status-box " + (state.lastActionType || "info");' +


//             'document.getElementById("rawBox").textContent =' +
//                 '"BLE Raw: " + (state.lastRaw || "--");' +


//             'var waveformStatus =' +
//                 'document.getElementById("waveformStatus");' +

//             'if (state.waveformRunning) {' +

//                 'waveformStatus.style.display = "block";' +

//                 'waveformStatus.textContent =' +
//                     '"波形运行中：" +' +
//                     '(state.waveformName || "--");' +

//             '} else {' +

//                 'waveformStatus.style.display = "none";' +

//             '}' +

//         '});' +

//         '</script>' +

//         '</body>' +

//         '</html>';
//     }
// }


// module.exports = {
//     CoyoteSidebarProvider
// };


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
         *
         * A  = 只输出 A
         * B  = 只输出 B
         * AB = A、B 同时输出
         *
         * 默认保持原来的行为：
         * 原来的波形始终发送到 A。
         */
        this.waveformChannel = "A";
    }


    resolveWebviewView(webviewView) {
        console.log("CoyoteSidebarProvider.resolveWebviewView()");

        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this.extensionUri
            ]
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                console.log("[Coyote UI]", message.command, message);

                try {
                    switch (message.command) {

                        case "connect":

                            this.setAction(
                                "正在连接 Coyote 2.0...",
                                "working"
                            );

                            this.update();

                            await this.controller.connect();

                            this.setAction(
                                "Coyote 2.0 已连接",
                                "success"
                            );

                            this.update();

                            break;


                        case "disconnect":

                            this.stopWaveformInternal();

                            this.setAction(
                                "正在断开连接...",
                                "working"
                            );

                            this.update();

                            await this.controller.disconnect();

                            this.setAction(
                                "设备已断开",
                                "success"
                            );

                            this.update();

                            break;


                        case "battery":

                            this.setAction(
                                "正在读取电量...",
                                "working"
                            );

                            this.update();

                            await this.controller.readBattery();

                            this.setAction(
                                "电量：" +
                                String(this.controller.battery) +
                                "%",
                                "success"
                            );

                            this.update();

                            break;


                        case "setIntensity": {

                            const a = Number(message.a);
                            const b = Number(message.b);

                            if (!Number.isInteger(a) ||
                                !Number.isInteger(b)) {

                                throw new Error(
                                    "A / B 强度必须是整数"
                                );
                            }

                            if (a < 0 || a > 2047 ||
                                b < 0 || b > 2047) {

                                throw new Error(
                                    "强度范围必须是 0 ~ 2047"
                                );
                            }

                            this.setAction(
                                "正在设置 A=" +
                                String(a) +
                                "，B=" +
                                String(b) +
                                "...",
                                "working"
                            );

                            this.update();

                            await this.controller.setIntensity(
                                a,
                                b
                            );

                            this.setAction(
                                "已设置 A=" +
                                String(a) +
                                "，B=" +
                                String(b),
                                "success"
                            );

                            this.lastRaw =
                                this.controller.lastIntensityRaw ||
                                "--";

                            this.update();

                            break;
                        }


                        case "readIntensity":

                            this.setAction(
                                "正在读取 A/B 强度...",
                                "working"
                            );

                            this.update();

                            await this.controller.readIntensity();

                            this.setAction(
                                "读取成功：A=" +
                                String(this.controller.channelA) +
                                "，B=" +
                                String(this.controller.channelB),
                                "success"
                            );

                            this.lastRaw =
                                this.controller.lastIntensityRaw ||
                                "--";

                            this.update();

                            break;


                        case "test":

                            this.setAction(
                                "正在执行手动测试...",
                                "working"
                            );

                            this.update();

                            await this.controller.test();

                            this.setAction(
                                "手动测试完成",
                                "success"
                            );

                            this.update();

                            break;


                        case "stop":

                            this.stopWaveformInternal();

                            this.setAction(
                                "正在执行紧急停止...",
                                "working"
                            );

                            this.update();

                            await this.controller.emergencyStop();

                            this.setAction(
                                "已执行紧急停止",
                                "success"
                            );

                            this.update();

                            break;


                        case "startWaveform": {

                            const waveformName =
                                String(message.waveform || "");

                            const duration =
                                Number(message.duration);

                            const interval =
                                Number(message.interval || 100);

                            const channel =
                                String(message.channel || "A")
                                    .toUpperCase();


                            if (!Number.isInteger(duration) ||
                                duration <= 0) {

                                throw new Error(
                                    "持续时长必须是正整数"
                                );
                            }


                            if (duration > 30000) {

                                throw new Error(
                                    "持续时长不能超过 30000 ms"
                                );
                            }


                            if (!Number.isInteger(interval) ||
                                interval < 20 ||
                                interval > 5000) {

                                throw new Error(
                                    "波形间隔必须在 20 ~ 5000 ms"
                                );
                            }


                            if (
                                channel !== "A" &&
                                channel !== "B" &&
                                channel !== "AB"
                            ) {

                                throw new Error(
                                    "波形激活通道必须是 A、B 或 AB"
                                );
                            }


                            if (!this.controller.connected) {

                                throw new Error(
                                    "请先连接 Coyote 2.0"
                                );
                            }


                            this.startWaveform(
                                waveformName,
                                duration,
                                interval,
                                channel
                            );

                            break;
                        }


                        case "stopWaveform":

                            this.stopWaveformInternal();

                            this.setAction(
                                "波形已停止",
                                "success"
                            );

                            this.update();

                            break;


                        default:

                            console.warn(
                                "Unknown Coyote UI command:",
                                message.command
                            );
                    }

                } catch (error) {

                    console.error(
                        "Coyote command error:",
                        error
                    );

                    this.stopWaveformInternal();

                    this.setAction(
                        "操作失败：" +
                        String(error.message || error),
                        "error"
                    );

                    this.update();

                    vscode.window.showErrorMessage(
                        "Coyote: " +
                        String(error.message || error)
                    );
                }
            }
        );

        this.update();
    }


    /*
     * 内置波形
     *
     * 每个元素都是设备要求的 3 字节：
     *
     * [byte0, byte1, byte2]
     *
     * 这些数据属于 PWM_A34 / PWM_B34 波形数据，
     * 与 PWM_AB2 的 A/B 强度数据完全分开。
     */
    getWaveforms() {

        return {

            frequencySweep: {
                name: "频率递增",
                description: "频率逐步变化",
                data: [
                    [5, 135, 20],
                    [5, 125, 20],
                    [5, 115, 20],
                    [5, 105, 20],
                    [5, 95, 20],
                    [4, 86, 20],
                    [4, 76, 20],
                    [4, 66, 20],
                    [3, 57, 20],
                    [3, 47, 20],
                    [3, 37, 20],
                    [2, 28, 20],
                    [2, 18, 20],
                    [1, 14, 20],
                    [1, 9, 20]
                ]
            },

            frequencyAlternate: {
                name: "双频切换",
                description: "两个频率之间周期切换",
                data: [
                    [5, 95, 20],
                    [5, 95, 20],
                    [5, 95, 20],
                    [5, 95, 20],
                    [5, 95, 20],
                    [1, 9, 20],
                    [1, 9, 20],
                    [1, 9, 20],
                    [1, 9, 20],
                    [1, 9, 20]
                ]
            },

            thrust: {
                name: "推力变化",
                description: "频率基本不变，脉冲宽度变化",
                data: [
                    [1, 9, 4],
                    [1, 9, 8],
                    [1, 9, 12],
                    [1, 9, 16],
                    [1, 9, 18],
                    [1, 9, 19],
                    [1, 9, 20],
                    [1, 9, 0],
                    [1, 9, 0],
                    [1, 9, 0]
                ]
            }
        };
    }


    /*
     * 开始波形
     *
     * channel:
     *
     * A  -> PWM_A34
     * B  -> PWM_B34
     * AB -> PWM_A34 + PWM_B34
     */
    startWaveform(
        name,
        duration,
        interval,
        channel
    ) {

        const waveforms = this.getWaveforms();

        const waveform = waveforms[name];

        if (!waveform) {

            throw new Error(
                "未知波形：" + name
            );
        }


        /*
         * 防止外部直接调用时传入非法通道。
         */
        channel =
            String(channel || "A")
                .toUpperCase();


        if (
            channel !== "A" &&
            channel !== "B" &&
            channel !== "AB"
        ) {

            throw new Error(
                "波形激活通道必须是 A、B 或 AB"
            );
        }


        this.stopWaveformInternal();

        this.waveformRunning = true;
        this.waveformIndex = 0;
        this.waveformName = waveform.name;
        this.waveformChannel = channel;

        this.waveformEndTime =
            Date.now() + duration;


        let channelText;

        if (channel === "A") {
            channelText = "A";
        } else if (channel === "B") {
            channelText = "B";
        } else {
            channelText = "A+B";
        }


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


        /*
         * 立即发送第一个数据。
         */
        this.sendWaveformStep(
            waveform,
            interval
        );
    }


    /*
     * 发送一个波形步骤
     */
    async sendWaveformStep(
        waveform,
        interval
    ) {

        if (!this.waveformRunning) {
            return;
        }


        if (!this.controller.connected) {

            this.stopWaveformInternal();

            this.setAction(
                "设备已断开，波形停止",
                "error"
            );

            this.update();

            return;
        }


        if (Date.now() >= this.waveformEndTime) {

            this.stopWaveformInternal();

            this.setAction(
                "波形执行完成：" +
                waveform.name,
                "success"
            );

            this.update();

            return;
        }


        const data =
            waveform.data[
                this.waveformIndex %
                waveform.data.length
            ];


        try {

            /*
             * 根据当前选择的通道发送波形。
             *
             * A:
             *     PWM_A34
             *
             * B:
             *     PWM_B34
             *
             * AB:
             *     PWM_A34
             *     PWM_B34
             */
            if (this.waveformChannel === "A") {

                await this.controller.setWaveformA(
                    data[0],
                    data[1],
                    data[2]
                );

            } else if (this.waveformChannel === "B") {

                await this.controller.setWaveformB(
                    data[0],
                    data[1],
                    data[2]
                );

            } else if (this.waveformChannel === "AB") {

                /*
                 * 两个通道发送完全相同的波形帧。
                 */
                await this.controller.setWaveformA(
                    data[0],
                    data[1],
                    data[2]
                );

                await this.controller.setWaveformB(
                    data[0],
                    data[1],
                    data[2]
                );

            } else {

                throw new Error(
                    "未知波形激活通道：" +
                    String(this.waveformChannel)
                );
            }


            this.lastRaw =
                data
                    .map(function (value) {
                        return value
                            .toString(16)
                            .padStart(2, "0");
                    })
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


        this.waveformTimer = setTimeout(
            () => {
                this.sendWaveformStep(
                    waveform,
                    interval
                ).catch(error => {

                    console.error(
                        "Waveform step error:",
                        error
                    );

                    this.stopWaveformInternal();

                    this.setAction(
                        "波形执行失败：" +
                        String(error.message || error),
                        "error"
                    );

                    this.update();
                });
            },
            interval
        );
    }


    /*
     * 停止波形。
     *
     * 这里只停止波形定时器，
     * 不改变原有 emergencyStop() 行为。
     */
    stopWaveformInternal() {

        this.waveformRunning = false;

        if (this.waveformTimer) {

            clearTimeout(
                this.waveformTimer
            );

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

                connected:
                    !!controller.connected,

                battery:
                    controller.battery,

                active:
                    !!controller.active,

                channelA:
                    controller.channelA == null
                        ? 0
                        : controller.channelA,

                channelB:
                    controller.channelB == null
                        ? 0
                        : controller.channelB,

                errorCount:
                    this.errorCount,

                deviceName:
                    controller.device
                        ? controller.device.name
                        : null,

                lastAction:
                    this.lastAction,

                lastActionType:
                    this.lastActionType,

                lastRaw:
                    this.lastRaw,

                waveformRunning:
                    this.waveformRunning,

                waveformName:
                    this.waveformName,

                /*
                 * 当前波形激活通道。
                 */
                waveformChannel:
                    this.waveformChannel
            }
        });
    }


    getHtml() {

        return '<!DOCTYPE html>' +
        '<html>' +
        '<head>' +

        '<meta charset="UTF-8">' +

        '<style>' +

        'body {' +
            'padding: 10px;' +
            'color: var(--vscode-foreground);' +
            'background: var(--vscode-sideBar-background);' +
            'font-family: var(--vscode-font-family);' +
            'font-size: 13px;' +
        '}' +

        'h2 {' +
            'margin: 0 0 12px 0;' +
            'font-size: 18px;' +
        '}' +

        '.card {' +
            'padding: 10px;' +
            'margin-bottom: 8px;' +
            'border-radius: 6px;' +
            'background: var(--vscode-textCodeBlock-background);' +
            'border: 1px solid var(--vscode-panel-border);' +
        '}' +

        '.title {' +
            'font-size: 12px;' +
            'font-weight: 600;' +
            'color: var(--vscode-descriptionForeground);' +
            'margin-bottom: 7px;' +
        '}' +

        '.row {' +
            'display: flex;' +
            'justify-content: space-between;' +
            'align-items: center;' +
            'margin: 6px 0;' +
        '}' +

        '.value {' +
            'font-weight: 600;' +
        '}' +

        '.connected {' +
            'color: var(--vscode-testing-iconPassed);' +
        '}' +

        '.disconnected {' +
            'color: var(--vscode-testing-iconFailed);' +
        '}' +

        '.working {' +
            'color: var(--vscode-charts-yellow);' +
        '}' +

        '.success {' +
            'color: var(--vscode-testing-iconPassed);' +
        '}' +

        '.error {' +
            'color: var(--vscode-testing-iconFailed);' +
        '}' +

        '.channel {' +
            'padding: 8px;' +
            'margin-top: 6px;' +
            'border-radius: 5px;' +
            'background: var(--vscode-input-background);' +
        '}' +

        '.channel-header {' +
            'display: flex;' +
            'justify-content: space-between;' +
        '}' +

        '.channel-name {' +
            'font-weight: 600;' +
        '}' +

        '.channel-value {' +
            'font-size: 16px;' +
            'font-weight: 700;' +
        '}' +

        'input, select {' +
            'width: 100px;' +
            'box-sizing: border-box;' +
            'padding: 4px;' +
            'color: var(--vscode-input-foreground);' +
            'background: var(--vscode-input-background);' +
            'border: 1px solid var(--vscode-input-border);' +
            'border-radius: 3px;' +
        '}' +

        'select {' +
            'width: 100%;' +
        '}' +

        'button {' +
            'width: 100%;' +
            'padding: 7px;' +
            'margin-top: 5px;' +
            'border: none;' +
            'border-radius: 4px;' +
            'cursor: pointer;' +
            'color: var(--vscode-button-foreground);' +
            'background: var(--vscode-button-background);' +
        '}' +

        'button:hover {' +
            'background: var(--vscode-button-hoverBackground);' +
        '}' +

        'button.secondary {' +
            'color: var(--vscode-button-secondaryForeground);' +
            'background: var(--vscode-button-secondaryBackground);' +
        '}' +

        'button.danger {' +
            'background: var(--vscode-testing-iconFailed);' +
            'color: white;' +
        '}' +

        'button:disabled {' +
            'opacity: 0.5;' +
            'cursor: default;' +
        '}' +

        '.status-box {' +
            'padding: 8px;' +
            'border-radius: 5px;' +
            'background: var(--vscode-input-background);' +
            'border-left: 3px solid var(--vscode-textLink-foreground);' +
            'word-break: break-word;' +
        '}' +

        '.big-number {' +
            'font-size: 20px;' +
            'font-weight: 700;' +
        '}' +

        '.raw {' +
            'margin-top: 7px;' +
            'font-family: var(--vscode-editor-font-family);' +
            'font-size: 11px;' +
            'word-break: break-all;' +
            'color: var(--vscode-descriptionForeground);' +
        '}' +

        '.hint {' +
            'margin-top: 6px;' +
            'font-size: 11px;' +
            'color: var(--vscode-descriptionForeground);' +
        '}' +

        '.wave-running {' +
            'padding: 7px;' +
            'margin-top: 7px;' +
            'border-radius: 4px;' +
            'background: var(--vscode-input-background);' +
            'color: var(--vscode-charts-yellow);' +
        '}' +

        '</style>' +

        '</head>' +

        '<body>' +

        '<h2>Coyote 2.0</h2>' +


        '<div class="card">' +

            '<div class="title">设备状态</div>' +

            '<div class="row">' +
                '<span>连接</span>' +
                '<span id="status" class="value disconnected">' +
                    '○ 未连接' +
                '</span>' +
            '</div>' +

            '<div class="row">' +
                '<span>设备</span>' +
                '<span id="device" class="value">--</span>' +
            '</div>' +

            '<div class="row">' +
                '<span>电量</span>' +
                '<span id="battery" class="value">--</span>' +
            '</div>' +

        '</div>' +


        '<div class="card">' +

            '<div class="title">当前通道</div>' +

            '<div class="channel">' +
                '<div class="channel-header">' +
                    '<span class="channel-name">Channel A</span>' +
                    '<span id="currentA" class="channel-value">0</span>' +
                '</div>' +
            '</div>' +

            '<div class="channel">' +
                '<div class="channel-header">' +
                    '<span class="channel-name">Channel B</span>' +
                    '<span id="currentB" class="channel-value">0</span>' +
                '</div>' +
            '</div>' +

        '</div>' +


        '<div class="card">' +

            '<div class="title">设置 A / B 强度</div>' +

            '<div class="row">' +
                '<span>A</span>' +
                '<input id="intensityA" type="number" min="0" max="2047" value="0">' +
            '</div>' +

            '<div class="row">' +
                '<span>B</span>' +
                '<input id="intensityB" type="number" min="0" max="2047" value="0">' +
            '</div>' +

            '<button id="setIntensityButton">设置 A / B</button>' +

            '<button id="readIntensityButton" class="secondary">' +
                '从设备读取' +
            '</button>' +

        '</div>' +


        '<div class="card">' +

            '<div class="title">波形控制</div>' +

            '<div class="row">' +
                '<span>波形</span>' +
            '</div>' +

            '<select id="waveform">' +
                '<option value="frequencySweep">频率递增</option>' +
                '<option value="frequencyAlternate">双频切换</option>' +
                '<option value="thrust">推力变化</option>' +
            '</select>' +


            '<div class="row">' +
                '<span>激活通道</span>' +
            '</div>' +

            '<select id="waveformChannel">' +
                '<option value="A">A 通道</option>' +
                '<option value="B">B 通道</option>' +
                '<option value="AB">A + B 全部激活</option>' +
            '</select>' +


            '<div class="row">' +
                '<span>持续时长</span>' +
                '<input id="duration" type="number" min="100" max="30000" step="100" value="5000">' +
            '</div>' +

            '<div class="row">' +
                '<span>步进间隔</span>' +
                '<input id="interval" type="number" min="20" max="5000" step="10" value="100">' +
            '</div>' +

            '<div class="hint">' +
                '波形数据将发送到选择的通道；A+B 会同时发送到两个通道' +
            '</div>' +

            '<button id="startWaveformButton">' +
                '开始波形' +
            '</button>' +

            '<button id="stopWaveformButton" class="danger">' +
                '停止波形' +
            '</button>' +

            '<div id="waveformStatus" class="wave-running" style="display:none;">' +
                '波形运行中' +
            '</div>' +

        '</div>' +


        '<div class="card">' +

            '<div class="title">VS Code</div>' +

            '<div class="row">' +
                '<span>Error 数量</span>' +
                '<span id="errors" class="big-number">0</span>' +
            '</div>' +

        '</div>' +


        '<div class="card">' +

            '<div class="title">操作</div>' +

            '<button id="connectButton">' +
                '连接 Coyote 2.0' +
            '</button>' +

            '<button id="batteryButton" class="secondary">' +
                '读取电量' +
            '</button>' +

            '<button id="disconnectButton" class="secondary">' +
                '断开连接' +
            '</button>' +

            '<button id="testButton">' +
                '手动测试' +
            '</button>' +

            '<button id="stopButton" class="danger">' +
                '■ 紧急停止' +
            '</button>' +

        '</div>' +


        '<div class="card">' +

            '<div class="title">最近操作</div>' +

            '<div id="lastAction" class="status-box">' +
                '等待操作' +
            '</div>' +

            '<div id="rawBox" class="raw">' +
                'BLE Raw: --' +
            '</div>' +

        '</div>' +


        '<script>' +

        'const vscode = acquireVsCodeApi();' +

        'function send(command, data) {' +
            'vscode.postMessage(Object.assign({' +
                'command: command' +
            '}, data || {}));' +
        '}' +


        'document.getElementById("connectButton")' +
        '.addEventListener("click", function() {' +
            'send("connect");' +
        '});' +


        'document.getElementById("batteryButton")' +
        '.addEventListener("click", function() {' +
            'send("battery");' +
        '});' +


        'document.getElementById("disconnectButton")' +
        '.addEventListener("click", function() {' +
            'send("disconnect");' +
        '});' +


        'document.getElementById("setIntensityButton")' +
        '.addEventListener("click", function() {' +

            'var a = Number(' +
                'document.getElementById("intensityA").value' +
            ');' +

            'var b = Number(' +
                'document.getElementById("intensityB").value' +
            ');' +

            'send("setIntensity", {' +
                'a: a,' +
                'b: b' +
            '});' +

        '});' +


        'document.getElementById("readIntensityButton")' +
        '.addEventListener("click", function() {' +
            'send("readIntensity");' +
        '});' +


        'document.getElementById("startWaveformButton")' +
        '.addEventListener("click", function() {' +

            'var waveform =' +
                'document.getElementById("waveform").value;' +

            'var channel =' +
                'document.getElementById("waveformChannel").value;' +

            'var duration = Number(' +
                'document.getElementById("duration").value' +
            ');' +

            'var interval = Number(' +
                'document.getElementById("interval").value' +
            ');' +

            'send("startWaveform", {' +
                'waveform: waveform,' +
                'channel: channel,' +
                'duration: duration,' +
                'interval: interval' +
            '});' +

        '});' +


        'document.getElementById("stopWaveformButton")' +
        '.addEventListener("click", function() {' +
            'send("stopWaveform");' +
        '});' +


        'document.getElementById("testButton")' +
        '.addEventListener("click", function() {' +
            'send("test");' +
        '});' +


        'document.getElementById("stopButton")' +
        '.addEventListener("click", function() {' +
            'send("stop");' +
        '});' +


        'window.addEventListener("message", function(event) {' +

            'var message = event.data;' +

            'if (message.command !== "state") {' +
                'return;' +
            '}' +

            'var state = message.state;' +


            'var status = document.getElementById("status");' +

            'if (state.connected) {' +

                'status.textContent = "● 已连接";' +
                'status.className = "value connected";' +

            '} else {' +

                'status.textContent = "○ 未连接";' +
                'status.className = "value disconnected";' +

            '}' +


            'document.getElementById("device").textContent =' +
                'state.deviceName || "--";' +


            'document.getElementById("battery").textContent =' +
                '(state.battery == null ? "--" : String(state.battery) + "%");' +


            'document.getElementById("currentA").textContent =' +
                '(state.channelA == null ? "0" : String(state.channelA));' +


            'document.getElementById("currentB").textContent =' +
                '(state.channelB == null ? "0" : String(state.channelB));' +


            'document.getElementById("errors").textContent =' +
                '(state.errorCount == null ? "0" : String(state.errorCount));' +


            'var action = document.getElementById("lastAction");' +

            'action.textContent =' +
                '(state.lastAction || "等待操作");' +

            'action.className =' +
                '"status-box " + (state.lastActionType || "info");' +


            'document.getElementById("rawBox").textContent =' +
                '"BLE Raw: " + (state.lastRaw || "--");' +


            'var waveformChannel =' +
                'document.getElementById("waveformChannel");' +

            'if (state.waveformChannel) {' +
                'waveformChannel.value = state.waveformChannel;' +
            '}' +


            'var waveformStatus =' +
                'document.getElementById("waveformStatus");' +

            'if (state.waveformRunning) {' +

                'waveformStatus.style.display = "block";' +

                'var channelText = ' +
                    'state.waveformChannel === "AB" ? "A + B" : ' +
                    '(state.waveformChannel || "A");' +

                'waveformStatus.textContent =' +
                    '"波形运行中：" +' +
                    '(state.waveformName || "--") +' +
                    '"，通道：" +' +
                    'channelText;' +

            '} else {' +

                'waveformStatus.style.display = "none";' +

            '}' +

        '});' +

        '</script>' +

        '</body>' +

        '</html>';
    }
}


module.exports = {
    CoyoteSidebarProvider
};