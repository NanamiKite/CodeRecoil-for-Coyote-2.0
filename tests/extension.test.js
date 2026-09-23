"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const { normalizeConfig, planErrors } = require("../src/coyote/rules");
test("extension gates diagnostics, deduplicates saves and cancels delayed checks", async () => {
  const handlers={},commands={},jobs=new Map(),starts=[];
  let next=1,sidebar,runtime,items=[],now=10000;
  const uri={toString:()=>"file:///project/a.js"};
  const event=name=>fn=>{ handlers[name]=fn;return {dispose(){}}; };
  const diagnostic=message=>({severity:0,message,source:"test",range:{start:{line:1,character:0}}});
  const vscode={
    workspace:{isTrusted:true,onDidSaveTextDocument:event("save"),onDidChangeTextDocument:event("edit")},
    window:{activeTextEditor:{document:{uri}},registerWebviewViewProvider:()=>({dispose(){}}),onDidChangeActiveTextEditor:event("active"),showErrorMessage(){}},
    commands:{registerCommand:(name,fn)=>{commands[name]=fn;return {dispose(){}};}},
    languages:{getDiagnostics:requested=>requested?items:[[uri,items]],onDidChangeDiagnostics:event("diagnostics")},
    tasks:{onDidStartTask:event("taskStart"),onDidEndTaskProcess:event("taskEnd")},
    DiagnosticSeverity:{Error:0},
  };
  class Runtime {
    constructor(c,cfg){runtime=this;this.config=cfg;this.epoch=0;this.cooldownUntil=0;}
    async start(plan){starts.push(plan);this.epoch++;}
    record(){}
    async dispose(){}
  }
  class Sidebar {
    constructor(ctx,c,r){sidebar=this;this.c=c;this.r=r;this.streak=0;}
    setErrorCount(count){this.count=count;}
    update(){}
    async handle(m){if(m.command==="stop"){this.r.config.autoTrigger=false;this.r.epoch++;}}
  }
  const sandbox={
    module:{exports:{}},console,Date:{now:()=>now},
    setTimeout:fn=>{const id=next++;jobs.set(id,fn);return id;},
    clearTimeout:id=>jobs.delete(id),
    require:name=>{
      if(name==="vscode")return vscode;
      if(name.endsWith("/rules"))return {normalizeConfig,planErrors};
      if(name.endsWith("/CoyoteController"))return {CoyoteController:class{constructor(){this.connected=true;}dispose(){}}};
      if(name.endsWith("/SceneRuntime"))return {SceneRuntime:Runtime};
      if(name.endsWith("/CoyoteSidebarProvider"))return {CoyoteSidebarProvider:Sidebar};
      if(name.endsWith("/LocalBridge"))return {LocalBridge:class{async close(){}}};
      throw Error(name);
    },
  };
  vm.runInNewContext(fs.readFileSync("src/extension.js","utf8"),sandbox);
  const context={workspaceState:{get:()=>({})},subscriptions:[]};
  sandbox.module.exports.activate(context);
  const flush=async()=>{for(const [id,fn] of [...jobs]){jobs.delete(id);fn();}await new Promise(resolve=>setImmediate(resolve));};
  items=[diagnostic("first")];
  handlers.diagnostics();
  assert.equal(sidebar.count,1);
  handlers.save({uri});await flush();
  assert.match(sidebar.autoStatus, /未开启/);
  runtime.config.autoTrigger=true;
  await flush();
  assert.equal(starts.length,0);
  handlers.save({uri});await flush();
  assert.equal(starts.length,1);
  handlers.save({uri});await flush();
  assert.match(sidebar.autoStatus, /本轮已触发/);
  // A later save with the same diagnostics is a new check after cooldown.
  now += 1100;
  handlers.save({uri});await flush();
  assert.equal(starts.length,2);
  handlers.save({uri});await flush();
  assert.equal(starts.length,2);
  runtime.config.ignoreSameErrors=true;
  now += 1100;
  handlers.save({uri});await flush();
  assert.equal(starts.length,2);
  assert.match(sidebar.autoStatus, /同一批错误已忽略/);
  items=[diagnostic("second")];
  handlers.save({uri});await flush();
  assert.equal(starts.length,3);
  now += 1100;
  handlers.save({uri});await flush();
  assert.equal(starts.length,3);
  items=[diagnostic("first")];
  handlers.save({uri});await flush();
  assert.equal(starts.length,4);
  items=[diagnostic("second")];
  handlers.save({uri});handlers.edit();await flush();
  assert.equal(starts.length,4);
  handlers.taskStart({execution:{task:{name:"test"}}});await flush();
  assert.equal(starts.length,4);
  handlers.taskStart({execution:{task:{name:"build",group:{id:"build"}}}});
  handlers.edit(); // Editing cancels save checks, not build checks.
  await flush();
  assert.equal(starts.length,5);
  items=[];
  handlers.diagnostics();
  handlers.save({uri});await flush();
  assert.equal(starts.length,5);
  items=[diagnostic("second")];
  handlers.save({uri});await flush();
  assert.equal(starts.length,6);
  items=[diagnostic("third")];
  handlers.save({uri});
  await commands["coyotePunisher.emergencyStop"]();await flush();
  assert.equal(starts.length,6);
  for(const s of context.subscriptions)s.dispose?.();
});
