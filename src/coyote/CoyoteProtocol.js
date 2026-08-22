class CoyoteProtocol {

    encodeIntensity(a, b) {

        if (
            !Number.isInteger(a) ||
            !Number.isInteger(b)
        ) {
            throw new Error(
                "Intensity must be integer"
            );
        }

        if (
            a < 0 ||
            a > 0x7ff ||
            b < 0 ||
            b > 0x7ff
        ) {
            throw new Error(
                "Intensity range: 0..2047"
            );
        }

        /*
         * 23-22 : reserved
         * 21-11 : A
         * 10-0  : B
         */

        const value =
            ((a & 0x7ff) << 11) |
            (b & 0x7ff);

        return Uint8Array.from([
            (value >> 16) & 0xff,
            (value >> 8) & 0xff,
            value & 0xff
        ]);
    }


    decodeIntensity(data) {

        if (
            !data ||
            data.byteLength !== 3
        ) {
            throw new Error(
                "PWM_AB2 requires 3 bytes"
            );
        }

        const value =
            ((data[0] << 16) |
             (data[1] << 8) |
             data[2]) &
            0x3fffff;

        return {
            a:
                (value >> 11) & 0x7ff,

            b:
                value & 0x7ff
        };
    }


    encodeWaveformA(
        x,
        y,
        z
    ) {

        const value =
            ((z & 0x1f) << 15) |
            ((y & 0x3ff) << 5) |
            (x & 0x1f);

        return Uint8Array.from([
            (value >> 16) & 0xff,
            (value >> 8) & 0xff,
            value & 0xff
        ]);
    }


    encodeWaveformB(
        x,
        y,
        z
    ) {

        const value =
            ((z & 0x1f) << 15) |
            ((y & 0x3ff) << 5) |
            (x & 0x1f);

        return Uint8Array.from([
            (value >> 16) & 0xff,
            (value >> 8) & 0xff,
            value & 0xff
        ]);
    }
}


module.exports = {
    CoyoteProtocol
};