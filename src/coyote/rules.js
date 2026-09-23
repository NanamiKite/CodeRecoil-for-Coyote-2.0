"use strict";
const { waveforms } = require("./waveforms");

const defaults = Object.freeze({
  autoTrigger: false, intensity: 50, maxIntensity: 200, durationMs: 1000,
  maxDurationMs: 5000, cooldown: 15, scaleByErrors: true, errorMapping: "composite",
  waveformName: "frequencySweep", channel: "A", reminderEnd: 3, warningEnd: 15,
  scope: "workspace", onlyNew: false, ignoreSameErrors: false,
});
function number(value, fallback, min, max) {
  if (value === "" || value == null || !Number.isFinite(Number(value))) return fallback;
  return Math.max(min, Math.min(max, Math.round(Number(value))));
}
function normalizeConfig(input = {}) {
  const c = { ...defaults, ...input };
  const reminderEnd = number(c.reminderEnd, 3, 1, 999);
  return {
    autoTrigger: c.autoTrigger === true,
    intensity: number(c.intensity, 50, 0, 200), maxIntensity: number(c.maxIntensity, 200, 0, 200),
    durationMs: number(c.durationMs, 1000, 100, 30000), maxDurationMs: number(c.maxDurationMs, 5000, 100, 30000),
    cooldown: number(c.cooldown, 15, 0, 3600), scaleByErrors: c.scaleByErrors !== false,
    errorMapping: c.errorMapping === "stepped" ? "stepped" : "composite",
    waveformName: Object.hasOwn(waveforms, c.waveformName) ? c.waveformName : defaults.waveformName,
    channel: ["A", "B", "AB"].includes(c.channel) ? c.channel : "A",
    reminderEnd, warningEnd: number(c.warningEnd, Math.max(15, reminderEnd + 1), reminderEnd + 1, 10000),
    scope: c.scope === "file" ? "file" : "workspace", onlyNew: c.onlyNew === true,
    ignoreSameErrors: c.ignoreSameErrors === true,
  };
}
const scenes = [
  { id: "reminder", name: "节奏提醒", description: "间歇脉冲，使用基础强度", weight: 0 },
  { id: "warning", name: "断续警示", description: "50Hz，0.5 秒输出 / 0.5 秒暂停", weight: 0.5 },
  { id: "mixed", name: "疏密变化", description: "有界的疏密与脉宽变化，使用配置上限", weight: 1 },
];
function scenePlan(id, input) {
  const cfg = normalizeConfig(input);
  const scene = scenes.find(s => s.id === id);
  if (!scene) throw new Error("未知场景");
  const base = Math.min(cfg.intensity, cfg.maxIntensity);
  const duration = Math.min(cfg.durationMs, cfg.maxDurationMs);
  const frames = id === "reminder"
    ? [[1,199,8],[1,199,0],[1,199,8],[1,199,0],[1,199,8],[1,199,0],[1,199,0],[1,199,0],[1,199,0],[1,199,0]]
    : id === "warning"
      ? Array.from({ length: 10 }, (_, i) => [1,19,i < 5 ? 12 : 0])
      : [[1,99,4],[2,48,7],[3,30,10],[4,21,13],[5,15,15],[3,37,11],[2,68,8],[1,149,5],[4,24,12],[1,19,15]];
  return {
    name: scene.name, sceneId: id, channel: cfg.channel, waveformInterval: 100,
    intensity: Math.round(base + (cfg.maxIntensity - base) * scene.weight),
    durationMs: Math.round(duration + (cfg.maxDurationMs - duration) * scene.weight),
    waveformData: frames,
  };
}
function planErrors(count, input) {
  const cfg = normalizeConfig(input);
  const e = number(count, 0, 0, 1000000);
  if (!e) return { name: "无错误", intensity: 0, durationMs: 0, channel: cfg.channel, waveformData: [], waveformInterval: 100 };
  if (cfg.scaleByErrors && cfg.errorMapping === "stepped") {
    return scenePlan(e <= cfg.reminderEnd ? "reminder" : e <= cfg.warningEnd ? "warning" : "mixed", cfg);
  }
  const base = Math.min(cfg.intensity, cfg.maxIntensity);
  const duration = Math.min(cfg.durationMs, cfg.maxDurationMs);
  const progress = Math.min(1, Math.log1p(0.15 * e ** 1.4) / Math.log1p(0.15 * 100 ** 1.4));
  return {
    name: cfg.scaleByErrors ? "对数—幂律" : "固定", channel: cfg.channel, waveformInterval: 100,
    intensity: cfg.scaleByErrors ? Math.round(base + (cfg.maxIntensity - base) * progress) : base,
    durationMs: cfg.scaleByErrors ? Math.round(duration + (cfg.maxDurationMs - duration) * Math.min((e-1)/99,1)) : duration,
    waveformData: waveforms[cfg.waveformName].data.map(([x,y,z]) => [x,y,Math.min(z,15)]),
  };
}
module.exports = { defaults, normalizeConfig, planErrors, scenePlan, scenes };
