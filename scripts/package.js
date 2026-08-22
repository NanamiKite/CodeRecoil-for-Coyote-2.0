"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const root = path.resolve(__dirname, "..");

function run(command, args) {
    console.log(`> ${command} ${args.join(" ")}`);

    const result = cp.spawnSync(
        command,
        args,
        {
            cwd: root,
            stdio: "inherit",
            shell: process.platform === "win32"
        }
    );

    if (result.status !== 0) {
        process.exit(
            result.status || 1
        );
    }
}

const nodeModules =
    path.join(
        root,
        "node_modules"
    );

const webBluetooth =
    path.join(
        nodeModules,
        "webbluetooth"
    );

if (
    !fs.existsSync(webBluetooth)
) {
    console.error(
        "webbluetooth 未安装。"
    );

    console.error(
        "请先执行 npm install"
    );

    process.exit(1);
}

/*
 * VSIX 打包。
 *
 * 不使用 npm publish。
 * 不重新安装用户依赖。
 *
 * node_modules/webbluetooth 会直接
 * 被包含到 VSIX 中。
 */

run(
    process.platform === "win32"
        ? "npx.cmd"
        : "npx",
    [
        "vsce",
        "package",
        "--no-dependencies"
    ]
);