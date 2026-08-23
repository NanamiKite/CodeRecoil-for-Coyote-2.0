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
     * 范围：
     *
     * 0 ~ 200
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
     * 一次性获取 Control Service
     * 的全部 characteristic。
     *
     * 避免底层 BLE adapter 在连续
     * getCharacteristic() 时出现问题。
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
   *
   * 原有实现保持不变。
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
        .join(" "),
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
   * 注意：
   *
   * 外部传入的是 App 挡位：
   *
   *     0 ~ 200
   *
   * 不是协议 S。
   *
   * 最终发送：
   *
   *     S = AppLevel × 7
   *
   * 所以：
   *
   *     App 20
   *       ↓
   *     S 140
   *
   *     App 200
   *       ↓
   *     S 1400
   */
  async setIntensity(a, b) {
    if (!this.connected) {
      throw new Error("Coyote 未连接");
    }

    a = this.safety.intensity(a);

    b = this.safety.intensity(b);

    const protocolA = a * 7;
    const protocolB = b * 7;
    const data = this.protocol.encodeIntensity(protocolA, protocolB);

    /*
     * 输出最终发送给 PWM_AB2 的 BLE 数据包。
     *
     * 数据格式：
     *
     * 23-22 : 保留
     * 21-11 : A 通道强度
     * 10-0  : B 通道强度
     */
    const hex = Array.from(data)
      .map((x) => x.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");

    console.log("[Coyote PWM_AB2]", `A=${a}`, `B=${b}`, `HEX=${hex}`);

    await this.writeCharacteristic(this.pwmAB2, data);

    this.channelA = a;
    this.channelB = b;

    this.active = a > 0 || b > 0;
  }

  async readIntensity() {
    if (!this.connected) {
      throw new Error("Coyote 未连接");
    }

    if (!this.pwmAB2) {
      throw new Error("PWM_AB2 未初始化");
    }

    /*
     * 1504 虽然协议表写着可读，
     * 但设备可能返回 0 byte。
     */
    const value = await this.pwmAB2.readValue();

    const data = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );

    console.log(`PWM_AB2 read: ${data.length} byte(s)`);

    if (data.length === 0) {
      console.log("Coyote returned no readable PWM_AB2 payload.");

      return null;
    }

    if (data.length !== 3) {
      throw new Error(`PWM_AB2 returned ${data.length} bytes`);
    }

    /*
     * 使用已经验证过的
     * PWM_AB2 解码算法。
     *
     * result.a / result.b
     * 此时是协议 S。
     */
    const result = this.protocol.decodeIntensity(data);

    console.log(`PWM_AB2 protocol S -> A=${result.a} B=${result.b}`);

    /*
     * 协议 S → App 挡位。
     *
     * S / 7
     */
    this.channelA = this.safety.protocolToIntensity(result.a);

    this.channelB = this.safety.protocolToIntensity(result.b);

    this.lastIntensityRaw = Array.from(data)
      .map((x) => x.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");

    console.log(`PWM_AB2 -> App A=${this.channelA} B=${this.channelB}`);

    this.active = this.channelA > 0 || this.channelB > 0;

    /*
     * 返回值也保持为 App 挡位，
     * 与 controller.channelA/B 一致。
     */
    return {
      a: this.channelA,
      b: this.channelB,
    };
  }

  async setWaveformA(x, y, z) {
    if (!this.connected) {
      throw new Error("Coyote 未连接");
    }

    const data = this.protocol.encodeWaveformA(x, y, z);

    await this.writeCharacteristic(this.pwmA34, data);
  }

  async setWaveformB(x, y, z) {
    if (!this.connected) {
      throw new Error("Coyote 未连接");
    }

    const data = this.protocol.encodeWaveformB(x, y, z);

    await this.writeCharacteristic(this.pwmB34, data);
  }

  /*
   * 波形统一入口。
   *
   * 支持：
   *
   * setWaveform([5, 135, 20])
   *
   * setWaveform(5, 135, 20)
   *
   * setWaveform({
   *     x: 5,
   *     y: 135,
   *     z: 20
   * })
   */
  async setWaveform(x, y, z) {
    if (!this.connected) {
      throw new Error("Coyote 未连接");
    }

    /*
     * 情况 1：
     *
     * setWaveform([5, 135, 20])
     */
    if (Array.isArray(x)) {
      if (x.length < 3) {
        throw new Error("波形参数必须包含 3 个数字");
      }

      const frame = x;

      x = frame[0];
      y = frame[1];
      z = frame[2];
    } else if (x !== null && typeof x === "object") {

    /*
     * 情况 2：
     *
     * setWaveform({
     *     x: 5,
     *     y: 135,
     *     z: 20
     * })
     *
     * 同时兼容：
     *
     * {
     *     a: 5,
     *     b: 135,
     *     c: 20
     * }
     */
      const frame = x;

      if (
        frame.x !== undefined ||
        frame.y !== undefined ||
        frame.z !== undefined
      ) {
        y = frame.y;
        z = frame.z;
        x = frame.x;
      } else {
        y = frame.b;
        z = frame.c;
        x = frame.a;
      }
    }

    /*
     * UI / JSON 数据有可能把数字
     * 传成字符串。
     *
     * 这里统一转换。
     */
    x = Number(x);
    y = Number(y);
    z = Number(z);

    console.log("Coyote setWaveform parameters:", {
      x: x,
      y: y,
      z: z,
    });

    /*
     * 检查转换后的最终参数。
     */
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error("波形参数必须是有效数字");
    }

    /*
     * 当前 WaveformPresets
     * 全部使用整数。
     */
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      throw new Error("波形参数必须是整数");
    }

    /*
     * X：5 bit
     * Y：10 bit
     * Z：5 bit
     *
     * 这里增加边界检查。
     *
     * 不改变编码算法，
     * 只是防止非法参数进入协议层。
     */
    if (x < 0 || x > 31) {
      throw new Error("X 范围必须是 0 ~ 31");
    }

    if (y < 0 || y > 1023) {
      throw new Error("Y 范围必须是 0 ~ 1023");
    }

    if (z < 0 || z > 31) {
      throw new Error("Z 范围必须是 0 ~ 31");
    }

    /*
     * 使用已有的 PWM_A34
     * 波形写入实现。
     *
     * 原有算法保持不变。
     */
    await this.setWaveformA(x, y, z);

    this.active = true;
  }

  async test() {
    if (!this.connected) {
      throw new Error("Coyote 未连接");
    }

    /*
     * 当前测试：
     *
     * App A = 10
     * App B = 0
     *
     * 经过新的强度映射后：
     *
     * S A = 70
     * S B = 0
     *
     * 用于验证 1504 写入链路。
     */
    await this.setIntensity(10, 0);
  }

  async emergencyStop() {
    if (!this.connected) {
      this.active = false;

      return;
    }

    await this.setIntensity(0, 0);

    this.active = false;

    console.log("Coyote emergency stop.");
  }

  async disconnect() {
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
