class CoyoteSafety {

    constructor() {

        this.maxIntensity = 200;
        this.maxDuration = 5000;
    }


    intensity(value) {

        value =
            Number(value);

        if (
            !Number.isFinite(value)
        ) {
            throw new Error(
                "Intensity must be a number"
            );
        }

        value =
            Math.round(value);

        return Math.max(
            0,
            Math.min(
                this.maxIntensity,
                value
            )
        );
    }


    duration(value) {

        value =
            Number(value);

        if (
            !Number.isFinite(value)
        ) {
            throw new Error(
                "Duration must be a number"
            );
        }

        return Math.max(
            0,
            Math.min(
                this.maxDuration,
                Math.round(value)
            )
        );
    }
}


module.exports = {
    CoyoteSafety
};