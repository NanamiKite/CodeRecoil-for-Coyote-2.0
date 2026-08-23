class CoyoteSafety {
  constructor() {
    /*
     * App 界面的强度挡位：
     *
     * 0 ~ 200
     *
     * 官方 App 每增加 1 挡，
     * 协议中的实际 S 增加 7。
     *
     * 因此：
     *
     * App 200
     *     ↓
     * S = 200 × 7
     *     ↓
     * S = 1400
     */
    this.maxIntensity = 200;

    /*
     * App 挡位与协议 S 的倍率。
     *
     * 官方协议：
     *
     * S = AppLevel × 7
     */
    this.intensityScale = 7;

    /*
     * 协议 S 的实际最大值。
     *
     * PWM_AB2 使用 11 bit：
     *
     * 0 ~ 2047
     *
     * 这里保留这个限制用于最终安全检查。
     */
    this.maxProtocolIntensity = 2047;

    this.maxDuration = 5000;
  }

  /*
   * 处理 App 强度挡位。
   *
   * 输入：
   *
   *     App 挡位 0 ~ 200
   *
   * 返回：
   *
   *     仍然返回 App 挡位
   *
   * 不在这里直接转换成 S。
   *
   * 这样可以保持 Controller 中
   * channelA / channelB 的状态仍然
   * 表示 App 挡位。
   */
  intensity(value) {
    value = Number(value);

    if (!Number.isFinite(value)) {
      throw new Error("Intensity must be a number");
    }

    value = Math.round(value);

    return Math.max(0, Math.min(this.maxIntensity, value));
  }

  /*
   * App 挡位 → 协议 S
   *
   * 例如：
   *
   * 0   → 0
   * 1   → 7
   * 10  → 70
   * 20  → 140
   * 100 → 700
   * 200 → 1400
   *
   * 注意：
   *
   * 2047 是协议字段上限，
   * 不是 App 挡位上限。
   */
  intensityToProtocol(value) {
    value = this.intensity(value);

    const protocolValue = value * this.intensityScale;

    if (
      !Number.isInteger(protocolValue) ||
      protocolValue < 0 ||
      protocolValue > this.maxProtocolIntensity
    ) {
      throw new Error("Protocol intensity out of range");
    }

    return protocolValue;
  }

  /*
   * 协议 S → App 挡位
   *
   * 官方映射：
   *
   * S = App × 7
   *
   * 因此读取设备时反向除以 7。
   *
   * 正常情况下设备由本 App 写入的 S
   * 一定是 7 的整数倍。
   */
  protocolToIntensity(value) {
    value = Number(value);

    if (!Number.isFinite(value)) {
      throw new Error("Protocol intensity must be a number");
    }

    value = Math.round(value);

    if (value < 0 || value > this.maxProtocolIntensity) {
      throw new Error("Protocol intensity range: 0..2047");
    }

    /*
     * 这里使用四舍五入，
     * 防止设备返回非 7 倍数时出现小数。
     */
    const appValue = Math.round(value / this.intensityScale);

    return Math.max(0, Math.min(this.maxIntensity, appValue));
  }

  duration(value) {
    value = Number(value);

    if (!Number.isFinite(value)) {
      throw new Error("Duration must be a number");
    }

    return Math.max(0, Math.min(this.maxDuration, Math.round(value)));
  }
}

module.exports = {
  CoyoteSafety,
};
