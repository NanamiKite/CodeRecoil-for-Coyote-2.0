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
   * PWM_A34 / PWM_B34 位域布局：
   *
   * 23-20 : reserved
   * 19-15 : Z  (5 bit,  0~31)
   * 14-5  : Y  (10 bit, 0~1023)
   * 4-0   : X  (5 bit,  0~31)
   *
   * 以下提供 Big-Endian 和 Little-Endian 两套编码，
   * 用于实测验证设备端期望的字节序。
   */

  /*
   * [Big-Endian 版本] — PWM_A34
   * 高字节在前：byte[0] = bits 23-16
   *
   * 这是原始已验证的算法。
   */
  encodeWaveformABigEndian(x, y, z) {
    const value = ((z & 0x1f) << 15) | ((y & 0x3ff) << 5) | (x & 0x1f);

    return Uint8Array.from([
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ]);
  }

  /*
   * [Little-Endian 版本] — PWM_A34
   * 低字节在前：byte[0] = bits 7-0
   *
   * 如果实测发现设备端期望 LE（与 PWM_AB2 一致），
   * 则应使用此版本。
   */
  encodeWaveformALittleEndian(x, y, z) {
    const value = ((z & 0x1f) << 15) | ((y & 0x3ff) << 5) | (x & 0x1f);

    return Uint8Array.from([
      value & 0xff,
      (value >> 8) & 0xff,
      (value >> 16) & 0xff,
    ]);
  }

  /*
   * 默认使用 Big-Endian（保持原始行为）。
   * 验证后若需切换为 LE，将此处改为 encodeWaveformALittleEndian 即可。
   */
  encodeWaveformA(x, y, z) {
    return this.encodeWaveformABigEndian(x, y, z);
  }

  /*
   * [Big-Endian 版本] — PWM_B34
   */
  encodeWaveformBBigEndian(x, y, z) {
    const value = ((z & 0x1f) << 15) | ((y & 0x3ff) << 5) | (x & 0x1f);

    return Uint8Array.from([
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ]);
  }

  /*
   * [Little-Endian 版本] — PWM_B34
   */
  encodeWaveformBLittleEndian(x, y, z) {
    const value = ((z & 0x1f) << 15) | ((y & 0x3ff) << 5) | (x & 0x1f);

    return Uint8Array.from([
      value & 0xff,
      (value >> 8) & 0xff,
      (value >> 16) & 0xff,
    ]);
  }

  /*
   * 默认使用 Big-Endian（保持原始行为）。
   */
  encodeWaveformB(x, y, z) {
    return this.encodeWaveformBBigEndian(x, y, z);
  }
}

module.exports = {
  CoyoteProtocol,
};
