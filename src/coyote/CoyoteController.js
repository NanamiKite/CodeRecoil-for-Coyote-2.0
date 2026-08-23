// const webbluetooth = require("webbluetooth");
// const { CoyoteProtocol } = require("./CoyoteProtocol");
// const { CoyoteSafety } = require("./CoyoteSafety");

// const BATTERY_SERVICE =
//     "955a180a-0fe2-f5aa-a094-84b8d4f3e8ad";

// const CONTROL_SERVICE =
//     "955a180b-0fe2-f5aa-a094-84b8d4f3e8ad";

// const BATTERY_LEVEL =
//     "955a1500-0fe2-f5aa-a094-84b8d4f3e8ad";

// const PWM_AB2 =
//     "955a1504-0fe2-f5aa-a094-84b8d4f3e8ad";

// const PWM_A34 =
//     "955a1505-0fe2-f5aa-a094-84b8d4f3e8ad";

// const PWM_B34 =
//     "955a1506-0fe2-f5aa-a094-84b8d4f3e8ad";


// class CoyoteController {

//     constructor() {
//         this.device = null;
//         this.server = null;

//         this.batteryCharacteristic = null;

//         this.pwmAB2 = null;
//         this.pwmA34 = null;
//         this.pwmB34 = null;

//         this.connected = false;

//         this.battery = null;

//         this.channelA = 0;
//         this.channelB = 0;

//         this.active = false;

//         this.protocol =
//             new CoyoteProtocol();

//         this.safety =
//             new CoyoteSafety();
//     }


//     async connect() {

//         if (this.connected) {
//             return;
//         }

//         console.log(
//             "Requesting Coyote 2.0..."
//         );

//         this.device =
//             await webbluetooth.bluetooth.requestDevice({
//                 filters: [
//                     {
//                         namePrefix: "D-LAB"
//                     }
//                 ],

//                 optionalServices: [
//                     BATTERY_SERVICE,
//                     CONTROL_SERVICE
//                 ]
//             });

//         console.log(
//             `Device: ${this.device.name}`
//         );

//         if (!this.device.gatt) {
//             throw new Error(
//                 "设备不支持 GATT"
//             );
//         }

//         console.log(
//             "Connecting GATT..."
//         );

//         this.server =
//             await this.device.gatt.connect();

//         console.log(
//             "GATT connected."
//         );


//         const batteryService =
//             await this.server.getPrimaryService(
//                 BATTERY_SERVICE
//             );

//         console.log(
//             `Battery service: ${BATTERY_SERVICE}`
//         );


//         const controlService =
//             await this.server.getPrimaryService(
//                 CONTROL_SERVICE
//             );

//         console.log(
//             `Control service: ${CONTROL_SERVICE}`
//         );


//         this.batteryCharacteristic =
//             await batteryService.getCharacteristic(
//                 BATTERY_LEVEL
//             );


//         /*
//          * 一次性获取 Control Service
//          * 的全部 characteristic。
//          *
//          * 避免底层 BLE adapter 在连续
//          * getCharacteristic() 时出现问题。
//          */
//         const characteristics =
//             await controlService.getCharacteristics();


//         this.pwmAB2 =
//             characteristics.find(
//                 c =>
//                     c.uuid.toLowerCase() ===
//                     PWM_AB2
//             );

//         this.pwmA34 =
//             characteristics.find(
//                 c =>
//                     c.uuid.toLowerCase() ===
//                     PWM_A34
//             );

//         this.pwmB34 =
//             characteristics.find(
//                 c =>
//                     c.uuid.toLowerCase() ===
//                     PWM_B34
//             );


//         if (!this.pwmAB2) {
//             throw new Error(
//                 "找不到 PWM_AB2 (1504)"
//             );
//         }

//         if (!this.pwmA34) {
//             throw new Error(
//                 "找不到 PWM_A34 (1505)"
//             );
//         }

//         if (!this.pwmB34) {
//             throw new Error(
//                 "找不到 PWM_B34 (1506)"
//             );
//         }


//         console.log(
//             "PWM_AB2 properties:",
//             this.pwmAB2.properties
//         );

//         console.log(
//             "PWM_A34 properties:",
//             this.pwmA34.properties
//         );

//         console.log(
//             "PWM_B34 properties:",
//             this.pwmB34.properties
//         );


//         this.connected = true;


//         /*
//          * 先读取电量。
//          */
//         await this.readBattery();


//         console.log(
//             "Coyote GATT services found."
//         );
//     }


//     async readBattery() {

//         if (!this.batteryCharacteristic) {
//             throw new Error(
//                 "Battery characteristic unavailable"
//             );
//         }

//         const value =
//             await this.batteryCharacteristic.readValue();


//         if (value.byteLength < 1) {
//             throw new Error(
//                 "Battery returned no data"
//             );
//         }


//         this.battery =
//             value.getUint8(0);


//         console.log(
//             `Battery: ${this.battery}%`
//         );


//         return this.battery;
//     }


//     /*
//      * 统一处理 BLE 写入。
//      *
//      * 优先使用 writeWithoutResponse，
//      * 因为 1504 是控制数据，
//      * 如果设备声明支持该属性，
//      * 不应该强行走 Write Request。
//      */
//     async writeCharacteristic(
//         characteristic,
//         data
//     ) {

//         if (!characteristic) {
//             throw new Error(
//                 "Characteristic 不存在"
//             );
//         }


//         if (!data) {
//             throw new Error(
//                 "没有要写入的数据"
//             );
//         }


//         const bytes =
//             data instanceof Uint8Array
//                 ? data
//                 : new Uint8Array(data);


//         console.log(
//             `BLE write ${characteristic.uuid}:`,
//             Array.from(bytes)
//                 .map(
//                     x =>
//                         x
//                             .toString(16)
//                             .padStart(2, "0")
//                             .toUpperCase()
//                 )
//                 .join(" ")
//         );


//         const properties =
//             characteristic.properties || {};


//         /*
//          * 优先无响应写。
//          */
//         if (
//             properties.writeWithoutResponse &&
//             typeof characteristic.writeValueWithoutResponse ===
//                 "function"
//         ) {

//             console.log(
//                 "Using writeValueWithoutResponse()"
//             );

//             await characteristic
//                 .writeValueWithoutResponse(
//                     bytes
//                 );

//             return;
//         }


//         /*
//          * 其次使用带响应写。
//          */
//         if (
//             properties.write &&
//             typeof characteristic.writeValueWithResponse ===
//                 "function"
//         ) {

//             console.log(
//                 "Using writeValueWithResponse()"
//             );

//             await characteristic
//                 .writeValueWithResponse(
//                     bytes
//                 );

//             return;
//         }


//         /*
//          * 最后的兼容方式。
//          */
//         if (
//             typeof characteristic.writeValue ===
//                 "function"
//         ) {

//             console.log(
//                 "Using writeValue()"
//             );

//             await characteristic.writeValue(
//                 bytes
//             );

//             return;
//         }


//         throw new Error(
//             `Characteristic ${characteristic.uuid} 不支持写入`
//         );
//     }


//     async setIntensity(a, b) {

//         if (!this.connected) {
//             throw new Error(
//                 "Coyote 未连接"
//             );
//         }


//         a =
//             this.safety.intensity(a);

//         b =
//             this.safety.intensity(b);


//         const data =
//             this.protocol.encodeIntensity(
//                 a,
//                 b
//             );


//         console.log(
//             `PWM_AB2 A=${a} B=${b} <-`,
//             Array.from(data)
//                 .map(
//                     x =>
//                         x
//                             .toString(16)
//                             .padStart(2, "0")
//                             .toUpperCase()
//                 )
//                 .join(" ")
//         );


//         await this.writeCharacteristic(
//             this.pwmAB2,
//             data
//         );


//         this.channelA = a;
//         this.channelB = b;

//         this.active =
//             a > 0 || b > 0;
//     }


//     async readIntensity() {

//         if (!this.connected) {
//             throw new Error(
//                 "Coyote 未连接"
//             );
//         }


//         if (!this.pwmAB2) {
//             throw new Error(
//                 "PWM_AB2 未初始化"
//             );
//         }


//         /*
//          * 1504 虽然协议表写着可读，
//          * 但你之前实测设备可能返回
//          * 0 byte。
//          */
//         const value =
//             await this.pwmAB2.readValue();


//         const data =
//             new Uint8Array(
//                 value.buffer,
//                 value.byteOffset,
//                 value.byteLength
//             );


//         console.log(
//             `PWM_AB2 read: ${data.length} byte(s)`
//         );


//         if (data.length === 0) {

//             console.log(
//                 "Coyote returned no readable PWM_AB2 payload."
//             );

//             return null;
//         }


//         if (data.length !== 3) {
//             throw new Error(
//                 `PWM_AB2 returned ${data.length} bytes`
//             );
//         }


//         const result =
//             this.protocol.decodeIntensity(
//                 data
//             );


//         this.channelA =
//             result.a;

//         this.channelB =
//             result.b;


//         console.log(
//             `PWM_AB2 -> A=${result.a} B=${result.b}`
//         );


//         return result;
//     }


//     async setWaveformA(
//         x,
//         y,
//         z
//     ) {

//         if (!this.connected) {
//             throw new Error(
//                 "Coyote 未连接"
//             );
//         }


//         const data =
//             this.protocol.encodeWaveformA(
//                 x,
//                 y,
//                 z
//             );


//         await this.writeCharacteristic(
//             this.pwmA34,
//             data
//         );
//     }


//     async setWaveformB(
//         x,
//         y,
//         z
//     ) {

//         if (!this.connected) {
//             throw new Error(
//                 "Coyote 未连接"
//             );
//         }


//         const data =
//             this.protocol.encodeWaveformB(
//                 x,
//                 y,
//                 z
//             );


//         await this.writeCharacteristic(
//             this.pwmB34,
//             data
//         );
//     }


//     /*
//      * 波形统一入口。
//      *
//      * 支持以下三种调用方式：
//      *
//      * 1.
//      * setWaveform([5, 135, 20])
//      *
//      * 2.
//      * setWaveform(5, 135, 20)
//      *
//      * 3.
//      * setWaveform({
//      *     x: 5,
//      *     y: 135,
//      *     z: 20
//      * })
//      *
//      * WaveformPresets.js 的 frames
//      * 使用的是第一种格式。
//      */
//     async setWaveform(
//         x,
//         y,
//         z
//     ) {

//         if (!this.connected) {
//             throw new Error(
//                 "Coyote 未连接"
//             );
//         }


//         /*
//          * 情况 1：
//          *
//          * setWaveform([5, 135, 20])
//          */
//         if (Array.isArray(x)) {

//             if (x.length < 3) {
//                 throw new Error(
//                     "波形参数必须包含 3 个数字"
//                 );
//             }

//             const frame = x;

//             x = frame[0];
//             y = frame[1];
//             z = frame[2];
//         }


//         /*
//          * 情况 2：
//          *
//          * setWaveform({
//          *     x: 5,
//          *     y: 135,
//          *     z: 20
//          * })
//          *
//          * 同时兼容：
//          *
//          * {
//          *     a: 5,
//          *     b: 135,
//          *     c: 20
//          * }
//          */
//         else if (
//             x !== null &&
//             typeof x === "object"
//         ) {

//             const frame = x;

//             if (
//                 frame.x !== undefined ||
//                 frame.y !== undefined ||
//                 frame.z !== undefined
//             ) {

//                 y = frame.y;
//                 z = frame.z;
//                 x = frame.x;

//             } else {

//                 y = frame.b;
//                 z = frame.c;
//                 x = frame.a;
//             }
//         }


//         /*
//          * UI / JSON 数据有可能把数字
//          * 传成字符串。
//          *
//          * 这里统一转换。
//          */
//         x = Number(x);
//         y = Number(y);
//         z = Number(z);


//         console.log(
//             "Coyote setWaveform parameters:",
//             {
//                 x: x,
//                 y: y,
//                 z: z
//             }
//         );


//         /*
//          * 检查转换后的最终参数。
//          */
//         if (
//             !Number.isFinite(x) ||
//             !Number.isFinite(y) ||
//             !Number.isFinite(z)
//         ) {

//             throw new Error(
//                 "波形参数必须是有效数字"
//             );
//         }


//         /*
//          * 当前 WaveformPresets
//          * 全部使用整数。
//          */
//         if (
//             !Number.isInteger(x) ||
//             !Number.isInteger(y) ||
//             !Number.isInteger(z)
//         ) {

//             throw new Error(
//                 "波形参数必须是整数"
//             );
//         }


//         /*
//          * 使用已有的 PWM_A34
//          * 波形写入实现。
//          *
//          * 不改变原有协议。
//          */
//         await this.setWaveformA(
//             x,
//             y,
//             z
//         );


//         this.active = true;
//     }


//     async test() {

//         if (!this.connected) {
//             throw new Error(
//                 "Coyote 未连接"
//             );
//         }


//         /*
//          * 当前测试：
//          *
//          * A = 10
//          * B = 0
//          *
//          * 用于验证 1504 写入链路。
//          */
//         await this.setIntensity(
//             10,
//             0
//         );
//     }


//     async emergencyStop() {

//         if (!this.connected) {
//             this.active = false;
//             return;
//         }


//         await this.setIntensity(
//             0,
//             0
//         );


//         this.active = false;


//         console.log(
//             "Coyote emergency stop."
//         );
//     }


//     async disconnect() {

//         try {

//             if (
//                 this.device &&
//                 this.device.gatt &&
//                 this.device.gatt.connected
//             ) {

//                 this.device.gatt.disconnect();
//             }

//         } finally {

//             this.device = null;
//             this.server = null;

//             this.batteryCharacteristic = null;

//             this.pwmAB2 = null;
//             this.pwmA34 = null;
//             this.pwmB34 = null;

//             this.connected = false;

//             this.battery = null;

//             this.channelA = 0;
//             this.channelB = 0;

//             this.active = false;
//         }


//         console.log(
//             "Coyote disconnected."
//         );
//     }


//     dispose() {

//         try {

//             if (
//                 this.device &&
//                 this.device.gatt &&
//                 this.device.gatt.connected
//             ) {

//                 this.device.gatt.disconnect();
//             }

//         } catch (_) {
//         }
//     }
// }


// module.exports = {
//     CoyoteController
// };




const webbluetooth = require("webbluetooth");
const { CoyoteProtocol } = require("./CoyoteProtocol");
const { CoyoteSafety } = require("./CoyoteSafety");

const BATTERY_SERVICE =
    "955a180a-0fe2-f5aa-a094-84b8d4f3e8ad";

const CONTROL_SERVICE =
    "955a180b-0fe2-f5aa-a094-84b8d4f3e8ad";

const BATTERY_LEVEL =
    "955a1500-0fe2-f5aa-a094-84b8d4f3e8ad";

const PWM_AB2 =
    "955a1504-0fe2-f5aa-a094-84b8d4f3e8ad";

const PWM_A34 =
    "955a1505-0fe2-f5aa-a094-84b8d4f3e8ad";

const PWM_B34 =
    "955a1506-0fe2-f5aa-a094-84b8d4f3e8ad";


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

        this.channelA = 0;
        this.channelB = 0;

        this.active = false;

        /*
         * 当前波形输出通道。
         *
         * A    -> PWM_A34
         * B    -> PWM_B34
         * ALL  -> PWM_A34 + PWM_B34
         *
         * 默认 A。
         *
         * 保持原有行为：
         * 原来的 setWaveform() 只写 A34。
         */
        this.waveformChannel = "A";

        this.protocol =
            new CoyoteProtocol();

        this.safety =
            new CoyoteSafety();
    }


    async connect() {

        if (this.connected) {
            return;
        }

        console.log(
            "Requesting Coyote 2.0..."
        );

        this.device =
            await webbluetooth.bluetooth.requestDevice({
                filters: [
                    {
                        namePrefix: "D-LAB"
                    }
                ],

                optionalServices: [
                    BATTERY_SERVICE,
                    CONTROL_SERVICE
                ]
            });

        console.log(
            `Device: ${this.device.name}`
        );

        if (!this.device.gatt) {
            throw new Error(
                "设备不支持 GATT"
            );
        }

        console.log(
            "Connecting GATT..."
        );

        this.server =
            await this.device.gatt.connect();

        console.log(
            "GATT connected."
        );


        const batteryService =
            await this.server.getPrimaryService(
                BATTERY_SERVICE
            );

        console.log(
            `Battery service: ${BATTERY_SERVICE}`
        );


        const controlService =
            await this.server.getPrimaryService(
                CONTROL_SERVICE
            );

        console.log(
            `Control service: ${CONTROL_SERVICE}`
        );


        this.batteryCharacteristic =
            await batteryService.getCharacteristic(
                BATTERY_LEVEL
            );


        /*
         * 一次性获取 Control Service
         * 的全部 characteristic。
         *
         * 避免底层 BLE adapter 在连续
         * getCharacteristic() 时出现问题。
         */
        const characteristics =
            await controlService.getCharacteristics();


        this.pwmAB2 =
            characteristics.find(
                c =>
                    c.uuid.toLowerCase() ===
                    PWM_AB2
            );

        this.pwmA34 =
            characteristics.find(
                c =>
                    c.uuid.toLowerCase() ===
                    PWM_A34
            );

        this.pwmB34 =
            characteristics.find(
                c =>
                    c.uuid.toLowerCase() ===
                    PWM_B34
            );


        if (!this.pwmAB2) {
            throw new Error(
                "找不到 PWM_AB2 (1504)"
            );
        }

        if (!this.pwmA34) {
            throw new Error(
                "找不到 PWM_A34 (1505)"
            );
        }

        if (!this.pwmB34) {
            throw new Error(
                "找不到 PWM_B34 (1506)"
            );
        }


        console.log(
            "PWM_AB2 properties:",
            this.pwmAB2.properties
        );

        console.log(
            "PWM_A34 properties:",
            this.pwmA34.properties
        );

        console.log(
            "PWM_B34 properties:",
            this.pwmB34.properties
        );


        this.connected = true;


        /*
         * 先读取电量。
         */
        await this.readBattery();


        console.log(
            "Coyote GATT services found."
        );
    }


    async readBattery() {

        if (!this.batteryCharacteristic) {
            throw new Error(
                "Battery characteristic unavailable"
            );
        }

        const value =
            await this.batteryCharacteristic.readValue();


        if (value.byteLength < 1) {
            throw new Error(
                "Battery returned no data"
            );
        }


        this.battery =
            value.getUint8(0);


        console.log(
            `Battery: ${this.battery}%`
        );


        return this.battery;
    }


    /*
     * 统一处理 BLE 写入。
     *
     * 优先使用 writeWithoutResponse，
     * 因为 1504 / 1505 / 1506 都是控制数据。
     */
    async writeCharacteristic(
        characteristic,
        data
    ) {

        if (!characteristic) {
            throw new Error(
                "Characteristic 不存在"
            );
        }


        if (!data) {
            throw new Error(
                "没有要写入的数据"
            );
        }


        const bytes =
            data instanceof Uint8Array
                ? data
                : new Uint8Array(data);


        console.log(
            `BLE write ${characteristic.uuid}:`,
            Array.from(bytes)
                .map(
                    x =>
                        x
                            .toString(16)
                            .padStart(2, "0")
                            .toUpperCase()
                )
                .join(" ")
        );


        const properties =
            characteristic.properties || {};


        /*
         * 优先无响应写。
         */
        if (
            properties.writeWithoutResponse &&
            typeof characteristic.writeValueWithoutResponse ===
                "function"
        ) {

            console.log(
                "Using writeValueWithoutResponse()"
            );

            await characteristic
                .writeValueWithoutResponse(
                    bytes
                );

            return;
        }


        /*
         * 其次使用带响应写。
         */
        if (
            properties.write &&
            typeof characteristic.writeValueWithResponse ===
                "function"
        ) {

            console.log(
                "Using writeValueWithResponse()"
            );

            await characteristic
                .writeValueWithResponse(
                    bytes
                );

            return;
        }


        /*
         * 最后的兼容方式。
         */
        if (
            typeof characteristic.writeValue ===
                "function"
        ) {

            console.log(
                "Using writeValue()"
            );

            await characteristic.writeValue(
                bytes
            );

            return;
        }


        throw new Error(
            `Characteristic ${characteristic.uuid} 不支持写入`
        );
    }


    async setIntensity(a, b) {

        if (!this.connected) {
            throw new Error(
                "Coyote 未连接"
            );
        }


        a =
            this.safety.intensity(a);

        b =
            this.safety.intensity(b);


        const data =
            this.protocol.encodeIntensity(
                a,
                b
            );


        console.log(
            `PWM_AB2 A=${a} B=${b} <-`,
            Array.from(data)
                .map(
                    x =>
                        x
                            .toString(16)
                            .padStart(2, "0")
                            .toUpperCase()
                )
                .join(" ")
        );


        await this.writeCharacteristic(
            this.pwmAB2,
            data
        );


        this.channelA = a;
        this.channelB = b;

        this.active =
            a > 0 || b > 0;
    }


    async readIntensity() {

        if (!this.connected) {
            throw new Error(
                "Coyote 未连接"
            );
        }


        if (!this.pwmAB2) {
            throw new Error(
                "PWM_AB2 未初始化"
            );
        }


        /*
         * 1504 虽然协议表写着可读，
         * 但设备可能返回 0 byte。
         */
        const value =
            await this.pwmAB2.readValue();


        const data =
            new Uint8Array(
                value.buffer,
                value.byteOffset,
                value.byteLength
            );


        console.log(
            `PWM_AB2 read: ${data.length} byte(s)`
        );


        if (data.length === 0) {

            console.log(
                "Coyote returned no readable PWM_AB2 payload."
            );

            return null;
        }


        if (data.length !== 3) {
            throw new Error(
                `PWM_AB2 returned ${data.length} bytes`
            );
        }


        const result =
            this.protocol.decodeIntensity(
                data
            );


        this.channelA =
            result.a;

        this.channelB =
            result.b;


        console.log(
            `PWM_AB2 -> A=${result.a} B=${result.b}`
        );


        return result;
    }


    async setWaveformA(
        x,
        y,
        z
    ) {

        if (!this.connected) {
            throw new Error(
                "Coyote 未连接"
            );
        }


        const data =
            this.protocol.encodeWaveformA(
                x,
                y,
                z
            );


        await this.writeCharacteristic(
            this.pwmA34,
            data
        );
    }


    async setWaveformB(
        x,
        y,
        z
    ) {

        if (!this.connected) {
            throw new Error(
                "Coyote 未连接"
            );
        }


        const data =
            this.protocol.encodeWaveformB(
                x,
                y,
                z
            );


        await this.writeCharacteristic(
            this.pwmB34,
            data
        );
    }


    /*
     * 设置波形输出通道。
     *
     * A
     * B
     * ALL
     */
    setWaveformChannel(channel) {

        channel =
            String(channel || "A")
                .toUpperCase();


        if (
            channel !== "A" &&
            channel !== "B" &&
            channel !== "ALL"
        ) {

            throw new Error(
                "波形通道必须是 A、B 或 ALL"
            );
        }


        this.waveformChannel =
            channel;


        console.log(
            "Coyote waveform channel:",
            this.waveformChannel
        );


        return this.waveformChannel;
    }


    /*
     * 获取当前波形输出通道。
     */
    getWaveformChannel() {

        return this.waveformChannel;
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
     *
     * 波形实际写入目标由
     * waveformChannel 决定：
     *
     * A   -> 1505
     * B   -> 1506
     * ALL -> 1505 + 1506
     */
    async setWaveform(
        x,
        y,
        z
    ) {

        if (!this.connected) {
            throw new Error(
                "Coyote 未连接"
            );
        }


        /*
         * 情况 1：
         *
         * setWaveform([5, 135, 20])
         */
        if (Array.isArray(x)) {

            if (x.length < 3) {
                throw new Error(
                    "波形参数必须包含 3 个数字"
                );
            }

            const frame = x;

            x = frame[0];
            y = frame[1];
            z = frame[2];
        }


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
        else if (
            x !== null &&
            typeof x === "object"
        ) {

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
         * UI / JSON 数据可能把数字
         * 传成字符串。
         */
        x = Number(x);
        y = Number(y);
        z = Number(z);


        console.log(
            "Coyote setWaveform parameters:",
            {
                x: x,
                y: y,
                z: z
            }
        );


        /*
         * 检查最终参数。
         */
        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(z)
        ) {

            throw new Error(
                "波形参数必须是有效数字"
            );
        }


        /*
         * 当前 WaveformPresets
         * 全部使用整数。
         */
        if (
            !Number.isInteger(x) ||
            !Number.isInteger(y) ||
            !Number.isInteger(z)
        ) {

            throw new Error(
                "波形参数必须是整数"
            );
        }


        /*
         * 根据通道选择写入。
         *
         * 注意：
         *
         * ALL 并不是修改数据，
         * 而是把同一个已经编码好的
         * 波形分别发送给 A34 和 B34。
         */
        switch (this.waveformChannel) {

            case "A":

                await this.setWaveformA(
                    x,
                    y,
                    z
                );

                break;


            case "B":

                await this.setWaveformB(
                    x,
                    y,
                    z
                );

                break;


            case "ALL":

                await this.setWaveformA(
                    x,
                    y,
                    z
                );

                await this.setWaveformB(
                    x,
                    y,
                    z
                );

                break;


            default:

                /*
                 * 理论上不会发生，
                 * 防止状态被外部代码破坏。
                 */
                this.waveformChannel = "A";

                await this.setWaveformA(
                    x,
                    y,
                    z
                );

                break;
        }


        this.active = true;
    }


    async test() {

        if (!this.connected) {
            throw new Error(
                "Coyote 未连接"
            );
        }


        /*
         * 当前测试：
         *
         * A = 10
         * B = 0
         *
         * 用于验证 1504 写入链路。
         */
        await this.setIntensity(
            10,
            0
        );
    }


    async emergencyStop() {

        if (!this.connected) {
            this.active = false;
            return;
        }


        await this.setIntensity(
            0,
            0
        );


        this.active = false;


        console.log(
            "Coyote emergency stop."
        );
    }


    async disconnect() {

        try {

            if (
                this.device &&
                this.device.gatt &&
                this.device.gatt.connected
            ) {

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

            this.active = false;

            /*
             * 恢复默认行为。
             */
            this.waveformChannel = "A";
        }


        console.log(
            "Coyote disconnected."
        );
    }


    dispose() {

        try {

            if (
                this.device &&
                this.device.gatt &&
                this.device.gatt.connected
            ) {

                this.device.gatt.disconnect();
            }

        } catch (_) {
        }
    }
}


module.exports = {
    CoyoteController
};