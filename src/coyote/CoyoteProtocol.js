class CoyoteProtocol {
  /*
   * PWM_AB2
   *
   * 23-22 : reserved
   * 21-11 : A
   * 10-0  : B
   *
   * A / B 均为 11 bit：
   *
   * 0 ~ 2047
   */
  encodeIntensity(a, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      throw new Error("Intensity must be integer");
    }

    if (a < 0 || a > 0x7ff || b < 0 || b > 0x7ff) {
      throw new Error("Intensity range: 0..2047");
    }

    /*
     * 23-22 : reserved
     * 21-11 : A
     * 10-0  : B
     */

    const value = ((a & 0x7ff) << 11) | (b & 0x7ff);

    /*
     * Coyote PWM_AB2 使用 little-endian。
     *
     * 与第三方 Python 实现：
     *
     * ((A << 11) + B).to_bytes(
     *     3,
     *     byteorder="little"
     * )
     *
     * 保持一致。
     */

    return Uint8Array.from([
      value & 0xff,
      (value >> 8) & 0xff,
      (value >> 16) & 0xff,
    ]);
  }

  /*
   * PWM_AB2 解码
   */
  decodeIntensity(data) {
    if (!data || data.byteLength !== 3) {
      throw new Error("PWM_AB2 requires 3 bytes");
    }

    const value = (data[0] | (data[1] << 8) | (data[2] << 16)) & 0x3fffff;

    return {
      a: (value >> 11) & 0x7ff,

      b: value & 0x7ff,
    };
  }

  /*
   * PWM_A34
   *
   * 协议定义：
   *
   * 23-20 : reserved
   * 19-15 : Z
   * 14-5  : Y
   * 4-0   : X
   *
   * 注意：
   *
   * 这里的位打包算法已经通过实际
   * BLE 数据验证，不修改。
   */
  encodeWaveformA(x, y, z) {
    const value = ((z & 0x1f) << 15) | ((y & 0x3ff) << 5) | (x & 0x1f);

    return Uint8Array.from([
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ]);
  }

  /*
   * PWM_B34
   *
   * 与 PWM_A34 使用完全相同的
   * X/Y/Z 位布局。
   *
   * 不修改已经验证过的算法。
   */
  encodeWaveformB(x, y, z) {
    const value = ((z & 0x1f) << 15) | ((y & 0x3ff) << 5) | (x & 0x1f);

    return Uint8Array.from([
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ]);
  }
}

module.exports = {
  CoyoteProtocol,
};
