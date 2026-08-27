const webbluetooth = require("webbluetooth");
const { CoyoteProtocol } = require("./CoyoteProtocol");
const { CoyoteSafety } = require("./CoyoteSafety");

const BATTERY_SERVICE = "955a180a-0fe2-f5aa-a094-84b8d4f3e8ad";
const CONTROL_SERVICE = "955a180b-0fe2-f5aa-a094-84b8d4f3e8ad";
const BATTERY_LEVEL = "955a1500-0fe2-f5aa-a094-84b8d4f3e8ad";
const PWM_AB2 = "955a1504-0fe2-f5aa-a094-84b8d4f3e8ad";
const PWM_A34 = "955a1505-0fe2-f5aa-a094-84b8d4f3e8ad";
const PWM_B34 = "955a1506-0fe2-f5aa-a094-84b8d4f3e8ad";

class CoyoteController {
  constructor() {
    this.device = null;
    this.server = null;

    this.batteryCharacteristic = null;

    this.pwmAB2 = null;
    this.pwmA34 = null;
    this.pwmB34 = null;

    this.connected = false;

    this.battery = null;

    /*
     * 这里保存的是 App 挡位，
     * 不是协议 S。
     *
     * 范围：0 ~ 200
     */
    this.channelA = 0;
    this.channelB = 0;

    /*
     * 最近一次实际发送给 PWM_AB2
     * 的 3 字节数据。
     */
    this.lastIntensityRaw = "--";

    this.active = false;

    this.protocol = new CoyoteProtocol();
    this.safety = new CoyoteSafety();

    // 惩罚定时器句柄
    this.pulseTimer = null;

    // 波形刷新定时器句柄（惩罚期间每 100ms 重发波形）
    this.waveformRefreshTimer = null;

    // 断开连接回调
    this._onDisconnected = null;
  }

  async connect() {
    if (this.connected) {
      return;
    }

    console.log("Requesting Coyote 2.0...");

    this.device = await webbluetooth.bluetooth.requestDevice({
      filters: [
        {
          namePrefix: "D-LAB",
        },
      ],
      optionalServices: [BATTERY_SERVICE, CONTROL_SERVICE],
    });

    console.log(`Device: ${this.device.name}`);

    if (!this.device.gatt) {
      throw new Error("设备不支持 GATT");
    }

    console.log("Connecting GATT...");

    this.server = await this.device.gatt.connect();

    console.log("GATT connected.");

    const batteryService = await this.server.getPrimaryService(BATTERY_SERVICE);

    console.log(`Battery service: ${BATTERY_SERVICE}`);

    const controlService = await this.server.getPrimaryService(CONTROL_SERVICE);

    console.log(`Control service: ${CONTROL_SERVICE}`);

    this.batteryCharacteristic =
      await batteryService.getCharacteristic(BATTERY_LEVEL);

    /*
     * 一次性获取 Control Service 的全部 characteristic。
     * 避免底层 BLE adapter 在连续 getCharacteristic() 时出现问题。
     */
    const characteristics = await controlService.getCharacteristics();

    this.pwmAB2 = characteristics.find((c) => c.uuid.toLowerCase() === PWM_AB2);
    this.pwmA34 = characteristics.find((c) => c.uuid.toLowerCase() === PWM_A34);
    this.pwmB34 = characteristics.find((c) => c.uuid.toLowerCase() === PWM_B34);

    if (!this.pwmAB2) {
      throw new Error("找不到 PWM_AB2 (1504)");
    }

    if (!this.pwmA34) {
      throw new Error("找不到 PWM_A34 (1505)");
    }

    if (!this.pwmB34) {
      throw new Error("找不到 PWM_B34 (1506)");
    }

    console.log("PWM_AB2 properties:", this.pwmAB2.properties);
    console.log("PWM_A34 properties:", this.pwmA34.properties);
    console.log("PWM_B34 properties:", this.pwmB34.properties);

    /*
     * 监听设备断开连接事件，
     * 防止断开后 this.connected 仍为 true。
     */
    this._onDisconnected = () => {
      console.log("[Coyote] 设备已断开连接 (gattserverdisconnected)");
      this._clearAllTimers();
      this.connected = false;
      this.active = false;
      this.channelA = 0;
      this.channelB = 0;
      this.lastIntensityRaw = "--";
      this.battery = null;
    };
    this.device.addEventListener("gattserverdisconnected", this._onDisconnected);

    this.connected = true;

    /*
     * 先读取电量。
     */
    await this.readBattery();

    console.log("Coyote GATT services found.");
  }

  async readBattery() {
    if (!this.batteryCharacteristic) {
      throw new Error("Battery characteristic unavailable");
    }

    const value = await this.batteryCharacteristic.readValue();

    if (value.byteLength < 1) {
      throw new Error("Battery returned no data");
    }

    this.battery = value.getUint8(0);

    console.log(`Battery: ${this.battery}%`);

    return this.battery;
  }

  /*
   * 统一处理 BLE 写入。
   */
  async writeCharacteristic(characteristic, data) {
    if (!characteristic) {
      throw new Error("Characteristic 不存在");
    }

    if (!data) {
      throw new Error("没有要写入的数据");
    }

    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

    console.log(
      `BLE write ${characteristic.uuid}:`,
      Array.from(bytes)
        .map((x) => x.toString(16).padStart(2, "0").toUpperCase())
        .join(" ")
    );

    const properties = characteristic.properties || {};

    /*
     * 优先无响应写。
     */
    if (
      properties.writeWithoutResponse &&
      typeof characteristic.writeValueWithoutResponse === "function"
    ) {
      console.log("Using writeValueWithoutResponse()");
      await characteristic.writeValueWithoutResponse(bytes);
      return;
    }

    /*
     * 其次使用带响应写。
     */
    if (
      properties.write &&
      typeof characteristic.writeValueWithResponse === "function"
    ) {
      console.log("Using writeValueWithResponse()");
      await characteristic.writeValueWithResponse(bytes);
      return;
    }

    /*
     * 最后的兼容方式。
     */
    if (typeof characteristic.writeValue === "function") {
      console.log("Using writeValue()");
      await characteristic.writeValue(bytes);
      return;
    }

    throw new Error(`Characteristic ${characteristic.uuid} 不支持写入`);
  }

  /*
   * 设置 A / B 强度。
   *
   * 外部传入 App 挡位：0 ~ 200
   * 协议转换：S = AppLevel × 7
   */
  async setIntensity(a, b) {
    if (!this.connected) {
      throw new Error("Coyote 未连接");
    }

    a = this.safety.intensity(a);
    b = this.safety.intensity(b);

    const protocolA = a * 7;
    const protocolB = b * 7;

    /*
     * 防御性检查：
     * 即使 safety.intensity() 已经钳制了 App 挡位，
     * 仍需确认最终协议值不超过 11-bit 上限。
     * 若未来 maxIntensity 被修改为 > 292（292×7=2044），
     * 此处可防止越界。
     */
    if (protocolA > 0x7ff || protocolB > 0x7ff) {
      throw new Error(
        `Protocol intensity out of range: A=${protocolA}, B=${protocolB}, max=2047`
      );
    }

    const data = this.protocol.encodeIntensity(protocolA, protocolB);

    const hex = Array.from(data)
      .map((x) => x.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");

    console.log("[Coyote PWM_AB2]", `A=${a}`, `B=${b}`, `HEX=${hex}`);

    await this.writeCharacteristic(this.pwmAB2, data);

    this.channelA = a;
    this.channelB = b;
    this.lastIntensityRaw = hex;

    this.active = a > 0 || b > 0;
  }

  /**
   * 增强版惩罚触发专用函数
   * 支持传入对象（全配置）或传统多参数模式，支持通道选择与自动下发波形
   *
   * config 对象格式：
   * {
   *   targetIntensity: number,   // App 挡位 (0~200)
   *   maxIntensity: number,      // 安全上限 (App 挡位)
   *   durationMs: number,        // 持续时间 ms
   *   maxDurationMs: number,     // 最大持续时间 ms
   *   channelA: boolean,         // 是否激活 A 通道
   *   channelB: boolean,         // 是否激活 B 通道
   *   waveform: [x, y, z],       // 波形参数，若为 null 则不发送波形
   *   waveformData: [[x,y,z],...], // 波形序列（多帧循环），优先于 waveform
   *   waveformInterval: number,  // 波形帧间隔 ms，默认 100
   * }
   */
  async triggerPunishment(
    config = {},
    maxIntensity = 200,
    durationMs = 1000,
    maxDurationMs = 5000
  ) {
    if (!this.connected) return;
    console.log("[Coyote Debug] triggerPunishment 被调用，原始参数:", config);
    console.trace("[Coyote Debug] 调用栈:");
    let targetIntensity = 0;
    let channelA = true;
    let channelB = false;
    let waveform = null;
    let waveformData = null;
    let waveformInterval = 100;

    // 解析参数类型
    if (typeof config === "object" && config !== null && !Array.isArray(config)) {
      targetIntensity = config.targetIntensity ?? config.intensity ?? 0;
      maxIntensity = config.maxIntensity ?? maxIntensity;
      durationMs = config.durationMs ?? config.duration ?? durationMs;
      maxDurationMs = config.maxDurationMs ?? maxDurationMs;
      channelA = config.channelA ?? channelA;
      channelB = config.channelB ?? channelB;
      waveform = config.waveform ?? null;
      waveformData = config.waveformData ?? null;
      waveformInterval = config.waveformInterval ?? 100;
    } else {
      targetIntensity = Number(config) || 0;
    }

    // 严苛边界钳制
    const finalIntensity = Math.min(targetIntensity, maxIntensity);
    const finalDuration = Math.min(durationMs, maxDurationMs);

    if (finalIntensity <= 0 || finalDuration <= 0) {
      await this.setIntensity(0, 0);
      return;
    }

    // 1. 确定要循环发送的波形帧序列
    let frames = null;
    if (waveformData && Array.isArray(waveformData) && waveformData.length > 0) {
      frames = waveformData;
    } else if (waveform && Array.isArray(waveform) && waveform.length >= 3) {
      frames = [waveform];
    }

    // 2. 清除未完结的定时器
    this._clearAllTimers();

    // 3. 如果有波形，立即发送第一帧并启动 100ms 刷新
    if (frames) {
      let frameIndex = 0;
      const endTime = Date.now() + finalDuration;

      const sendFrame = async () => {
        if (Date.now() >= endTime) return;
        if (!this.connected) return;

        const frame = frames[frameIndex % frames.length];
        try {
          if (channelA) {
            await this.setWaveformA(frame[0], frame[1], frame[2]);
          }
          if (channelB) {
            await this.setWaveformB(frame[0], frame[1], frame[2]);
          }
          frameIndex++;
        } catch (err) {
          console.error("[Coyote Punisher] 波形帧发送失败:", err);
        }
      };

      // 立即发送第一帧
      await sendFrame();

      // 每 waveformInterval 重发一帧
      this.waveformRefreshTimer = setInterval(() => {
        sendFrame().catch((err) => {
          console.error("[Coyote Punisher] 波形刷新失败:", err);
        });
      }, waveformInterval);
    }

    // 4. 计算实际输出的通道强度
    const valA = channelA ? finalIntensity : 0;
    const valB = channelB ? finalIntensity : 0;

    console.log(
      `[Coyote Punisher] 激活惩罚 -> A:${valA}, B:${valB}, 持续时间: ${finalDuration}ms`
    );

    // 5. 下发强度
    await this.setIntensity(valA, valB);

    // 6. 设置倒计时：持续时间结束后自动归零
    this.pulseTimer = setTimeout(async () => {
      try {
        console.log("[Coyote Punisher] 惩罚结束，强度归零");
        this._clearAllTimers();
        await this.setIntensity(0, 0);
      } catch (err) {
        console.error("惩罚归零失败:", err);
      } finally {
        this.pulseTimer = null;
        this.waveformRefreshTimer = null;
      }
    }, finalDuration);
  }

  /**
   * 清除所有定时器（惩罚计时器 + 波形刷新计时器）
   */
  _clearAllTimers() {
    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }
    if (this.waveformRefreshTimer) {
      clearInterval(this.waveformRefreshTimer);
      this.waveformRefreshTimer = null;
    }
  }

  async readIntensity() {
    if (!this.connected) {
      throw new Error("Coyote 未连接");
    }

    if (!this.pwmAB2) {
      throw new Error("PWM_AB2 未初始化");
    }

    const value = await this.pwmAB2.readValue();

    const data = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength
    );

    console.log(`PWM_AB2 read: ${data.length} byte(s)`);

    if (data.length === 0) {
      console.log("Coyote returned no readable PWM_AB2 payload.");
      return null;
    }

    if (data.length !== 3) {
      throw new Error(`PWM_AB2 returned ${data.length} bytes`);
    }

    const result = this.protocol.decodeIntensity(data);

    console.log(`PWM_AB2 protocol S -> A=${result.a} B=${result.b}`);

    this.channelA = this.safety.protocolToIntensity(result.a);
    this.channelB = this.safety.protocolToIntensity(result.b);

    this.lastIntensityRaw = Array.from(data)
      .map((x) => x.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");

    console.log(`PWM_AB2 -> App A=${this.channelA} B=${this.channelB}`);

    this.active = this.channelA > 0 || this.channelB > 0;

    return {
      a: this.channelA,
      b: this.channelB,
    };
  }

  async setWaveformA(x, y, z) {
    if (!this.connected) {
      throw new Error("Coyote 未连接");
    }

    const parsed = this._parseWaveformArgs(x, y, z);
    const data = this.protocol.encodeWaveformA(parsed.x, parsed.y, parsed.z);

    await this.writeCharacteristic(this.pwmA34, data);
    this.active = true;
  }

  async setWaveformB(x, y, z) {
    if (!this.connected) {
      throw new Error("Coyote 未连接");
    }

    const parsed = this._parseWaveformArgs(x, y, z);
    const data = this.protocol.encodeWaveformB(parsed.x, parsed.y, parsed.z);

    await this.writeCharacteristic(this.pwmB34, data);
    this.active = true;
  }

  /*
   * 波形统一入口（默认控制 A 通道）
   */
  async setWaveform(x, y, z) {
    await this.setWaveformA(x, y, z);
  }

  /**
   * 内部私有辅助方法：解构、清洗并校验波形参数 (x, y, z)
   */
  _parseWaveformArgs(x, y, z) {
    if (Array.isArray(x)) {
      if (x.length < 3) {
        throw new Error("波形参数必须包含 3 个数字");
      }
      const frame = x;
      x = frame[0];
      y = frame[1];
      z = frame[2];
    } else if (x !== null && typeof x === "object") {
      const frame = x;
      if (
        frame.x !== undefined ||
        frame.y !== undefined ||
        frame.z !== undefined
      ) {
        x = frame.x;
        y = frame.y;
        z = frame.z;
      } else {
        x = frame.a;
        y = frame.b;
        z = frame.c;
      }
    }

    x = Number(x);
    y = Number(y);
    z = Number(z);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error("波形参数必须是有效数字");
    }

    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      throw new Error("波形参数必须是整数");
    }

    if (x < 0 || x > 31) {
      throw new Error("X 范围必须是 0 ~ 31");
    }

    if (y < 0 || y > 1023) {
      throw new Error("Y 范围必须是 0 ~ 1023");
    }

    if (z < 0 || z > 31) {
      throw new Error("Z 范围必须是 0 ~ 31");
    }

    return { x, y, z };
  }

  async test() {
    if (!this.connected) {
      throw new Error("Coyote 未连接");
    }

    await this.setIntensity(10, 0);
  }

  async emergencyStop() {
    this._clearAllTimers();

    if (!this.connected) {
      this.active = false;
      return;
    }

    await this.setIntensity(0, 0);

    this.active = false;

    console.log("Coyote emergency stop.");
  }

  async disconnect() {
    this._clearAllTimers();

    try {
      if (this.device && this._onDisconnected) {
        this.device.removeEventListener("gattserverdisconnected", this._onDisconnected);
        this._onDisconnected = null;
      }
    } catch (_) {}

    try {
      if (this.device && this.device.gatt && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }
    } finally {
      this.device = null;
      this.server = null;

      this.batteryCharacteristic = null;

      this.pwmAB2 = null;
      this.pwmA34 = null;
      this.pwmB34 = null;

      this.connected = false;

      this.battery = null;

      this.channelA = 0;
      this.channelB = 0;

      this.lastIntensityRaw = "--";

      this.active = false;
    }

    console.log("Coyote disconnected.");
  }

  dispose() {
    this._clearAllTimers();

    try {
      if (this.device && this._onDisconnected) {
        this.device.removeEventListener("gattserverdisconnected", this._onDisconnected);
        this._onDisconnected = null;
      }
    } catch (_) {}

    try {
      if (this.device && this.device.gatt && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }
    } catch (_) {}
  }
}

module.exports = {
  CoyoteController,
};
