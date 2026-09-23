"use strict";
function dashboardHtml(csp, nonce, css, js) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"><title>Coyote 控制台</title></head><body>
<header>
<div class="brand"><div><span id="protocolVersion" class="eyebrow">COYOTE / V2 · V3</span></div><span id="connection" class="badge">未连接</span></div>
<div class="device-line"><span id="device">等待设备</span><span id="battery">电量 —</span></div>
<div class="channels"><div><span>A 通道</span><strong id="channelA">0</strong></div><div><span>B 通道</span><strong id="channelB">0</strong></div></div>
<div class="actions"><button id="connect">连接设备</button><button id="stop" class="danger">■ 停止全部</button></div>
<div id="connectionStatus" class="connection-status" role="status" aria-live="polite" aria-atomic="true"><span id="connectionMessage">尚未连接设备</span><p id="connectionError" hidden></p></div>
<p id="connectionHint" class="small" hidden></p>
<p id="autoStatus" class="small" role="status" aria-live="polite">自动触发已关闭</p>
<p class="small">停止全部 · Ctrl+Alt+S</p>
<nav role="tablist" aria-label="控制台页面">
<button role="tab" aria-selected="true" aria-controls="overview" id="tab-overview" data-tab="overview">概览</button>
<button role="tab" aria-selected="false" aria-controls="waves" id="tab-waves" data-tab="waves" tabindex="-1">波形</button>
<button role="tab" aria-selected="false" aria-controls="rules" id="tab-rules" data-tab="rules" tabindex="-1">规则</button>
<button role="tab" aria-selected="false" aria-controls="ai" id="tab-ai" data-tab="ai" tabindex="-1">AI 场景</button>
</nav></header>
<div id="notice" role="status" aria-live="polite"></div>
<main>
<section id="overview" role="tabpanel" aria-labelledby="tab-overview">
<div class="hero"><span class="eyebrow">当前状态</span><h2 id="runName">待机</h2><p id="runDetail">连接设备，或先离线预览波形。</p><progress id="runProgress" max="1" value="0" aria-label="运行进度"></progress><p id="cooldown" class="small">无冷却</p></div>
<div class="metrics"><article><span>当前错误</span><strong id="errors">0</strong><small id="errorDelta">暂无变化</small></article><article><span>连续通过</span><strong id="streak">0</strong><small>保存 / 构建检查</small></article></div>
<article><h2>快速预设</h2><p class="small">保存整套规则，在不同工作节奏间切换。</p><label>预设<select id="presets"><option value="">暂无预设</option></select></label><button id="presetLoad" class="secondary">加载预设</button></article>
<article><h2>事件记录</h2><ol id="events" class="events"><li>等待首次操作</li></ol></article>
<details><summary>设备与调试</summary><div class="actions"><button id="batteryRead" class="secondary">读取电量</button><button id="disconnect" class="secondary">断开连接</button></div><button id="readIntensity" class="secondary">从设备读取 A/B 强度</button><pre id="raw">BLE Raw: —</pre></details>
</section>
<section id="waves" role="tabpanel" aria-labelledby="tab-waves" hidden>
<article><h2>手动控制</h2>
<label>波形输出通道<select id="manualChannel"><option value="A">A 通道</option><option value="B">B 通道</option><option value="AB">A + B 双通道</option></select></label>
<div class="pair"><label>A 强度<input id="manualA" type="number" min="0" max="200" step="1" value="0" required><input id="manualSliderA" aria-label="A 强度滑块" type="range" min="0" max="200" value="0"><span class="actions"><button data-adjust="A" data-step="-1" class="secondary" aria-label="A 强度减一">−</button><button data-adjust="A" data-step="1" class="secondary" aria-label="A 强度加一">+</button></span></label>
<label>B 强度<input id="manualB" type="number" min="0" max="200" step="1" value="0" required><input id="manualSliderB" aria-label="B 强度滑块" type="range" min="0" max="200" value="0"><span class="actions"><button data-adjust="B" data-step="-1" class="secondary" aria-label="B 强度减一">−</button><button data-adjust="B" data-step="1" class="secondary" aria-label="B 强度加一">+</button></span></label></div>
<label class="check"><input id="manualLive" type="checkbox">实时调节（修改强度即写入）</label>
<div class="actions"><button id="setManualIntensity">设置 A/B 强度</button><button id="manualRead" class="secondary">从设备读取</button></div>
<p id="manualActual" role="status">当前强度：A=0 / B=0</p>
<div class="pair"><label>持续时长 ms<input id="manualDuration" type="number" min="100" max="30000" step="100" value="5000" required></label><label>帧间隔 ms<input id="manualInterval" type="number" min="20" max="5000" value="100" required></label></div>
<div class="actions"><button id="manual">开始所选波形</button><button id="stopManual" class="secondary">停止波形</button></div>
<p id="manualDetail" class="small">手动强度、通道和时长独立于自动规则。停止波形保留强度设置；停止全部归零。</p>
</article>
<div class="section-title"><h2>波形库</h2><span class="badge">可离线预览</span></div>
<div id="waveCards" class="wave-grid"></div>
<article><h2 id="previewTitle">节奏预览</h2><canvas id="preview" width="600" height="180" aria-label="计划波形脉宽随时间变化"></canvas>
<label>时间轴<input id="scrub" type="range" min="0" max="0" value="0" step="1"></label>
<p id="frameInfo" class="small"></p><button id="previewPlay" class="secondary">播放预览</button>
<p class="small">图形表示计划脉宽与帧节奏，不是设备测量结果。每帧 100ms。</p>
</article>
</section>
<section id="rules" role="tabpanel" aria-labelledby="tab-rules" hidden>
<article><h2>触发规则</h2>
<label class="check"><input id="autoTrigger" type="checkbox">启用保存 / 构建自动触发</label>
<p class="small">勾选后还需点击「保存规则」；构建仅监听 VS Code Task，不监听普通终端命令。</p>
<label>统计范围<select id="scope"><option value="workspace">工作区</option><option value="file">当前文件 / 保存的文件</option></select></label>
<label class="check"><input id="onlyNew" type="checkbox">只统计本次会话新增错误</label>
<label class="check"><input id="ignoreSameErrors" type="checkbox">同一批错误只触发一次</label>
<p class="small">开启后，错误集合变化或清零才允许再次触发；关闭时冷却结束后可再次触发。</p>
<label>输出通道<select id="channel"><option>A</option><option>B</option><option value="AB">A + B</option></select></label>
<label class="check"><input id="scaleByErrors" type="checkbox">随错误数调整</label>
<label>映射方式<select id="errorMapping"><option value="composite">对数—幂律（100 个到上限）</option><option value="stepped">多阶段阶跃</option></select></label>
<div id="thresholds" class="pair"><label>提醒结束<input id="reminderEnd" type="number" min="1" max="999"></label><label>警示结束<input id="warningEnd" type="number" min="2" max="10000"></label></div>
<div class="pair"><label>基础强度<input id="intensity" type="number" min="0" max="200"></label><label>强度上限<input id="maxIntensity" type="number" min="0" max="200"></label></div>
<div class="pair"><label>基础时长 ms<input id="durationMs" type="number" min="100" max="30000" step="100"></label><label>时长上限 ms<input id="maxDurationMs" type="number" min="100" max="30000" step="100"></label></div>
<label>冷却秒数<input id="cooldownSeconds" type="number" min="0" max="3600"></label>
<label>固定 / 连续映射波形<select id="waveformName"></select></label>
<p id="mappingHint" class="small"></p>
<button id="saveConfig">保存规则</button><p id="draftStatus" class="small">已保存</p>
</article>
<article><h2>规则试算</h2><label>模拟错误数<input id="simulateCount" type="number" min="0" max="1000000" value="5"></label>
<p id="simulation" role="status">正在计算…</p><canvas id="simulationCanvas" width="600" height="130" aria-label="试算波形"></canvas>
<p class="small">使用当前表单试算，不启动设备；0 错误不输出。</p></article>
<article><h2>保存为预设</h2><label>名称<input id="presetName" maxlength="40" placeholder="例如：专注调试"></label><button id="presetSave" class="secondary">保存当前表单为预设</button></article>
</section>
<section id="ai" role="tabpanel" aria-labelledby="tab-ai" hidden>
<article><span class="eyebrow">SCENE DIRECTOR</span><h2>让对话选择节奏</h2><p>在 DeepSeek Harness 中对话，AI 提案会出现在这里。你可以应用、跳过，或随时停止。</p>
<button id="bridgeToggle">开启 AI 接入</button><button id="copyMcp" class="secondary" disabled>复制 Harness 配置</button>
<p class="small">本机连接。配置包含本次会话凭据，重新开启接入后需要重新复制。</p></article>
<article id="proposalCard"><h2 id="proposalTitle">等待 AI 提案</h2><p id="proposalReason">开启接入并配置 Harness 后，可以说：“先看看设备状态，再建议一个节奏提醒场景。”</p><p id="proposalPlan" class="small"></p>
<div class="actions"><button id="approve" disabled>应用场景</button><button id="dismiss" class="secondary" disabled>跳过</button></div></article>
<article><h2>对话进度</h2><p id="proposalStatus">暂无提案</p><p class="small">AI 可读取状态、列举场景、提交提案和停止输出。强度、时长与通道使用本地规则。</p></article>
</section></main>
<script nonce="${nonce}" src="${js}"></script></body></html>`;
}
module.exports = { dashboardHtml };
