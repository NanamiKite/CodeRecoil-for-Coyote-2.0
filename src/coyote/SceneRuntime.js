"use strict";
const { EventEmitter } = require("events");
const { normalizeConfig } = require("./rules");

// All entry points share one serialized hardware writer and cancellation epoch.
class SceneRuntime extends EventEmitter {
  constructor(controller, config) {
    super();
    this.controller = controller;
    this.config = normalizeConfig(config);
    this.epoch = 0;
    this.queue = Promise.resolve();
    this.running = null;
    this.pending = null;
    this.events = [];
    this.lastStarted = 0;
    this.cooldownUntil = 0;
    this.lastProposal = null;
    this.disposed = false;
  }
  record(text) {
    this.events.unshift({ time: Date.now(), text });
    this.events = this.events.slice(0, 40);
    this.emit("change");
  }
  write(epoch, operation) {
    const job = this.queue.then(() => {
      if (epoch === this.epoch) return operation();
    });
    this.queue = job.catch(() => {});
    return job;
  }
  setConfig(input) {
    this.config = normalizeConfig(input);
    this.dismiss("invalidated"); // Approval always refers to the displayed parameters.
    this.emit("change");
  }
  async reconfigure(input) {
    if (this.configuring) throw new Error("正在保存规则");
    this.configuring = true;
    try {
      if (!this.manualControl) await this.stop("配置已更新");
      this.setConfig(input);
    } finally { this.configuring = false; }
  }
  propose(plan, reason) {
    if (this.disposed) throw new Error("控制台已关闭");
    if (this.pending) throw new Error("已有待处理场景，请等待用户应用或跳过");
    const id = require("crypto").randomUUID();
    this.pending = { id, plan, reason, expiresAt: Date.now() + 120000 };
    this.lastProposal = { id, status: "pending" };
    this.record("AI 提案：" + plan.name + " — " + reason);
    return { id, status: "pending", expiresAt: this.pending.expiresAt, plan };
  }
  dismiss(status = "skipped") {
    if (this.pending) this.lastProposal = { id: this.pending.id, status };
    this.pending = null;
    this.emit("change");
  }
  async approve(id) {
    const p = this.pending;
    if (!p || p.id !== id || Date.now() > p.expiresAt) {
      this.dismiss("expired");
      throw new Error("提案已过期或已变更，请重新请求");
    }
    this.pending = null;
    try {
      await this.start(p.plan, "AI 场景");
      this.lastProposal = { id, status: "applied" };
    } catch (e) {
      this.lastProposal = { id, status: "failed", message: e.message };
      throw e;
    } finally { this.emit("change"); }
  }
  async setManualIntensity(a, b) {
    if (this.disposed || this.configuring) throw new Error("控制台当前不可操作");
    if (!this.controller.connected) throw new Error("请先连接设备");
    if (this.running && this.running.mode !== "manual") throw new Error("请先停止自动 / AI 场景");
    if ([a,b].some(v => !Number.isInteger(v) || v < 0 || v > 200)) throw new Error("A/B 强度必须是 0–200 的整数");
    const epoch = this.epoch;
    await this.write(epoch, async () => {
      await this.controller.setIntensity(a,b);
      if (epoch !== this.epoch) return;
      this.manualControl = true;
      if (this.running?.mode === "manual") Object.assign(this.running, { intensityA:a, intensityB:b, intensity:Math.max(a,b) });
      this.record("手动强度：A=" + a + " / B=" + b);
    });
  }
  async setManualChannel(channel) {
    if (!["A","B","AB"].includes(channel)) throw new Error("无效通道");
    if (this.running && this.running.mode !== "manual") throw new Error("请先停止自动 / AI 场景");
    const epoch = this.epoch;
    await this.write(epoch, async () => {
      if (!this.running || this.running.mode !== "manual") return;
      this.running.channel = channel;
      // Clear the deselected output immediately; following frames read the live selection.
      if (this.controller.version === 3) {
        const elapsed = Math.max(0, Date.now() - (this.running.endsAt - this.running.durationMs));
        const current = this.running.waveformData[Math.floor(elapsed / (this.running.waveformInterval || 100)) % this.running.waveformData.length];
        const frames = [current,current,current,current];
        await this.controller.setWaveformWindow(channel.includes("A") ? frames : null, channel.includes("B") ? frames : null);
      } else {
        if (!channel.includes("A")) await this.controller.setWaveformA(0,0,0);
        if (!channel.includes("B") && epoch === this.epoch) await this.controller.setWaveformB(0,0,0);
      }
      this.emit("change");
    });
  }
  async startManual(plan) {
    return this.start(plan, "手动波形", { manual:true });
  }
  async stopManualWaveform(reason = "手动波形已停止") {
    if (this.running && this.running.mode !== "manual") throw new Error("当前不是手动波形");
    const epoch = ++this.epoch;
    clearTimeout(this.timer); clearTimeout(this.deadline);
    this.running = null;
    await this.write(epoch, async () => {
      if (!this.controller.connected) return;
      if (this.controller.version === 3) await this.controller.clearWaveforms();
      else {
        await this.controller.setWaveformA(0,0,0);
        if (epoch === this.epoch) await this.controller.setWaveformB(0,0,0);
      }
    });
    this.record(reason);
  }
  async start(plan, source = "手动", { manual = false } = {}) {
    if (this.disposed) throw new Error("控制台已关闭");
    if (this.configuring) throw new Error("正在保存规则，请稍后再试");
    if (!this.controller.connected) throw new Error("请先连接设备");
    if (this.running) throw new Error("已有场景运行，请先停止");
    if (!manual && Date.now() < this.cooldownUntil) throw new Error("冷却中，请稍后再试");
    const c = manual ? { maxIntensity:200, maxDurationMs:30000 } : this.config;
    const interval = manual ? (plan.waveformInterval ?? 100) : 100;
    if (!Number.isInteger(interval) || interval < 20 || interval > 5000) throw new Error("波形间隔必须为 20–5000ms");
    if (!["A", "B", "AB"].includes(plan.channel)) throw new Error("无效通道");
    if (!Number.isFinite(plan.intensity) || !Number.isFinite(plan.durationMs)) throw new Error("无效场景参数");
    const intensity = Math.max(0, Math.min(Math.round(plan.intensity), c.maxIntensity, 200));
    const levels = [plan.intensityA ?? intensity, plan.intensityB ?? intensity];
    if (levels.some(v => !Number.isFinite(v))) throw new Error("无效通道强度");
    const a = manual || plan.channel.includes("A") ? Math.max(0, Math.min(Math.round(levels[0]), c.maxIntensity, 200)) : 0;
    const b = manual || plan.channel.includes("B") ? Math.max(0, Math.min(Math.round(levels[1]), c.maxIntensity, 200)) : 0;
    const durationMs = Math.max(0, Math.min(Math.round(plan.durationMs), c.maxDurationMs, 30000));
    if ((!manual && !a && !b) || !durationMs) throw new Error("当前输出强度或时长为 0");
    const frames = plan.waveformData;
    if (!Array.isArray(frames) || !frames.length || frames.length > 1000) throw new Error("场景没有有效波形");
    const normalized = frames.map(frame => {
      if (!Array.isArray(frame) || frame.length !== 3 ||
          frame.some(v => !Number.isInteger(v)) ||
          frame[0] < 0 || frame[0] > 31 || frame[1] < 0 || frame[1] > 1023 || frame[2] < 0 || frame[2] > 15) {
        throw new Error("场景波形超出支持范围");
      }
      return [...frame];
    });
    const epoch = ++this.epoch;
    this.controller._clearAllTimers();
    this.manualControl = manual;
    const started = Date.now();
    this.lastStarted = started;
    if (!manual) this.cooldownUntil = started + c.cooldown * 1000;
    this.running = { ...plan, mode:manual ? "manual" : "scene", waveformData: normalized, intensity: Math.max(a,b), intensityA: a, intensityB: b, durationMs, source, endsAt: started + durationMs };
    this.record(source + "：" + plan.name + " / A=" + a + " / B=" + b);
    // Set the deadline BEFORE the first asynchronous BLE call.
    const finish = () => manual ? this.stopManualWaveform("手动波形完成") : this.stop("场景完成");
    this.deadline = setTimeout(() => finish().catch(e => this.record("停止失败：" + e.message)), durationMs);
    try {
      await this.write(epoch, () => this.controller.setIntensity(a, b));
      if (epoch !== this.epoch) return;
      let index = 0;
      const v3 = this.controller.version === 3;
      const sendInterval = v3 ? 100 : interval;
      const tick = async () => {
        if (epoch !== this.epoch || !this.running) return;
        if (!this.controller.connected || Date.now() >= started + durationMs) {
          await finish();
          return;
        }
        index = Math.max(index, Math.floor((Date.now() - started) / sendInterval));
        const windowStart = index++ * sendInterval;
        try {
          if (v3) {
            const frames = [0,25,50,75].map(offset => normalized[Math.floor((windowStart + offset) / interval) % normalized.length]);
            await this.write(epoch, () => this.controller.setWaveformWindow(
              this.running?.channel.includes("A") ? frames : null,
              this.running?.channel.includes("B") ? frames : null));
          } else {
            const f = normalized[Math.floor(windowStart / interval) % normalized.length];
            await this.write(epoch, () => this.running?.channel.includes("A") && this.controller.setWaveformA(...f));
            await this.write(epoch, () => this.running?.channel.includes("B") && this.controller.setWaveformB(...f));
          }
          if (epoch === this.epoch) {
            if (v3) index = Math.max(index, Math.floor((Date.now() - started) / sendInterval) + 1);
            this.timer = setTimeout(() => tick().catch(e => this.record(e.message)), Math.max(0, started + index * sendInterval - Date.now()));
          }
        } catch (e) {
          await this.stop("波形发送失败：" + e.message).catch(error => this.record("归零失败：" + error.message));
          throw e;
        }
      };
      await tick();
    } catch (e) {
      await this.stop("启动失败").catch(() => {});
      throw e;
    }
  }
  async stop(reason = "已停止") {
    ++this.epoch;
    this.manualControl = false;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.running = null;
    this.dismiss();
    this.controller._clearAllTimers();
    // Always enqueue zero after an in-flight write, even if another start arrives.
    const zero = this.queue.then(() => this.controller.emergencyStop());
    this.queue = zero.catch(() => {});
    this.record(reason);
    await zero;
    this.emit("change");
  }
  async dispose() {
    if (this.disposed) return this.disposePromise;
    this.disposed = true;
    this.disposePromise = this.stop("控制台关闭").finally(() => this.removeAllListeners());
    return this.disposePromise;
  }
}
module.exports = { SceneRuntime };
