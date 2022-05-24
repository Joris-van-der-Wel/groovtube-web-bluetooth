import { BREATH_RANGE } from './constants.js';

/**
 * The arithmetic mean of a list of numbers.
 * Or 0 if the list is empty.
 */
export const calculateMean = (arr: number[]): number => {
    let sum = 0;
    for (const num of arr) {
        sum += num;
    }
    return arr.length ? sum / arr.length : 0;
};

export const parseBreathSensorData = (buffer: ArrayBuffer): number => {
    const hexString = String.fromCharCode(...new Uint8Array(buffer));
    return parseInt(hexString, 16) - BREATH_RANGE;
};

export const interpretBreathSensorValue = (sensorValue: number, deadZone_: number, calibrationMean: number): number => {
    const deadZone = deadZone_ * 2048;

    let value = sensorValue - calibrationMean;
    if (value > -deadZone && value < deadZone) {
        value = 0;
    } else {
        // make sure the progression is still smooth
        value -= deadZone * Math.sign(value);
    }

    value /= (BREATH_RANGE - deadZone);
    value = Math.min(1, Math.max(-1, value));
    return value;
};
