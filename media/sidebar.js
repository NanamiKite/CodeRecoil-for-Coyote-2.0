"use strict";

const vscode =
    acquireVsCodeApi();

const $ =
    id => document.getElementById(id);

function send(type, data = {}) {
    vscode.postMessage({
        type,
        ...data
    });
}

function log(message) {
    const element =
        $("log");

    const time =
        new Date()
            .toLocaleTimeString();

    element.textContent +=
        `[${time}] ${message}\n`;

    element.scrollTop =
        element.scrollHeight;
}

$("connect").addEventListener(
    "click",
    () => send("connect")
);

$("disconnect").addEventListener(
    "click",
    () => send("disconnect")
);

$("battery").addEventListener(
    "click",
    () => send("battery")
);

$("readIntensity").addEventListener(
    "click",
    () => send("readIntensity")
);

$("setIntensity").addEventListener(
    "click",
    () => {
        send(
            "setIntensity",
            {
                A:
                    $("intensityA").value,

                B:
                    $("intensityB").value
            }
        );
    }
);

document
    .querySelectorAll(
        "[data-wave-write]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () => {
                const channel =
                    button.dataset.waveWrite;

                if (channel === "A") {
                    send(
                        "setWaveform",
                        {
                            channel: "A",
                            x: $("ax").value,
                            y: $("ay").value,
                            z: $("az").value
                        }
                    );
                }

                if (channel === "B") {
                    send(
                        "setWaveform",
                        {
                            channel: "B",
                            x: $("bx").value,
                            y: $("by").value,
                            z: $("bz").value
                        }
                    );
                }
            }
        );
    });

document
    .querySelectorAll(
        "[data-wave-read]"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () => {
                send(
                    "readWaveform",
                    {
                        channel:
                            button.dataset.waveRead
                    }
                );
            }
        );
    });

$("arm").addEventListener(
    "click",
    () => send("arm")
);

$("emergencyStop").addEventListener(
    "click",
    () => {
        if (
            confirm(
                "确定执行紧急停止？"
            )
        ) {
            send(
                "emergencyStop"
            );
        }
    }
);

window.addEventListener(
    "message",
    event => {
        const message =
            event.data;

        switch (message.type) {

            case "state":
                $("state")
                    .textContent =
                    stateText(
                        message.state
                    );

                log(
                    `状态: ${message.state}`
                );

                updateButtons(
                    message.state
                );

                break;

            case "device":
                $("device")
                    .textContent =
                    `${message.name} (${message.id})`;

                log(
                    `设备: ${message.name}`
                );

                break;

            case "battery":
                $("battery")
                    .textContent =
                    `${message.value}%`;

                log(
                    `Battery: ${message.value}%`
                );

                break;

            case "intensityRead":
                $("intensityRaw")
                    .textContent =
                    message.raw ||
                    "(empty)";

                if (
                    message.decoded
                ) {
                    $("intensityA")
                        .value =
                        message.decoded.A;

                    $("intensityB")
                        .value =
                        message.decoded.B;
                }

                log(
                    `1504 Read: ${message.raw || "(empty)"}`
                );

                break;

            case "intensityNotification":
                $("intensityRaw")
                    .textContent =
                    message.raw ||
                    "(empty)";

                if (
                    message.decoded
                ) {
                    $("intensityA")
                        .value =
                        message.decoded.A;

                    $("intensityB")
                        .value =
                        message.decoded.B;
                }

                log(
                    `1504 Notify: ${message.raw}`
                );

                break;

            case "intensityWrite":
                $("intensityRaw")
                    .textContent =
                    message.raw;

                log(
                    `1504 Write: ${message.raw}  A=${message.A} B=${message.B}`
                );

                break;

            case "waveformRead":
                log(
                    `Waveform ${message.channel} Read: ${message.raw}`
                );

                if (
                    message.decoded
                ) {
                    log(
                        `X=${message.decoded.x} Y=${message.decoded.y} Z=${message.decoded.z}`
                    );
                }

                break;

            case "waveformWrite":
                log(
                    `Waveform ${message.channel} Write: ${message.raw}`
                );

                break;

            case "log":
                log(
                    message.message
                );

                break;

            case "error":
                log(
                    `ERROR: ${message.message}`
                );

                break;
        }
    }
);

function stateText(state) {
    switch (state) {
        case "CONNECTING":
            return "连接中";

        case "CONNECTED":
            return "已连接";

        case "ARMED":
            return "已连接 / Armed";

        case "EMERGENCY_STOP":
            return "急停";

        case "DISCONNECTED":
        default:
            return "未连接";
    }
}

function updateButtons(state) {
    const connected =
        state !== "DISCONNECTED" &&
        state !== "CONNECTING";

    $("connect")
        .disabled =
        connected;

    $("disconnect")
        .disabled =
        !connected;
}

log(
    "Coyote 2.0 插件已加载。"
);