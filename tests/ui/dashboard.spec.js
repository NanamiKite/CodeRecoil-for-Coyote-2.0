const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const { dashboardHtml } = require("../../src/ui/dashboardHtml");
const { waveforms } = require("../../src/coyote/waveforms");
const { normalizeConfig, planErrors, scenePlan } = require("../../src/coyote/rules");

test("offline preview, rule drafts, preset and AI scene interactions", async ({ page }, testInfo) => {
  const errors=[],sent=[];
  page.on("pageerror",e=>errors.push(e.message));
  const state={
    connected:false,battery:null,deviceName:"",channelA:0,channelB:0,errorCount:8,previousErrors:14,streak:2,
    config:normalizeConfig(),running:null,pending:null,lastProposal:null,cooldownRemaining:0,events:[],
    raw:"--",bridgeEnabled:false,presets:[],controlEpoch:0,
  };
  const post = async m=>page.evaluate(m=>window.dispatchEvent(new MessageEvent("message",{data:m})),m);
  await page.exposeFunction("fakeHost",async m=>{
    sent.push(m);
    if(m.command==="ready"){
      await post({command:"catalog",waveforms});
      await post({command:"state",state});
    }
    if(m.command==="simulate")await post({command:"simulation",id:m.id,plan:planErrors(m.count,m.config)});
    if(m.command==="connect"){
      state.connecting=true;
      state.connection={state:"connecting",message:"正在搜索 D-LAB 设备",error:"",startedAt:Date.now()-16000};
      await post({command:"state",state});
    }
    if(m.command==="config"){
      state.config=normalizeConfig(m.config);
      await post({command:"configSaved",config:state.config});
      await post({command:"state",state});
    }
    if(m.command==="setManualIntensity"){
      state.channelA=m.a;state.channelB=m.b;state.intensitySource="write";
      await post({command:"state",state});
    }
    if(m.command==="manual"){
      state.controlEpoch++;
      state.running={mode:"manual",channel:m.channel,name:"手动",source:"手动波形",durationMs:m.durationMs,endsAt:Date.now()+m.durationMs};
      await post({command:"state",state});
    }
    if(m.command==="manualChannel" && state.running){
      state.running.channel=m.channel; await post({command:"state",state});
    }
    if(m.command==="stop"){
      state.controlEpoch++;state.running=null;state.channelA=0;state.channelB=0;
      await post({command:"state",state});
    }
  });
  await page.addInitScript(()=>{
    window.acquireVsCodeApi=()=>({postMessage:m=>window.fakeHost(m),getState:()=>({}),setState:()=>{}});
  });
  await page.route("http://coyote.test/**",route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==="/")return route.fulfill({contentType:"text/html",body:dashboardHtml("'self'","uitest","http://coyote.test/dashboard.css","http://coyote.test/dashboard.js")});
    const theme = ":root{--vscode-font-family:system-ui;--vscode-foreground:#d8e0ec;--vscode-sideBar-background:#121924;--vscode-descriptionForeground:#91a0b7;--vscode-textCodeBlock-background:#1b2533;--vscode-button-background:#346cc9;--vscode-button-foreground:#fff;--vscode-button-secondaryBackground:#29374b;--vscode-button-secondaryForeground:#d8e0ec;--vscode-focusBorder:#70b4ff;--vscode-panel-border:#334155;--vscode-input-background:#111a28;--vscode-input-foreground:#d8e0ec;}";
    return route.fulfill({contentType:pathname.endsWith(".css")?"text/css":"application/javascript",body:(pathname.endsWith(".css")?theme:"")+fs.readFileSync("resources"+pathname,"utf8")});
  });
  await page.goto("http://coyote.test/");
  await expect(page.locator("#errors")).toHaveText("8");
  await expect(page.locator("#errorDelta")).toHaveText("减少 6 个");
  await page.locator("#connect").click();
  await expect(page.locator("#connect")).toBeDisabled();
  await expect(page.locator("#connect")).toHaveText("正在连接…");
  await expect(page.locator("#connection")).toContainText("连接中");
  await expect(page.locator("#connectionMessage")).toContainText("正在搜索 D-LAB 设备");
  await expect(page.locator("#connectionMessage")).toContainText("已等待");
  await expect(page.locator("#connectionHint")).toContainText("仍在等待蓝牙响应");
  state.connection.message="正在读取控制服务";
  await post({command:"state",state});
  await expect(page.locator("#connectionMessage")).toContainText("正在读取控制服务");
  state.connecting=false;
  state.connection={state:"error",message:"正在读取控制服务失败",error:"<b>GATT unavailable</b>"};
  await post({command:"state",state});
  await expect(page.locator("#connect")).toBeEnabled();
  await expect(page.locator("#connect")).toHaveText("重试连接");
  await expect(page.locator("#connectionError")).toHaveText("<b>GATT unavailable</b>");
  await expect(page.locator("#connectionError b")).toHaveCount(0);
  await page.setViewportSize({width:280,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("connection-error.png"),fullPage:true});
  await page.locator("#connect").click();
  await expect(page.locator("#connectionError")).toBeHidden();
  state.connecting=false;state.connected=true;
  state.connection={state:"connected",message:"已连接 D-LAB ESTIM01",error:""};
  await post({command:"state",state});
  await expect(page.locator("#connect")).toHaveText("已连接");
  await expect(page.locator("#connectionHint")).toBeHidden();
  state.connected=false;state.connection={state:"disconnected",message:"设备连接已断开",error:""};
  await post({command:"state",state});
  await expect(page.locator("#connectionMessage")).toHaveText("设备连接已断开");
  await expect(page.locator("#connect")).toBeEnabled();
  await page.getByRole("tab",{name:"波形",exact:true}).click();
  await expect(page.locator(".wave-card")).toHaveCount(Object.keys(waveforms).length);
  await page.locator('.wave-card[data-id="heartbeat"]').click();
  await expect(page.locator("#previewTitle")).toHaveText("节奏脉冲");
  await page.locator("#previewPlay").click();
  await expect(page.locator("#scrub")).not.toHaveValue("0");
  await page.locator("#previewPlay").click();
  await expect(page.locator("#manual")).toBeDisabled();
  await page.locator("#manualA").fill("33");
  await page.locator("#manualB").fill("44");
  await page.getByRole("tab",{name:"规则",exact:true}).click();
  await page.locator("#maxIntensity").fill("0");
  await page.locator("#cooldownSeconds").fill("0");
  await post({command:"state",state});
  await expect(page.locator("#maxIntensity")).toHaveValue("0");
  await expect(page.locator("#simulation")).toContainText("强度 0");
  await page.locator("#saveConfig").click();
  await expect(page.locator("#draftStatus")).toHaveText("已保存");
  await expect(page.locator("#manualA")).toHaveValue("33");
  await expect(page.locator("#manualB")).toHaveValue("44");
  expect(state.config.maxIntensity).toBe(0);
  expect(state.config.cooldown).toBe(0);
  await page.locator("#maxIntensity").fill("100");
  await page.locator("#errorMapping").selectOption("stepped");
  await page.locator("#reminderEnd").fill("10");
  await page.locator("#warningEnd").fill("30");
  await page.locator("#simulateCount").fill("11");
  await expect(page.locator("#simulation")).toContainText("断续警示");
  await expect(page.locator("#waveformName")).toBeDisabled();
  await page.locator("#presetName").fill("专注");
  await page.locator("#presetSave").click();
  await expect.poll(()=>sent.some(m=>m.command==="presetSave" && m.name==="专注")).toBe(true);
  expect(sent.some(m=>m.command==="manual")).toBe(false);
  await page.getByRole("tab",{name:"AI 场景",exact:true}).click();
  state.connected=true;state.bridgeEnabled=true;
  state.connection={state:"connected",message:"已连接 D-LAB ESTIM01",error:""};
  state.pending={id:"test-proposal",plan:scenePlan("reminder",normalizeConfig()),reason:"<script>alert('x')</script> 建议先提醒",expiresAt:Date.now()+120000};
  await post({command:"state",state});
  await expect(page.locator("#proposalReason")).toHaveText(state.pending.reason);
  await page.locator("#approve").click();
  await expect.poll(()=>sent.some(m=>m.command==="approve"&&m.id==="test-proposal")).toBe(true);
  await page.screenshot({path:testInfo.outputPath("ai-scene.png"),fullPage:true});
  await page.getByRole("tab",{name:"概览",exact:true}).click();
  await page.setViewportSize({width:280,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("overview.png"),fullPage:true});
  await page.getByRole("tab",{name:"波形",exact:true}).click();
  state.pending=null;state.cooldownRemaining=1000;
  await post({command:"state",state});
  await page.locator("#manualChannel").selectOption("AB");
  await page.locator("#manualDuration").fill("4000");
  await page.locator("#manualInterval").fill("100");
  await page.locator("#setManualIntensity").click();
  await expect(page.locator("#channelA")).toHaveText("33");
  await expect(page.locator("#channelB")).toHaveText("44");
  await expect(page.locator("#manualActual")).toContainText("写入成功");
  await page.locator("#manual").click();
  await expect.poll(()=>sent.some(m=>m.command==="manual"&&m.channel==="AB"&&m.durationMs===4000&&m.a===33&&m.b===44)).toBe(true);
  await expect(page.locator("#setManualIntensity")).toBeEnabled();
  await page.locator("#manualChannel").selectOption("B");
  await expect.poll(()=>state.running.channel).toBe("B");
  await page.locator("#manualLive").check();
  await page.locator("#manualB").fill("14");
  await expect(page.locator("#channelB")).toHaveText("14");
  expect(state.running.durationMs).toBe(4000);
  await post({command:"state",state:{...state,channelA:21,intensitySource:"notification"}});
  await expect(page.locator("#manualActual")).toContainText("A=21");
  await expect(page.locator("#manualActual")).toContainText("设备通知");
  await page.screenshot({path:testInfo.outputPath("manual.png"),fullPage:true});
  await page.locator("#stop").click();
  await expect(page.locator("#channelA")).toHaveText("0");
  await expect(page.locator("#channelB")).toHaveText("0");
  state.version=3;state.hasDeviceIntensity=false;
  await post({command:"state",state});
  await expect(page.locator("#protocolVersion")).toHaveText("COYOTE / V3");
  await expect(page.locator("#manualRead")).toBeDisabled();
  state.hasDeviceIntensity=true;state.intensitySource="notification";
  await post({command:"state",state});
  await expect(page.locator("#manualRead")).toBeEnabled();
  await expect(page.locator("#manualRead")).toHaveText("使用最近 B1 回报");
  expect(errors).toEqual([]);
});
