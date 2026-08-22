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

                    this.setAction(
                        "操作失败：" + error.message,
                        "error"
                    );

                    this.update();

                    vscode.window.showErrorMessage(
                        "Coyote: " + error.message
                    );
                }
            }
        );

        this.update();
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
                    this.lastRaw
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

        'input {' +
            'width: 80px;' +
            'box-sizing: border-box;' +
            'padding: 4px;' +
            'color: var(--vscode-input-foreground);' +
            'background: var(--vscode-input-background);' +
            'border: 1px solid var(--vscode-input-border);' +
            'border-radius: 3px;' +
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

        '});' +

        '</script>' +

        '</body>' +

        '</html>';
    }
}


module.exports = {
    CoyoteSidebarProvider
};