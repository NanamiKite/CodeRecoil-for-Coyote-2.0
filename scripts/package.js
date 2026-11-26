"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const root = path.resolve(__dirname, "..");

if (!fs.existsSync(path.join(root, "node_modules", "webbluetooth"))) {
  console.error("webbluetooth 未安装。请先执行 npm install");
  process.exit(1);
}

const vsceNpm = require("@vscode/vsce/out/npm");
const originalGetDependencies = vsceNpm.getDependencies;

async function getNpmDependencies(cwd, dependencies, packagedDependencies) {
  if (dependencies === "none") return [cwd];
  if (dependencies === "yarn" || (dependencies === undefined && await vsceNpm.detectYarn(cwd))) {
    return originalGetDependencies(cwd, dependencies, packagedDependencies);
  }

  const listPath = path.join(os.tmpdir(), `vsce-npm-list-${process.pid}.txt`);
  const fd = fs.openSync(listPath, "w");
  try {
    const result = cp.spawnSync(
      "npm",
      ["list", "--omit=dev", "--parseable", "--depth=99999", "--loglevel=error"],
      { cwd, stdio: ["ignore", fd, fd] }
    );
    if (result.status !== 0) throw new Error(`npm list failed with exit code ${result.status}`);
    return fs.readFileSync(listPath, "utf8")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && path.isAbsolute(line));
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(listPath);
  }
}

vsceNpm.getDependencies = getNpmDependencies;

const { createVSIX } = require("@vscode/vsce");

createVSIX({ cwd: root, useYarn: false }).catch(error => {
  console.error(error);
  process.exit(1);
});
