import { ExplicitPromise } from './promise.js';
import { GroovTubeBleError } from './GroovTubeBleError.js';

export type Constructor<T, A extends any[] = any> = abstract new (...args: A) => T;

/**
 * no-device : This is the initial state. `requestDevice()` has not been called yet, or was not successful.
 * requesting-device : `requestDevice()` has just been called and we are waiting for the user to select a device.
 * have-device : The user has picked a device, `requestDevice()` has just been resolved successfully.
 * connecting : Attempting to connect to the device that has been picked by the user. Either connect() has just been called, or the library
 *              is attempting to automatically reconnect.
 * ready : The connection has been established. Breath values will be polled for continuously while in the "ready" state.
 */
export type ReadyState = 'no-device' | 'requesting-device' | 'have-device' | 'connecting' | 'ready';
export type EventNames = 'error' | 'readyStateChange' | 'calibrationStateChange' | 'breath';

export type ErrorEvent = [error: GroovTubeBleError];
export type ReadyStateChangeEvent = [readyState: ReadyState];
export type CalibrationStateChangeEvent = [calibrating: boolean];
export type BreathEvent = [breath: number];
export type Listener<A extends any[]> = (...args: A) => void;

export interface GattConnection {
    readonly server: BluetoothRemoteGATTServer;
    readonly melodySmartService: BluetoothRemoteGATTService;
    readonly melodySmartDataChar: BluetoothRemoteGATTCharacteristic;
}

export interface CalibrationState {
    samples: number[];
    mean: number;
    promise: ExplicitPromise<void, GroovTubeBleError> | null;
}

export interface GroovTubeBleLogEntry {
    // trace, debug, info, warn, error, fatal
    level: 10 | 20 | 30 | 40 | 50 | 60;
    time: number; // Same format as Date.now()
    msg: string;
    [x: string]: unknown;
}
export type GroovTubeBleLogger = (entry: GroovTubeBleLogEntry) => void;
