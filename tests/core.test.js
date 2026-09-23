"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { normalizeConfig, planErrors, scenePlan } = require("../src/coyote/rules");
const { SceneRuntime } = require("../src/coyote/SceneRuntime");
const { LocalBridge } = require("../src/mcp/LocalBridge");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("node:path");
function controller() {
  return {
    connected: true, writes: [], channelA:0, channelB:0,
    _clearAllTimers() {},
    async setIntensity(a,b) { this.channelA=a; this.channelB=b; this.writes.push(["S",a,b]); },
    async setWaveformA(...f) { this.writes.push(["A",...f]); },
    async setWaveformB(...f) { this.writes.push(["B",...f]); },
    async emergencyStop() { this.channelA=0; this.channelB=0; this.writes.push(["S",0,0]); },
  };
}
test("configured boundaries, zero limits and zero-error plans are respected", () => {
  const cfg = normalizeConfig({ intensity: 80, maxIntensity: 20, cooldown: 0, errorMapping: "stepped", reminderEnd: 10, warningEnd: 30 });
  assert.equal(cfg.cooldown,0);
  assert.equal(planErrors(0,cfg).intensity,0);
  assert.equal(planErrors(10,cfg).sceneId,"reminder");
  assert.equal(planErrors(11,cfg).sceneId,"warning");
  assert.equal(planErrors(30,cfg).sceneId,"warning");
  assert.equal(planErrors(31,cfg).sceneId,"mixed");
  for (const errors of [1,10,30,100,1000000]) assert.ok(planErrors(errors,cfg).intensity <= 20);
  assert.equal(scenePlan("mixed",{ maxIntensity:0 }).intensity,0);
  assert.throws(() => scenePlan("unknown",{}));
});
test("composite and fixed plans preserve limits and waveforms", () => {
  let last=0;
  for (const e of [1,2,5,10,30,100,1000]) {
    const p=planErrors(e,{});
    assert.ok(p.intensity >= last && p.intensity <= 200);
    assert.ok(p.durationMs <= 5000);
    last=p.intensity;
  }
  assert.equal(planErrors(1,{}).intensity,55);
  assert.equal(planErrors(100,{}).intensity,200);
  assert.equal(planErrors(100,{ scaleByErrors:false,intensity:7 }).intensity,7);
  const p=scenePlan("warning",{});
  assert.equal(p.waveformData.slice(0,5).every(f => f[2]===12 && f[0]+f[1]===20),true);
  assert.equal(p.waveformData.slice(5).every(f=>f[2]===0),true);
});
test("AB output is serialized and stops at deadline", async () => {
  const c=controller(), r=new SceneRuntime(c,{ cooldown:0,durationMs:100,maxDurationMs:100,channel:"AB" });
  await r.start(scenePlan("reminder",r.config));
  assert.deepEqual(c.writes.slice(0,3).map(w=>w[0]),["S","A","B"]);
  await delay(160);
  assert.equal(r.running,null);
  assert.deepEqual(c.writes.at(-1),["S",0,0]);
  await r.dispose();
});
test("scene A/B levels are bounded by the scene maximum", async () => {
  const c=controller(),r=new SceneRuntime(c,{cooldown:0,maxIntensity:40,channel:"AB"});
  await r.start({...scenePlan("reminder",r.config),intensityA:10,intensityB:100});
  assert.deepEqual(c.writes[0],["S",10,40]);
  await r.dispose();
});
test("manual controls are independent, update live, and switch waveform channels", async t => {
  const c=controller(),r=new SceneRuntime(c,{maxIntensity:0,maxDurationMs:100,channel:"A",cooldown:3600});
  t.after(()=>r.dispose());
  r.cooldownUntil=Date.now()+3600000;
  await r.setManualIntensity(20,30);
  assert.deepEqual(c.writes.at(-1),["S",20,30]);
  await r.startManual({name:"manual",channel:"AB",intensity:0,intensityA:20,intensityB:30,durationMs:1800,waveformData:[[1,9,10]],waveformInterval:100});
  assert.equal(r.running.channel,"AB");
  assert.equal(r.running.durationMs,1800);
  const endsAt=r.running.endsAt;
  await r.setManualIntensity(25,35);
  assert.equal(r.running.endsAt,endsAt);
  assert.equal(r.running.intensityA,25);
  assert.equal(c.channelA,25);
  await r.setManualChannel("B");
  assert.deepEqual(c.writes.at(-1),["A",0,0,0]);
  const index=c.writes.length;
  await delay(140);
  assert.ok(c.writes.slice(index).some(w=>w[0]==="B" && w[3]===10));
  assert.ok(!c.writes.slice(index).some(w=>w[0]==="A" && w[3]>0));
  await r.reconfigure({maxIntensity:1,channel:"A"});
  assert.equal(r.running.channel,"B");
  assert.equal(r.running.endsAt,endsAt);
  await r.stopManualWaveform();
  assert.equal(r.running,null);
  assert.deepEqual([c.channelA,c.channelB],[25,35]);
  await r.setManualIntensity(0,0);
  assert.deepEqual([c.channelA,c.channelB],[0,0]);
  await assert.rejects(r.setManualIntensity(201,0),/0–200/);
});
test("manual waveform can start at zero and expiry preserves independently set strength", async t => {
  const c=controller(),r=new SceneRuntime(c,{});
  t.after(()=>r.dispose());
  await r.startManual({name:"manual",channel:"A",intensity:0,intensityA:0,intensityB:0,durationMs:180,waveformData:[[1,9,10]]});
  await r.setManualIntensity(12,8);
  await delay(230);
  assert.equal(r.running,null);
  assert.deepEqual([c.channelA,c.channelB],[12,8]);
  assert.deepEqual(c.writes.slice(-2),[["A",0,0,0],["B",0,0,0]]);
  await r.stop();
  assert.deepEqual([c.channelA,c.channelB],[0,0]);
});
test("stop during in-flight start prevents later waveform/reactivation", async () => {
  const c=controller();
  let release;
  c.setIntensity=async(a,b)=>{ await new Promise(resolve=>{ release=resolve; }); c.writes.push(["S",a,b]); };
  const r=new SceneRuntime(c,{cooldown:0});
  const starting=r.start(scenePlan("reminder",r.config));
  await delay(0);
  const stopping=r.stop();
  release();
  await Promise.all([starting,stopping]);
  await delay(120);
  assert.deepEqual(c.writes.map(w=>w[0]),["S","S"]);
  assert.deepEqual(c.writes.at(-1),["S",0,0]);
  assert.equal(r.running,null);
  await r.dispose();
});
test("BLE failure returns error and zeros output", async () => {
  const c=controller(),r=new SceneRuntime(c,{cooldown:0});
  c.setWaveformA=async()=>{ throw new Error("adapter failure"); };
  await assert.rejects(r.start(scenePlan("reminder",r.config)),/adapter failure/);
  assert.equal(r.running,null);
  assert.deepEqual(c.writes.at(-1),["S",0,0]);
  await r.dispose();
});
test("proposals do not write; IDs, expiry, configuration and cooldown are enforced", async () => {
  const c=controller(), r=new SceneRuntime(c,{cooldown:10});
  const proposal=r.propose(scenePlan("reminder",r.config),"A reason");
  assert.equal(c.writes.length,0);
  assert.throws(()=>r.propose(scenePlan("warning",r.config),"replace"),/待处理/);
  await assert.rejects(r.approve("wrong"),/过期|变更/);
  assert.equal(c.writes.length,0);
  r.propose(scenePlan("reminder",r.config),"next");
  r.pending.expiresAt=Date.now()-1;
  await assert.rejects(r.approve(r.pending.id),/过期/);
  const p=r.propose(scenePlan("reminder",r.config),"approved");
  await r.approve(p.id);
  await r.stop();
  await assert.rejects(r.start(scenePlan("reminder",r.config)),/冷却/);
  const next=r.propose(scenePlan("reminder",r.config),"change");
  r.setConfig({...r.config,maxIntensity:1});
  assert.equal(r.pending,null);
  assert.equal(r.lastProposal.status,"invalidated");
  await assert.rejects(r.approve(next.id),/过期|变更/);
  assert.ok(proposal.id);
  await r.dispose();
});
test("official MCP client reaches authenticated bridge and proposal lifecycle", async t => {
  const c=controller(),r=new SceneRuntime(c,{cooldown:0});
  const b=new LocalBridge(r,()=>({connected:c.connected,pending:r.pending,lastProposal:r.lastProposal}));
  await b.start();
  const client=new Client({name:"coyote-test",version:"1.0.0"});
  const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve("src/mcp/server.js")],
    env:{COYOTE_BRIDGE_PORT:String(b.port),COYOTE_BRIDGE_TOKEN:b.token},stderr:"pipe"});
  t.after(async()=>{ await client.close(); await b.close(); await r.dispose(); });
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length,4);
  let result=await client.callTool({name:"coyote_status",arguments:{}});
  assert.equal(JSON.parse(result.content[0].text).connected,true);
  result=await client.callTool({name:"coyote_scene_list",arguments:{}});
  assert.equal(JSON.parse(result.content[0].text).length,3);
  result=await client.callTool({name:"coyote_scene_propose",arguments:{sceneId:"reminder",reason:"需要一次节奏提醒"}});
  const p=JSON.parse(result.content[0].text);
  assert.equal(p.status,"pending");
  assert.equal(c.writes.length,0);
  await r.approve(p.id);
  assert.equal(r.lastProposal.status,"applied");
  result=await client.callTool({name:"coyote_scene_stop",arguments:{}});
  assert.equal(JSON.parse(result.content[0].text).status,"stopped");
  assert.equal(r.running,null);
  result=await client.callTool({name:"coyote_scene_propose",arguments:{sceneId:"mixed",reason:"x",intensity:200}});
  assert.equal(result.isError,true);
  const http=require("node:http");
  const rejected=await new Promise((resolve,reject)=>{
    const req=http.request({host:"127.0.0.1",port:b.port,path:"/tool",method:"POST"},res=>{res.resume();resolve(res.statusCode);});
    req.on("error",reject);req.end("{}");
  });
  assert.equal(rejected,401);
  await b.close();
  result=await client.callTool({name:"coyote_status",arguments:{}});
  assert.equal(result.isError,true);
});
