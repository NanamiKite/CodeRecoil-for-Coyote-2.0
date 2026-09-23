/* global acquireVsCodeApi */
"use strict";
const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
const saved = vscode.getState() || {};
let catalog = {}, state, selected = saved.waveform || "frequencySweep", dirty = false;
let configSignature = "", previewTimer, simulateTimer, simulationId = 0, proposalId;
let manualInitialized = false, manualTimer;
let manualSettingsInitialized = false;
const fields = ["autoTrigger","scope","onlyNew","ignoreSameErrors","channel","scaleByErrors","errorMapping","reminderEnd","warningEnd","intensity","maxIntensity","durationMs","maxDurationMs","waveformName"];
const booleans = new Set(["autoTrigger","onlyNew","ignoreSameErrors","scaleByErrors"]);
const numbers = new Set(["reminderEnd","warningEnd","intensity","maxIntensity","durationMs","maxDurationMs"]);
function send(command, data = {}) { vscode.postMessage({ command, ...data }); }
function saveView() { vscode.setState({ tab: document.querySelector('[role=tab][aria-selected=true]').dataset.tab, waveform: selected }); }
function tab(id) {
  document.querySelectorAll("[data-tab]").forEach(button => {
    const active = button.dataset.tab === id;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    $(button.dataset.tab).hidden = !active;
  });
  saveView(); drawPreview();
}
document.querySelectorAll("[data-tab]").forEach((button,i,buttons) => {
  button.addEventListener("click", () => tab(button.dataset.tab));
  button.addEventListener("keydown", e => {
    if (!["ArrowLeft","ArrowRight","Home","End"].includes(e.key)) return;
    e.preventDefault();
    const n = e.key === "Home" ? 0 : e.key === "End" ? buttons.length-1 : (i+(e.key==="ArrowRight"?1:-1)+buttons.length)%buttons.length;
    buttons[n].focus(); tab(buttons[n].dataset.tab);
  });
});
function form() {
  const result = {};
  fields.forEach(key => { result[key] = booleans.has(key) ? $(key).checked : numbers.has(key) ? Number($(key).value) : $(key).value; });
  result.cooldown = Number($("cooldownSeconds").value);
  return result;
}
function hydrate(cfg) {
  fields.forEach(key => { if (booleans.has(key)) $(key).checked = cfg[key]; else $(key).value = cfg[key]; });
  $("cooldownSeconds").value = cfg.cooldown;
  configSignature = JSON.stringify(cfg);
  dirty = false;
  $("draftStatus").textContent = "已保存";
  mappingHint(); simulate();
}
function mappingHint() {
  const stepped = $("errorMapping").value === "stepped" && $("scaleByErrors").checked;
  $("thresholds").hidden = !stepped;
  $("waveformName").disabled = stepped;
  $("mappingHint").textContent = stepped
    ? "阶段使用内建波形。提醒结束 " + $("reminderEnd").value + "；警示结束 " + $("warningEnd").value + "，之后进入疏密变化。"
    : "使用所选波形；关闭随错误数调整时，按基础强度与时长执行。";
}
function simulate() {
  clearTimeout(simulateTimer);
  simulateTimer = setTimeout(() => send("simulate", { id: ++simulationId, count: Number($("simulateCount").value), config: form() }), 120);
}
[...fields,"cooldownSeconds"].forEach(id => $(id).addEventListener("input", () => {
  dirty = true; $("draftStatus").textContent = "有未保存更改 · 试算已使用当前表单"; mappingHint(); simulate();
  $("autoStatus").textContent = "规则有未保存更改；" + (state?.autoStatus || "请保存规则后生效");
}));
$("simulateCount").addEventListener("input", simulate);
$("saveConfig").onclick = () => {
  const invalid = [...fields,"cooldownSeconds"].map($).find(el => !el.checkValidity());
  if (invalid) { invalid.reportValidity(); return; }
  if (Number($("warningEnd").value) <= Number($("reminderEnd").value)) {
    $("notice").textContent = "警示结束必须大于提醒结束"; return;
  }
  send("config", { config: form() });
};
for (const id of ["connect","disconnect","stop"]) $(id).onclick = () => { clearTimeout(manualTimer); send(id); };
$("batteryRead").onclick = () => send("battery");
$("manual").onclick = () => {
  for (const id of ["manualA","manualB","manualDuration","manualInterval"]) if (!$(id).reportValidity()) return;
  clearTimeout(manualTimer);
  send("manual", { waveform: selected, channel:$("manualChannel").value, durationMs:Number($("manualDuration").value), waveformInterval:Number($("manualInterval").value), a: Number($("manualA").value), b: Number($("manualB").value) });
};
function setManualLevels(a,b) {
  $("manualA").value = a; $("manualB").value = b;
  $("manualSliderA").value = a; $("manualSliderB").value = b;
}
function applyManualLevels() {
  clearTimeout(manualTimer);
  for (const id of ["manualA","manualB"]) if (!$(id).reportValidity()) return;
  send("setManualIntensity", { a:Number($("manualA").value), b:Number($("manualB").value) });
}
function manualEdited() {
  manualInitialized = true;
  clearTimeout(manualTimer);
  if ($("manualLive").checked && state?.connected && (!state.running || state.running.mode==="manual")) {
    manualTimer = setTimeout(applyManualLevels,120);
  }
}
for (const channel of ["A","B"]) {
  $("manual"+channel).addEventListener("input", () => {
    if ($("manual"+channel).checkValidity()) $("manualSlider"+channel).value = $("manual"+channel).value;
    manualEdited();
  });
  $("manualSlider"+channel).addEventListener("input", () => { $("manual"+channel).value = $("manualSlider"+channel).value; manualEdited(); });
}
document.querySelectorAll("[data-adjust]").forEach(button => button.onclick = () => {
  const channel=button.dataset.adjust;
  $("manual"+channel).value = Math.max(0,Math.min(200,Number($("manual"+channel).value)+Number(button.dataset.step)));
  $("manualSlider"+channel).value = $("manual"+channel).value;
  manualEdited();
});
$("manualLive").onchange = () => clearTimeout(manualTimer);
$("setManualIntensity").onclick = applyManualLevels;
$("manualRead").onclick = () => { clearTimeout(manualTimer); send("readIntensity", { syncManual:true }); };
$("manualChannel").onchange = () => send("manualChannel", { channel:$("manualChannel").value });
$("stopManual").onclick = () => { clearTimeout(manualTimer); send("stopManual"); };
$("readIntensity").onclick = () => send("readIntensity");
$("bridgeToggle").onclick = () => send("bridgeToggle");
$("copyMcp").onclick = () => send("copyMcp");
$("approve").onclick = () => send("approve", { id: proposalId });
$("dismiss").onclick = () => send("dismiss");
$("presetSave").onclick = () => send("presetSave", { name: $("presetName").value, config: form() });
$("presetLoad").onclick = () => send("presetLoad", { name: $("presets").value });
function graph(canvas, frames, cursor = -1) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  if (!frames?.length) return;
  const color = getComputedStyle(document.body).getPropertyValue("--vscode-charts-blue").trim() || "#519cff";
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  frames.forEach((f,i) => {
    const x = i*w/frames.length, y = h-8-(Math.min(15,f[2])/15)*(h-18);
    if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    ctx.lineTo((i+1)*w/frames.length,y);
  });
  ctx.stroke();
  if (cursor >= 0) {
    ctx.fillStyle = color; ctx.globalAlpha = .16; ctx.fillRect(cursor*w/frames.length,0,w/frames.length,h); ctx.globalAlpha = 1;
  }
}
function drawPreview() {
  const wave = catalog[selected];
  if (!wave) return;
  const index = Math.min(Number($("scrub").value),wave.data.length-1);
  const [x,y,z] = wave.data[index];
  graph($("preview"), wave.data,index);
  $("previewTitle").textContent = wave.name;
  $("frameInfo").textContent = (index*100) + "ms · 第 " + (index+1) + " 帧 · " +
    (z ? "脉冲组重复率 " + (1000/(x+y)).toFixed(1) + "Hz · 脉宽 " + Math.min(z,15)*5 + "μs" : "暂停输出");
}
function selectWave(id) {
  selected = id; $("scrub").max = catalog[id].data.length-1; $("scrub").value = 0;
  document.querySelectorAll(".wave-card").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id===id)));
  drawPreview(); saveView();
}
$("scrub").oninput = drawPreview;
$("previewPlay").onclick = () => {
  if (previewTimer) { clearInterval(previewTimer); previewTimer = null; $("previewPlay").textContent = "播放预览"; return; }
  $("previewPlay").textContent = "暂停预览";
  previewTimer = setInterval(() => {
    if (!catalog[selected]) return;
    $("scrub").value = (Number($("scrub").value)+1)%catalog[selected].data.length; drawPreview();
  },100);
};
function renderCatalog(waveforms) {
  catalog = waveforms; $("waveCards").replaceChildren(); $("waveformName").replaceChildren();
  Object.entries(catalog).forEach(([id,wave]) => {
    const button = document.createElement("button");
    button.className = "wave-card"; button.dataset.id = id; button.setAttribute("aria-pressed","false");
    const title = document.createElement("span"); title.textContent = wave.name;
    const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 60; canvas.setAttribute("aria-hidden","true");
    button.append(title,canvas); button.onclick = () => selectWave(id); $("waveCards").append(button); graph(canvas,wave.data);
    const option = document.createElement("option"); option.value = id; option.textContent = wave.name; $("waveformName").append(option);
  });
  selectWave(Object.hasOwn(catalog,selected) ? selected : Object.keys(catalog)[0]);
  if (state) hydrate(state.config);
}
let eventSignature = "", presetSignature = "";
function render(s) {
  if (state && s.controlEpoch !== state.controlEpoch) clearTimeout(manualTimer);
  state = s;
  if (!manualSettingsInitialized && s.manual) {
    $("manualChannel").value = s.manual.channel;
    $("manualDuration").value = s.manual.durationMs;
    $("manualInterval").value = s.manual.waveformInterval;
    manualSettingsInitialized = true;
  }
  const connecting = !!s.connecting;
  const scanning = s.connection?.state === "scanning";
  const selecting = s.connection?.state === "selecting";
  const failed = s.connection?.state === "error";
  const elapsed = connecting ? Math.max(0, Math.floor((Date.now() - (s.connection?.startedAt || Date.now())) / 1000)) : 0;
  $("connection").textContent = selecting ? "◌ 选择设备" : scanning ? "◌ 扫描中" : connecting ? "◌ 连接中" : s.connected ? "● 已连接" : failed ? "! 连接失败" : "○ 未连接";
  $("protocolVersion").textContent = s.version ? "COYOTE / V" + s.version : "COYOTE / V2 · V3";
  $("connectionStatus").dataset.state = s.connection?.state || "idle";
  $("connectionMessage").textContent = (s.connection?.message || (s.connected ? "设备已连接" : "尚未连接设备")) + (connecting ? " · 已等待 " + elapsed + " 秒" : "");
  $("connectionError").hidden = !s.connection?.error;
  $("connectionError").textContent = s.connection?.error || "";
  $("connectionHint").hidden = !connecting && !failed && !(s.connected && s.version === 3);
  $("connectionHint").textContent = failed
    ? "请检查电脑蓝牙、设备电源与距离，以及设备是否被手机 App 或其他程序占用，然后点击重试。"
    : selecting ? "请在 VS Code 顶部列表中按设备 ID 选择要连接的主机。"
    : scanning ? "正在查找郊狼主机，扫描结束后会列出设备 ID。"
    : elapsed >= 15 ? "连接仍在等待蓝牙响应。请检查设备电源、电脑蓝牙，以及是否有其他程序占用设备。"
    : connecting ? "请保持设备开机并靠近电脑。"
    : "V3 已写入持久化设备参数：A/B 强度软上限 200，频率和强度平衡参数均为 128。";
  $("autoStatus").textContent = dirty ? "规则有未保存更改；" + s.autoStatus : s.autoStatus;
  $("device").textContent = s.deviceName ? s.deviceName + (s.deviceId ? " · " + s.deviceId : "") : "等待设备";
  $("battery").textContent = "电量 " + (s.battery == null ? "—" : s.battery+"%");
  $("channelA").textContent = s.channelA; $("channelB").textContent = s.channelB;
  $("connect").disabled = s.connected || connecting;
  $("connect").textContent = selecting ? "选择设备中…" : scanning ? "正在扫描…" : connecting ? "正在连接…" : s.connected ? "已连接" : failed ? "重试连接" : "连接设备";
  $("connect").setAttribute("aria-busy", String(connecting));
  $("disconnect").disabled = !s.connected || connecting;
  $("batteryRead").disabled = !s.connected;
  const canReadIntensity = s.connected && (s.version !== 3 || s.hasDeviceIntensity);
  $("readIntensity").disabled = !canReadIntensity;
  $("readIntensity").textContent = s.version === 3 ? "使用最近 B1 回报的 A/B 强度" : "从设备读取 A/B 强度";
  const sceneBusy = !!s.running && s.running.mode !== "manual";
  $("manual").disabled = !s.connected || !!s.running;
  $("setManualIntensity").disabled = !s.connected || sceneBusy;
  $("manualRead").disabled = !canReadIntensity;
  $("manualRead").textContent = s.version === 3 ? "使用最近 B1 回报" : "从设备读取";
  $("manualChannel").disabled = sceneBusy;
  $("stopManual").disabled = s.running?.mode !== "manual";
  if (!s.connected || sceneBusy) clearTimeout(manualTimer);
  if (!manualInitialized && s.connected) {
    setManualLevels(s.channelA,s.channelB); manualInitialized = true;
  }
  const source = {write:"写入成功",read:"设备读取",notification:"设备通知"}[s.intensitySource] || "当前已知值";
  $("manualActual").textContent = "当前强度：A="+s.channelA+" / B="+s.channelB+" · "+source;
  $("runName").textContent = s.running?.name || "待机";
  const remaining = s.running ? Math.max(0,s.running.endsAt-Date.now()) : 0;
  $("runDetail").textContent = s.running ? s.running.source+" · "+s.running.channel+" 通道 · 剩余 "+(remaining/1000).toFixed(1)+" 秒" : "可先预览波形，再开始本轮场景。";
  $("runProgress").value = s.running ? 1-remaining/s.running.durationMs : 0;
  $("cooldown").textContent = s.cooldownRemaining ? "冷却剩余 "+s.cooldownRemaining+" 秒" : "无冷却";
  $("errors").textContent = s.errorCount; $("streak").textContent = s.streak;
  const delta = s.errorCount - s.previousErrors;
  $("errorDelta").textContent = delta===0 ? "与上次相同" : delta<0 ? "减少 "+(-delta)+" 个" : "新增 "+delta+" 个";
  $("raw").textContent = "BLE Raw: "+s.raw;
  $("bridgeToggle").textContent = s.bridgeEnabled ? "关闭 AI 接入" : "开启 AI 接入";
  $("copyMcp").disabled = !s.bridgeEnabled;
  proposalId = s.pending?.id;
  $("proposalTitle").textContent = s.pending?.plan.name || "等待 AI 提案";
  $("proposalReason").textContent = s.pending?.reason || "在 Harness 中对话，AI 的场景建议会显示在这里。";
  $("proposalPlan").textContent = s.pending ? s.pending.plan.channel+" 通道 · 强度 "+s.pending.plan.intensity+" · "+s.pending.plan.durationMs+"ms · "+Math.max(0,Math.ceil((s.pending.expiresAt-Date.now())/1000))+"s 内有效" : "";
  $("approve").disabled = !s.pending || !s.connected || !!s.running || s.cooldownRemaining>0;
  $("dismiss").disabled = !s.pending;
  const statuses = { pending:"等待本地应用", applied:"已应用", skipped:"已跳过", failed:"执行失败", expired:"已过期", invalidated:"规则已更改，请重新提案" };
  $("proposalStatus").textContent = s.lastProposal ? (statuses[s.lastProposal.status] || s.lastProposal.status) : "暂无提案";
  if (!dirty && configSignature !== JSON.stringify(s.config) && Object.keys(catalog).length) hydrate(s.config);
  const signature = JSON.stringify(s.events);
  if (signature !== eventSignature) {
    eventSignature = signature; $("events").replaceChildren();
    if (!s.events.length) {
      const empty = document.createElement("li"); empty.textContent = "等待首次操作"; $("events").append(empty);
    } else { $("notice").textContent = s.events[0].text; }
    s.events.slice(0,15).forEach(item => {
      const li = document.createElement("li"), time = document.createElement("time"), text = document.createElement("span");
      time.textContent = new Date(item.time).toLocaleTimeString(); text.textContent = item.text; li.append(time,text); $("events").append(li);
    });
  }
  if (presetSignature !== JSON.stringify(s.presets)) {
    presetSignature = JSON.stringify(s.presets); $("presets").replaceChildren();
    if (!s.presets.length) {
      const empty = document.createElement("option"); empty.textContent = "暂无预设"; empty.value = ""; $("presets").append(empty);
    }
    s.presets.forEach(name => { const opt=document.createElement("option"); opt.value=name; opt.textContent=name; $("presets").append(opt); });
    $("presetLoad").disabled = !s.presets.length;
  }
}
window.addEventListener("message", ({data:m}) => {
  if (m.command === "state") render(m.state);
  if (m.command === "catalog") renderCatalog(m.waveforms);
  if (m.command === "configSaved") { dirty=false; configSignature=""; if(state) hydrate(m.config); }
  if (m.command === "error") $("notice").textContent = m.text;
  if (m.command === "intensityRead") { setManualLevels(m.a,m.b); manualInitialized=true; }
  if (m.command === "simulation" && m.id === simulationId) {
    $("simulation").textContent = m.plan.name+" · "+m.plan.channel+" 通道 · 强度 "+m.plan.intensity+" · "+m.plan.durationMs+"ms";
    graph($("simulationCanvas"),m.plan.waveformData);
  }
});
tab(["overview","waves","rules","ai"].includes(saved.tab)?saved.tab:"overview");
send("ready");
