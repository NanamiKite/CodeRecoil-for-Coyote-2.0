"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");
const { CoyoteProtocol } = require("../src/coyote/CoyoteProtocol");
const { CoyoteSafety } = require("../src/coyote/CoyoteSafety");

function fixture() {
  const listeners = new Map();
  const calls = { requests: 0, disconnects: 0 };
  const battery = { readValue: async () => new DataView(Uint8Array.of(80).buffer) };
  const characteristics = ["1504", "1505", "1506"].map(id => ({
    uuid: `955a${id}-0fe2-f5aa-a094-84b8d4f3e8ad`, properties: {},
  }));
  const gatt = {
    connected: false,
    async connect() { this.connected = true; return this; },
    disconnect() { this.connected = false; calls.disconnects++; },
    async getPrimaryService(uuid) {
      return uuid.includes("180a") ? { getCharacteristic: async () => battery }
        : { getCharacteristics: async () => characteristics };
    },
  };
  const device = { name: "D-LAB ESTIM01", gatt,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  const bluetooth = { async requestDevice() { calls.requests++; return device; } };
  const sandbox = { module: { exports: {} }, console, setTimeout, clearTimeout, setInterval, clearInterval,
    require(name) {
      if (name === "webbluetooth") return { bluetooth };
      if (name === "events") return { EventEmitter };
      if (name === "./CoyoteProtocol") return { CoyoteProtocol };
      if (name === "./CoyoteSafety") return { CoyoteSafety };
      throw new Error(name);
    },
  };
  vm.runInNewContext(fs.readFileSync("src/coyote/CoyoteController.js", "utf8"), sandbox);
  return { controller: new sandbox.module.exports.CoyoteController(), bluetooth, device, battery, characteristics, calls, listeners };
}

test("connection reports phases immediately, prevents duplicate requests and is ready only after initialization", async () => {
  const { controller: c, bluetooth, device, calls, listeners } = fixture();
  let selectDevice, finishBattery;
  bluetooth.requestDevice = () => { calls.requests++; return new Promise(resolve => { selectDevice = resolve; }); };
  c.readBattery = () => new Promise(resolve => { finishBattery = resolve; });
  const phases = [];
  c.on("connectionChanged", state => phases.push(state.message));
  const pending = c.connect();
  assert.equal(c.connecting, true);
  assert.equal(c.connected, false);
  assert.match(c.connection.message, /搜索/);
  await c.connect();
  assert.equal(calls.requests, 1);
  selectDevice(device);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.connected, false);
  assert.match(c.connection.message, /读取设备电量/);
  finishBattery();
  await pending;
  assert.equal(c.connecting, false);
  assert.equal(c.connected, true);
  assert.equal(c.connection.state, "connected");
  assert.ok(phases.some(message => message.includes("GATT")));
  assert.ok(phases.some(message => message.includes("控制服务")));
  assert.ok(phases.some(message => message.includes("订阅强度通知")));
  device.gatt.connected = false;
  listeners.get("gattserverdisconnected")();
  assert.equal(c.connected, false);
  assert.equal(c.connection.state, "disconnected");
  await c.disconnect();
  assert.equal(c.connection.state, "idle");
  assert.equal(listeners.size, 0);
});

test("failed initialization keeps the failing stage and raw error, cleans GATT and permits retry", async () => {
  const { controller: c, battery, calls, listeners } = fixture();
  battery.readValue = async () => { throw new Error("Bluetooth access denied"); };
  await assert.rejects(c.connect(), /读取设备电量失败：Bluetooth access denied/);
  assert.equal(c.connecting, false);
  assert.equal(c.connected, false);
  assert.equal(c.connection.state, "error");
  assert.equal(c.connection.error, "Bluetooth access denied");
  assert.equal(c.device, null);
  assert.equal(c.pwmAB2, null);
  assert.equal(listeners.size, 0);
  assert.equal(calls.disconnects, 1);
  battery.readValue = async () => new DataView(Uint8Array.of(65).buffer);
  await c.connect();
  assert.equal(c.connected, true);
  assert.equal(c.battery, 65);
  assert.equal(c.connection.error, "");
  await c.disconnect();
});

test("scan rejection strings and missing control characteristics remain visible", async () => {
  const { controller: c, bluetooth, device, characteristics } = fixture();
  bluetooth.requestDevice = async () => { throw "requestDevice error: no devices found"; };
  await assert.rejects(c.connect(), /正在搜索 D-LAB 设备失败.*no devices found/);
  assert.equal(c.connection.error, "requestDevice error: no devices found");
  bluetooth.requestDevice = async () => device;
  characteristics.pop();
  await assert.rejects(c.connect(), /1506/);
  assert.match(c.connection.message, /通道特性失败/);
  assert.equal(c.connected, false);
  assert.equal(device.gatt.connected, false);
});

test("sidebar publishes connecting state immediately and forwards phases to VS Code progress", async () => {
  const { controller: c, bluetooth, device } = fixture();
  const reports = [], states = [];
  let selectDevice;
  bluetooth.requestDevice = () => new Promise(resolve => { selectDevice = resolve; });
  const vscode = { workspace: { isTrusted: true }, ProgressLocation: { Notification: 15 }, window: {
    withProgress: async (options, work) => {
      assert.equal(options.location, 15);
      return work({ report: value => reports.push(value.message) });
    },
  } };
  const sandbox = { module: { exports: {} }, setInterval, clearInterval, require(name) {
    if (name === "vscode") return vscode;
    if (name.startsWith("../coyote/")) return require("../src/coyote/" + name.split("/").at(-1));
    if (name === "./dashboardHtml") return require("../src/ui/dashboardHtml");
    return require(name);
  } };
  vm.runInNewContext(fs.readFileSync("src/ui/CoyoteSidebarProvider.js", "utf8"), sandbox);
  const runtime = new EventEmitter();
  Object.assign(runtime, { config: {}, events: [], cooldownUntil: 0, record() {} });
  const sidebar = new sandbox.module.exports.CoyoteSidebarProvider({ workspaceState: { get: () => ({}) } }, c, runtime, {});
  sidebar.view = { webview: { postMessage: message => states.push(message.state) } };
  try {
    const pending = sidebar.handle({ command: "connect" });
    assert.equal(states.at(-1).connecting, true);
    assert.match(reports.at(-1), /搜索/);
    selectDevice(device);
    await pending;
    assert.equal(states.at(-1).connected, true);
    assert.equal(states.at(-1).connecting, false);
    assert.match(reports.at(-1), /已连接/);
    await c.disconnect();
  } finally { sidebar.dispose(); }
  assert.equal(c.listenerCount("connectionChanged"), 0);
});
