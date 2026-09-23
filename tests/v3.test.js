"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { EventEmitter } = require("node:events");
const { CoyoteProtocol } = require("../src/coyote/CoyoteProtocol");
const { CoyoteProtocolV3, OFF } = require("../src/coyote/CoyoteProtocolV3");
const { CoyoteSafety } = require("../src/coyote/CoyoteSafety");
const { SceneRuntime } = require("../src/coyote/SceneRuntime");
const { normalizeConfig } = require("../src/coyote/rules");

const hex = bytes => Buffer.from(bytes).toString("hex").toUpperCase();

test("V3 B0/BF/B1 match protocol examples and waveform conversion", () => {
  const a = { frequency:[10,10,10,10], strength:[0,10,20,30] };
  assert.equal(hex(CoyoteProtocolV3.encodeB0({a,b:OFF})), "B00000000A0A0A0A000A141E0000000000000065");
  assert.equal(hex(CoyoteProtocolV3.encodeB0({a,b:OFF,methodA:1,intensityA:5})), "B00405000A0A0A0A000A141E0000000000000065");
  assert.equal(hex(CoyoteProtocolV3.encodeB0({a,b:OFF,sequence:1,methodA:1,intensityA:10})), "B0140A000A0A0A0A000A141E0000000000000065");
  assert.equal(hex(CoyoteProtocolV3.encodeBF()), "BFC8C880808080");
  assert.deepEqual(CoyoteProtocolV3.decodeB1(Uint8Array.of(0xB1,2,31,42)), { sequence:2,a:31,b:42 });
  assert.equal(CoyoteProtocolV3.periodToByte(100), 100);
  assert.equal(CoyoteProtocolV3.periodToByte(200), 120);
  assert.equal(CoyoteProtocolV3.periodToByte(333), 146);
  assert.equal(CoyoteProtocolV3.periodToByte(1000), 240);
  assert.deepEqual(CoyoteProtocolV3.fromV2Frame([1,9,15]), { frequency:10,strength:75 });
  assert.deepEqual(CoyoteProtocolV3.fromV2Frame([1,9,0]), { frequency:10,strength:0 });
  assert.deepEqual(CoyoteProtocolV3.fromV2Frame([0,0,15]), { frequency:10,strength:0 });
  assert.throws(() => CoyoteProtocolV3.encodeB0({a:{frequency:[10,10,10],strength:[0,0,0,101]}}), /每通道必须有 4/);
});

function fixture(name = "47L121000") {
  const writes = [], listeners = new Map(), services = [], requests = [];
  const battery = { readValue: async () => new DataView(Uint8Array.of(82).buffer) };
  const write = { uuid:"0000150a-0000-1000-8000-00805f9b34fb", properties:{write:true},
    writeValueWithResponse: async value => { writes.push(Uint8Array.from(value)); } };
  const notify = { uuid:"0000150b-0000-1000-8000-00805f9b34fb", properties:{notify:true},
    addEventListener: (kind,listener) => listeners.set(kind,listener),
    removeEventListener: kind => listeners.delete(kind),
    startNotifications: async () => { notify.started = true; } };
  const gatt = { connected:false, async connect() { this.connected=true; return this; }, disconnect() { this.connected=false; },
    async getPrimaryService(uuid) {
      services.push(uuid);
      return uuid.includes("180a") ? { getCharacteristic: async characteristic => {
        assert.equal(characteristic,"00001500-0000-1000-8000-00805f9b34fb"); return battery;
      } } : { getCharacteristics: async () => [write,notify] };
    } };
  const device = { name,gatt,addEventListener() {},removeEventListener() {} };
  const bluetooth = { requestDevice: async options => { requests.push(options); return device; } };
  const sandbox = { module:{exports:{}},console,
    require(key) {
      if(key==="webbluetooth")return {bluetooth};
      if(key==="events")return {EventEmitter};
      if(key==="./CoyoteProtocol")return {CoyoteProtocol};
      if(key==="./CoyoteProtocolV3")return {CoyoteProtocolV3,OFF};
      if(key==="./CoyoteSafety")return {CoyoteSafety};
      throw new Error(key);
    } };
  vm.runInNewContext(fs.readFileSync("src/coyote/CoyoteController.js","utf8"),sandbox);
  return { c:new sandbox.module.exports.CoyoteController(), writes,listeners,services,requests,notify,device };
}

test("V3 connection subscribes, writes BF then zero B0 and handles B1 notifications", async () => {
  const { c,writes,listeners,services,requests,notify } = fixture();
  await c.connect();
  assert.equal(c.version,3);
  assert.equal(c.connected,true);
  assert.equal(c.battery,82);
  assert.equal(notify.started,true);
  assert.deepEqual(services,["0000180a-0000-1000-8000-00805f9b34fb","0000180c-0000-1000-8000-00805f9b34fb"]);
  assert.deepEqual(Array.from(requests[0].filters, filter => filter.namePrefix),["D-LAB ESTIM01","47L121000"]);
  assert.equal(hex(writes[0]),"BFC8C880808080");
  assert.equal(hex(writes[1]),"B00F000000000000000000650000000000000065");
  await c.setIntensity(14,23);
  assert.equal(writes.at(-1)[1],0x0F);
  assert.equal(writes.at(-1)[2],14);
  assert.equal(writes.at(-1)[3],23);
  const readBefore = c.readIntensity();
  await assert.rejects(readBefore,/不支持主动读取/);
  listeners.get("characteristicvaluechanged")({target:{value:new DataView(Uint8Array.of(0xB1,0,15,25).buffer)}});
  assert.deepEqual([c.channelA,c.channelB,c.intensitySource],[15,25,"notification"]);
  const actual = await c.readIntensity();
  assert.deepEqual([actual.a,actual.b],[15,25]);
  await c.setIntensity(16,26);
  await assert.rejects(c.readIntensity(),/等待 B1/);
  await c.disconnect();
  assert.equal(listeners.size,0);
  assert.equal(c.version,null);
  await c.connect();
  assert.equal(hex(writes.at(-2)),"BFC8C880808080");
  await c.disconnect();
});

test("V3 AB output is one B0 per window; deselect and stop disable both channels", async () => {
  const { c,writes } = fixture();
  await c.connect();
  const runtime = new SceneRuntime(c,normalizeConfig());
  try {
    await runtime.startManual({ name:"测试",channel:"AB",intensity:0,intensityA:8,intensityB:9,
      durationMs:600,waveformInterval:100,waveformData:[[1,9,10],[5,95,0]] });
    const first = writes.at(-1);
    assert.equal(first.length,20);
    assert.deepEqual(Array.from(first.slice(4,8)),[10,10,10,10]);
    assert.deepEqual(Array.from(first.slice(8,12)),[50,50,50,50]);
    assert.deepEqual(Array.from(first.slice(12,16)),[10,10,10,10]);
    await runtime.setManualChannel("B");
    const switched = writes.at(-1);
    assert.deepEqual(Array.from(switched.slice(4,8)),[0,0,0,0]);
    assert.equal(switched[11],101);
    assert.deepEqual(Array.from(switched.slice(12,16)),[10,10,10,10]);
    await runtime.setManualIntensity(11,12);
    assert.equal(writes.at(-1)[2],11);
    assert.equal(writes.at(-1)[3],12);
    await runtime.stopManualWaveform();
    assert.equal(writes.at(-1)[1],0);
    assert.equal(writes.at(-1)[11],101);
    assert.equal(writes.at(-1)[19],101);
    assert.deepEqual([c.channelA,c.channelB],[11,12]);
    await runtime.stop();
    assert.equal(writes.at(-1)[1],15);
    assert.deepEqual([writes.at(-1)[2],writes.at(-1)[3]],[0,0]);
  } finally { await runtime.dispose(); await c.disconnect(); }
});

test("sensor name is rejected before accessing control services", async () => {
  const { c,device,services } = fixture("47L120100");
  await assert.rejects(c.connect(),/只支持郊狼 V2 \/ V3/);
  assert.equal(device.gatt.connected,false);
  assert.equal(services.length,0);
});

test("V3 samples fast manual frame changes into four 25ms slots", async () => {
  const { c,writes } = fixture();
  await c.connect();
  const runtime = new SceneRuntime(c,normalizeConfig());
  try {
    await runtime.startManual({name:"快节奏",channel:"A",intensity:0,intensityA:5,intensityB:0,
      durationMs:200,waveformInterval:20,waveformData:[[1,9,10],[1,9,0]]});
    const packet = writes.at(-1);
    assert.deepEqual(Array.from(packet.slice(4,8)),[10,10,10,10]);
    assert.deepEqual(Array.from(packet.slice(8,12)),[50,0,50,0]);
    assert.equal(packet[19],101);
  } finally { await runtime.dispose(); await c.disconnect(); }
});
