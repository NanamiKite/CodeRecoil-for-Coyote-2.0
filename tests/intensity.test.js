"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { CoyoteProtocol } = require("../src/coyote/CoyoteProtocol");
const { CoyoteProtocolV3, OFF } = require("../src/coyote/CoyoteProtocolV3");
const { CoyoteSafety } = require("../src/coyote/CoyoteSafety");
const { EventEmitter } = require("node:events");
test("strength writes, reads and device notifications emit current A/B values", async () => {
  const context={module:{exports:{}},console,require(name){
    if(name==="webbluetooth")return {};
    if(name==="events")return {EventEmitter};
    if(name==="./CoyoteProtocol")return {CoyoteProtocol};
    if(name==="./CoyoteProtocolV3")return {CoyoteProtocolV3,OFF};
    if(name==="./CoyoteSafety")return {CoyoteSafety};
    throw new Error(name);
  }};
  vm.runInNewContext(fs.readFileSync("src/coyote/CoyoteController.js","utf8"),context);
  const c=new context.module.exports.CoyoteController();
  c.connected=true;
  c.writeCharacteristic=async()=>{};
  const listeners=new Map();
  c.pwmAB2={
    properties:{notify:true},
    addEventListener:(name,fn)=>listeners.set(name,fn),
    removeEventListener:(name)=>listeners.delete(name),
    startNotifications:async()=>{},
    readValue:async()=>new DataView(Uint8Array.from(c.protocol.encodeIntensity(70,140)).buffer),
  };
  const values=[];
  c.on("intensityChanged",()=>values.push([c.channelA,c.channelB,c.intensitySource]));
  await c.setIntensity(3,4);
  assert.deepEqual(values.at(-1),[3,4,"write"]);
  await c.readIntensity();
  assert.deepEqual(values.at(-1),[10,20,"read"]);
  await c._subscribeIntensity();
  const raw=c.protocol.encodeIntensity(210,280);
  listeners.get("characteristicvaluechanged")({target:{value:new DataView(raw.buffer)}});
  assert.deepEqual(values.at(-1),[30,40,"notification"]);
  const count=values.length;
  listeners.get("characteristicvaluechanged")({target:{value:new DataView(new ArrayBuffer(1))}});
  assert.equal(values.length,count);
  c._removeIntensityListener();
  assert.equal(listeners.size,0);
});
