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
     * 因为 1504 是控制数据，
     * 如果设备声明支持该属性，
     * 不应该强行走 Write Request。
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
         * 但你之前实测设备可能返回
         * 0 byte。
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