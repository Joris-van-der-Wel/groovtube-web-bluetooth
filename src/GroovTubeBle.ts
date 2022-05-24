import EventEmitter from 'eventemitter3';

import {
    CALIBRATE_SAMPLES, CONNECT_DELAY, DATA_COMMANDS, DEFAULT_DEADZONE, DISCONNECT_DEADLINE, INIT_DEADLINE,
    MELODY_SMART_DATA_CHARACTERISTIC, MELODY_SMART_SERVICE, TICK_DELAY, WRITE_VALUE_DEADLINE,
} from './constants.js';
import { isReadyStateTransitionOk } from './readyState.js';
import {
    ReadyState, EventNames, ErrorEvent, ReadyStateChangeEvent, BreathEvent, Listener, GattConnection, GroovTubeBleLogEntry,
    GroovTubeBleLogger, CalibrationState,
} from './types.js';
import { calculateMean, interpretBreathSensorValue, parseBreathSensorData } from './math.js';
import withAbortable from './abort.js';
import { createExplicitPromise, ExplicitPromise } from './promise.js';
import { GroovTubeBleError } from './GroovTubeBleError.js';
import { Ticker } from './Ticker.js';

/**
 * Example:
 * ```
 * const groovtube = new GroovTubeBle(navigator.bluetooth, console.log);
 * await groovtube.requestDevice();
 * await groovtube.connect();
 * await groovtube.calibrate();
 * groovtube.on('breath', breath => {
 *     console.log(`breath is now at ${Math.round(breath * 100)}%`);
 * });
 * ```
 */
export class GroovTubeBle {
    /**
     * A value between 0 and 1. If the sip or puff strength is lower than this value, the strength is assumed to be
     * 0. A deadZone of 0 has no effect. A deadZone of 0.5 means that any sip or puff below 50% strength is assumed to
     * be 0%.
     */
    public deadZone: number = DEFAULT_DEADZONE;

    private readonly _emitter: EventEmitter<EventNames> = new EventEmitter();

    private readonly _bluetooth: Bluetooth;

    private readonly _ticker: Ticker = new Ticker(this._tick.bind(this), TICK_DELAY);

    private readonly _logger: GroovTubeBleLogger | null;

    private _readyState: ReadyState = 'no-device';

    private _device: BluetoothDevice | null = null;

    private _connectPromise: ExplicitPromise<void, never> | null = null;

    private _lastConnectAttempt: number = 0;

    private _gattConnection: GattConnection | null = null;

    private _breathValue: number | null = null;

    private _calibration: CalibrationState = { samples: [], mean: 0, promise: null };

    private _connectAbortController: AbortController | undefined;

    /**
     * @param bluetooth Must be set to navigator.bluetooth
     * @param logger May be set to a function which will receive log messages. Each message is an object containing
     *               further details.
     */
    public constructor(bluetooth: Bluetooth, logger?: GroovTubeBleLogger) {
        this._bluetooth = bluetooth;
        this._logger = logger ?? null;
    }

    /**
     * Returns the current state of device discovery and connectivity. It will be set to one of the following values:
     *
     * "no-device"          This is the initial state. `requestDevice()` has not been called yet, or was not successful.
     * "requesting-device"  `requestDevice()` has just been called and we are waiting for the user to select a device.
     * "have-device"        The user has picked a device, `requestDevice()` has just been resolved successfully.
     * "connecting"         Attempting to connect to the device that has been picked by the user. Either connect() has
     *                      just been called, or the library is attempting to automatically reconnect.
     * "ready"              The connection has been established. Breath values will be polled for continuously while in
     *                      the "ready" state.
     *
     * `GroovTubeBle` instances will also emit an event whenever the ready state changes.
     * See: `on("readyStateChange", ...]`
     */
    public get readyState(): ReadyState {
        return this._readyState;
    }

    /**
     * Returns whether the instance is in a valid state for requestDevice() to be called. This is a convenience for
     * checking if the readyState is `"no-device"` or `"have-device"`.
     */
    public get canRequestDevice(): boolean {
        return this.readyState === 'no-device' || this.readyState === 'have-device';
    }

    /**
     * Returns whether the instance is in a valid state for connect() to be called. This is a convenience for checking
     * if the readyState is `"have-device"`.
     */
    public get canConnect(): boolean {
        return this.readyState === 'have-device';
    }

    /**
     * Returns whether the instance is in a valid state for disconnect() to be called. This is a convenience for
     * checking if the readyState is `"connecting"` or `"ready"`.
     */
    public get canDisconnect(): boolean {
        return this.readyState === 'connecting' || this.readyState === 'ready';
    }

    /**
     * Returns the last read breath sensor value. This value is between -1 and 1, it represents the strength of the sip
     * or puff. Sips are represented by a negative fraction, puffs by a positive fraction. If no value has been read, if
     * there is no active connection the value will be `null`.
     *
     * Some examples:
     *
     * | Value |                       |
     * |------:|-----------------------|
     * |  -1.0 | Sip at full strength  |
     * |  -0.5 | Sip at half strength  |
     * |   0.0 | Neutral               |
     * |   0.5 | Puff at half strength |
     * |   1.0 | Puff at full strength |
     */
    public get breathValue() : number | null {
        return this._breathValue;
    }

    /**
     * Registers a function to be called whenever the `readyState` on this instance changes. The new value for
     * `readyState` will be passed as the first argument.
     */
    public on(eventName: 'readyStateChange', listener: Listener<ReadyStateChangeEvent>): void;

    /**
     * Registers a function to be called whenever the `breathValue` on this instance changes. The new value for `breathValue` will be passed
     * as the first argument.
     */
    public on(eventName: 'breath', listener: Listener<BreathEvent>): void;

    /**
     * Registers a function to be called whenever an error occurs that can not be reported in another way. For example
     * if a reconnection attempt fails.
     */
    public on(eventName: 'error', listener: Listener<ErrorEvent>): void;

    public on(eventName: EventNames, listener: Listener<any>): void {
        this._emitter.on(eventName, listener);
    }

    /**
     * Removes the registration of a function that has been previously registered using the `on()` method. If the
     * `listener` parameter is not given, all registrations for that event name are removed.
     */
    public removeListener(eventName: EventNames, listener?: (...args: any) => void): void {
        this._emitter.removeListener(eventName, listener);
    }

    /**
     * Ask the user to select the GroovTube BLE peripheral. This will pop up a browser dialog, presenting the user
     * with a list of nearby bluetooth devices. After selecting a device, the promise returned by the method will
     * resolve. Or, if the user cancels the dialog, the promise will reject.
     *
     * The list that is presented to the user will be filtered by this library. This means that unrelated bluetooth
     * devices will not be visible. Although, do note that other bluetooth devices may be presented to the user, if
     * they are using the same off-the-shelf hardware module.
     *
     * This function __must__ be called as a direct result of a (trusted) user input event (for example a button
     * "click"). This is a browser limitation imposed to prevent sites from spamming the user with popups (similar to
     * how popup blockers work).
     */
    public async requestDevice(): Promise<void> {
        if (!this.canRequestDevice) {
            throw new GroovTubeBleError('requestDevice(): Already got a device or busy requesting one');
        }

        this._device = null;
        // reset the calibration because we may be connecting to a different physical device now
        this._abortCalibration('requestDevice() has been called', true);
        this._updateReadyState('requesting-device');

        let device;
        try {
            device = await this._bluetooth.requestDevice({
                filters: [
                    {
                        services: [MELODY_SMART_SERVICE],
                    },
                ],
            });
        } catch (err) {
            this._updateReadyState('no-device');
            throw new GroovTubeBleError('requestDevice(): Failed to request device', err);
        }

        if (!device.gatt) {
            this._updateReadyState('no-device');
            throw new GroovTubeBleError('requestDevice(): Found device has no "gatt" server set');
        }

        this._device = device;
        this._updateReadyState('have-device');

        this._logInfo({
            device: {
                id: device.id,
                name: device.name,
                uuids: device.uuids,
            },
        }, 'Have device');
    }

    /**
     * Attempt to connect to the peripheral and start reading from the breath sensor.
     * If the connection is dropped, this instance will attempt to reconnect after a short delay, until disconnect() is
     * called. This method will resolve as soon as the first successful connection has been made. The requestDevice()
     * method must have been successfully called first.
     */
    public async connect(): Promise<void> {
        if (!this.canConnect) {
            throw new GroovTubeBleError(
                this.readyState === 'no-device'
                    ? 'connect(): Must call requestDevice() first'
                    : 'connect(): Invalid state',
            );
        }

        this._updateReadyState('connecting');
        // always connect again immediately if the caller requests an explicit connect()
        this._lastConnectAttempt = 0;

        const connectAbortController = new AbortController();
        const connectPromise = createExplicitPromise();
        connectAbortController.signal.addEventListener('abort', () => {
            connectPromise.reject(new GroovTubeBleError('disconnect() has been requested'));
        });
        this._connectPromise = connectPromise;
        this._connectAbortController = connectAbortController;

        this._ticker.start();
        await this._connectPromise.promise;
    }

    /**
     * Drop any active connection to the peripheral and no longer attempt to reconnect.
     */
    public async disconnect(): Promise<void> {
        if (!this.canDisconnect) {
            throw new GroovTubeBleError('disconnect(): Invalid state');
        }

        this._connectAbortController!.abort(new GroovTubeBleError('disconnect() has been requested'));
        this._abortCalibration('disconnect() has been called', false);
        await this._ticker.stop();

        try {
            await withAbortable({ timeout: DISCONNECT_DEADLINE }, async () => {
                await this._device?.gatt?.disconnect();
            });
        } finally {
            this._gattConnection = null;
            this._updateReadyState('have-device');
        }
    }

    /**
     * Collect a number of samples from the device to determine the neutral value of the breath sensor.
     * The user should not be sipping or puffing during the calibration. It is recommended to perform calibration at
     * least once. This method will resolve when enough samples have been collected. No "breath" events will be emitted
     * while this method is busy.
     */
    public async calibrate(): Promise<void> {
        const calibration = this._calibration;
        calibration.samples.length = 0;
        calibration.promise = createExplicitPromise();
        await calibration.promise.promise;
    }

    private _abortCalibration(reason: string, resetCalibration: boolean): void {
        this._calibration.promise?.reject(new GroovTubeBleError(`Calibration aborted: ${reason}`));
        this._calibration.samples.length = 0;
        this._calibration.promise = null;

        if (resetCalibration) {
            this._calibration.mean = 0;
        }
    }

    private _log(level: GroovTubeBleLogEntry['level'], data: Record<string, unknown>, msg: string) {
        const logger = this._logger;
        if (logger) {
            logger({
                ...data,
                time: Date.now(),
                level,
                msg,
            });
        }
    }

    private _logInfo(data: Record<string, unknown>, msg: string) { this._log(30, data, msg); }

    private _logError(data: Record<string, unknown>, msg: string) { this._log(50, data, msg); }

    private _emit(eventName: 'readyStateChange', ...args: ReadyStateChangeEvent): void;
    private _emit(eventName: 'breath', ...args: BreathEvent): void;
    private _emit(eventName: 'error', ...args: ErrorEvent): void;
    private _emit(eventName: EventNames, ...args: any): void {
        this._emitter.emit(eventName, ...args);
    }

    /**
     * Set the readyState and assert that the state transition is actually allowed.
     */
    private _updateReadyState(newReadyState: ReadyState) {
        const oldReadyState = this.readyState;
        if (!isReadyStateTransitionOk(oldReadyState, newReadyState)) {
            throw new GroovTubeBleError(`Invalid transition of readyState from ${oldReadyState} to ${newReadyState}`);
        }

        this._readyState = newReadyState;
        this._breathValue = null; // always clear the breath value that is exposed to the user of this instance
        this._logInfo({ newReadyState, oldReadyState }, 'Ready state has changed');
        this._emit('readyStateChange', newReadyState);
    }

    private async _tick(now: number): Promise<void> {
        try {
            const { readyState } = this;

            if (readyState === 'no-device' || readyState === 'requesting-device') {
                throw new GroovTubeBleError(`_tick(): Invalid readyState: ${this.readyState}`);
            }

            const device = this._device!;
            const gatt = device.gatt!;

            if (readyState === 'ready' && !this._gattConnection?.server.connected) {
                this._updateReadyState('connecting');
                return; // attempt connection next tick
            }

            if (readyState === 'connecting' && now - this._lastConnectAttempt >= CONNECT_DELAY) {
                this._lastConnectAttempt = now;

                const signal = { signal: this._connectAbortController!.signal };

                // Do not timeout gatt.connect(). The device might be out of range, the browser will reconnect
                // when it is back in range and then resolve the connect().
                const server = await withAbortable({ ...signal }, async () => {
                    this._logInfo({}, 'Connection attempt...');
                    return await gatt.connect();
                });

                this._logInfo({}, 'Connected');

                this._gattConnection = await withAbortable({ ...signal, timeout: INIT_DEADLINE }, async (abortable) => {
                    const melodySmartService = await abortable(server.getPrimaryService(MELODY_SMART_SERVICE));
                    const melodySmartDataChar = await abortable(melodySmartService.getCharacteristic(MELODY_SMART_DATA_CHARACTERISTIC));
                    melodySmartDataChar.oncharacteristicvaluechanged = this._melodyDataCharChange;
                    await melodySmartDataChar.startNotifications();

                    return {
                        server,
                        melodySmartService,
                        melodySmartDataChar,
                    };
                });

                this._updateReadyState('ready');

                if (this._connectPromise) {
                    this._connectPromise.resolve();
                }

                return; // start gathering breath values next tick
            }

            if (readyState === 'ready') {
                const abortOpts = { timeout: WRITE_VALUE_DEADLINE, signal: this._connectAbortController!.signal };
                await withAbortable(abortOpts, async () => {
                    await this._gattConnection!.melodySmartDataChar.writeValueWithResponse(DATA_COMMANDS.REQUEST_BREATH);
                });
            }
        } catch (err) {
            this._logError({ err }, 'Error during tick');
            const newError = new GroovTubeBleError('Error during tick', err);
            this._emit('error', newError);
        }
    }

    private _melodyDataCharChange = (event: Event) => {
        try {
            const target = event.target as BluetoothRemoteGATTCharacteristic;
            const buffer = target.value?.buffer;
            if (!buffer) {
                throw Error('Missing value');
            }

            const value = parseBreathSensorData(buffer);
            this._handleNewBreathValue(value);
        } catch (err) {
            this._logError({ err }, 'Error during characteristicvaluechanged');
            this._emit('error', new GroovTubeBleError('Error during characteristicvaluechanged', err));
        }
    };

    private _handleNewBreathValue(sensorValue: number) {
        if (this.readyState !== 'ready') {
            // Received a late event
            return;
        }

        const calibration = this._calibration;

        if (calibration.promise) {
            calibration.samples.push(sensorValue);

            if (calibration.samples.length >= CALIBRATE_SAMPLES) {
                const mean = Math.round(calculateMean(calibration.samples));
                this._logInfo({ mean }, 'Calibration complete');
                calibration.mean = mean;
                calibration.promise.resolve();
                calibration.promise = null;
            }
        } else {
            const { deadZone } = this;
            const value = interpretBreathSensorValue(sensorValue, deadZone, calibration.mean);
            this._breathValue = value;
            this._emit('breath', value);
        }
    }
}
