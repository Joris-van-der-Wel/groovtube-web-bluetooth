import mocha from 'mocha-sugar-free';
import { assert } from 'chai';
import { fake, SinonFakeTimers, useFakeTimers } from 'sinon';

import {
    INIT_DEADLINE, CONNECT_DELAY, MELODY_SMART_DATA_CHARACTERISTIC, MELODY_SMART_SERVICE, TICK_DELAY,
} from '../src/constants.js';
import { AbortError } from '../src/abort.js';
import {
    BreathEvent, GroovTubeBle, GroovTubeBleError, ReadyStateChangeEvent, CalibrationStateChangeEvent,
} from '../src/index.js';
import { createExplicitPromise, ExplicitPromise, inspectPromise } from '../src/promise.js';
import { assertRejected, FakeWrap, stringToArrayBuffer } from './helpers.js';

const { describe, it } = mocha;
const { strictEqual: eq, deepStrictEqual: deq } = assert;

describe('GroovTubeBle', () => {
    let clock: SinonFakeTimers;

    let errorEvents: GroovTubeBleError[];
    let msDataCharMock: { // BluetoothRemoteGATTCharacteristic
        startNotifications: FakeWrap<BluetoothRemoteGATTCharacteristic['startNotifications']>;
        oncharacteristicvaluechanged?: BluetoothRemoteGATTCharacteristic['oncharacteristicvaluechanged'];
        writeValueWithResponse: FakeWrap<BluetoothRemoteGATTCharacteristic['writeValueWithResponse']>;
    };
    let msServiceMock: { // BluetoothRemoteGATTService
        getCharacteristic: FakeWrap<BluetoothRemoteGATTService['getCharacteristic']>;
    };
    let serverMock: { // BluetoothRemoteGATTServer
        getPrimaryService: FakeWrap<BluetoothRemoteGATTServer['getPrimaryService']>;
        connected: boolean;
    };
    let deviceMock: { // BluetoothDevice
        gatt?: {
            connect: FakeWrap<BluetoothRemoteGATTServer['connect']>;
            disconnect: FakeWrap<BluetoothRemoteGATTServer['disconnect']>;
        },
    };
    let bluetoothMock: { // Bluetooth
        requestDevice: FakeWrap<Bluetooth['requestDevice']>;
    };

    let groovtube: GroovTubeBle;

    beforeEach(() => {
        clock = useFakeTimers(1652364000000);
    });

    afterEach(() => {
        clock.restore();
    });

    afterEach(() => {
        // the unit test should clear this array if it expected an error to be emitted
        deq(errorEvents, []);
    });

    beforeEach(() => {
        errorEvents = [];
        msDataCharMock = {
            startNotifications: fake(async () => msDataCharMock) as any,
            oncharacteristicvaluechanged: undefined,
            writeValueWithResponse: fake.resolves(undefined),
        };
        msServiceMock = {
            getCharacteristic: fake(async () => msDataCharMock) as any,
        };
        serverMock = {
            getPrimaryService: fake(async () => msServiceMock) as any,
            connected: true,
        };
        deviceMock = {
            gatt: {
                connect: fake(async () => serverMock) as any,
                disconnect: fake.resolves(undefined) as any,
            },
        };
        bluetoothMock = {
            requestDevice: fake(async () => deviceMock) as any,
        };

        groovtube = new GroovTubeBle(bluetoothMock as any);
        groovtube.on('error', (error) => {
            errorEvents.push(error);
        });
    });

    const createEventMock = (value: string): Event => ({
        target: {
            value: {
                buffer: stringToArrayBuffer(value),
            },
        },
    } as any);

    const callBreathHandler = (value: string) => {
        const handler = msDataCharMock.oncharacteristicvaluechanged!;
        handler.call(msDataCharMock as any, createEventMock(value));
    };

    it('Should construct properly', () => {
        eq(groovtube.deadZone, 0.025); // the default deadZone
        eq(groovtube.readyState, 'no-device');
        eq(groovtube.breathValue, null);
    });

    describe('requestDevice()', () => {
        it('Should properly request a device from the Web Bluetooth API', async () => {
            bluetoothMock.requestDevice = fake(async () => {
                eq(groovtube.readyState, 'requesting-device');
                return deviceMock as any;
            });

            await groovtube.requestDevice();
            eq(groovtube.readyState, 'have-device');
            eq((groovtube as any)._device, deviceMock);

            eq(bluetoothMock.requestDevice.callCount, 1);
            deq(bluetoothMock.requestDevice.firstCall.args, [
                {
                    filters: [
                        {
                            services: ['bc2f4cc6-aaef-4351-9034-d66268e328f0'],
                        },
                    ],
                },
            ]);
        });

        it('Should replace a previously found device', async () => {
            bluetoothMock.requestDevice = fake(async () => {
                eq(groovtube.readyState, 'requesting-device');
                return deviceMock as any;
            });

            await groovtube.requestDevice();
            eq(groovtube.readyState, 'have-device');
            eq((groovtube as any)._device, deviceMock);
            eq(bluetoothMock.requestDevice.callCount, 1);

            deviceMock = { // reset the reference for the eq() check later
                gatt: {} as any,
            };
            await groovtube.requestDevice();
            eq(groovtube.readyState, 'have-device');
            eq((groovtube as any)._device, deviceMock);
            eq(bluetoothMock.requestDevice.callCount, 2);
        });

        it('Should not allow for concurrent executions', async () => {
            bluetoothMock.requestDevice = fake(async () => {
                eq(groovtube.readyState, 'requesting-device');
                return deviceMock as any;
            });

            const first = groovtube.requestDevice();
            const second = groovtube.requestDevice();

            await first;

            const error = await assertRejected(second, GroovTubeBleError);
            eq(error.message, 'requestDevice(): Already got a device or busy requesting one');

            eq(groovtube.readyState, 'have-device');
            eq(bluetoothMock.requestDevice.callCount, 1); // should have only request an actual device once
        });

        it('Should wrap rejections from bluetooth.requestDevice()', async () => {
            const fakeError = new Error('Error from test! User cancelled peripheral picker');

            bluetoothMock.requestDevice = fake(async () => {
                throw fakeError;
            });

            const error = await assertRejected(groovtube.requestDevice(), GroovTubeBleError);
            eq(error.message, 'requestDevice(): Failed to request device: Error from test! User cancelled peripheral picker');
            eq(error.cause, fakeError);
            eq(groovtube.readyState, 'no-device');
        });

        it('Should validate device.gatt is set', async () => {
            deviceMock.gatt = undefined;

            const error = await assertRejected(groovtube.requestDevice(), GroovTubeBleError);
            eq(error.message, 'requestDevice(): Found device has no "gatt" server set');
            eq(error.cause, undefined);
            eq(groovtube.readyState, 'no-device');
        });
    });

    describe('Connection handling', () => {
        describe('connect()', async () => {
            it('Should validate a device has already been requested', async () => {
                const error = await assertRejected(groovtube.connect(), GroovTubeBleError);
                eq(error.message, 'connect(): Must call requestDevice() first');
                eq(error.cause, undefined);
                eq(groovtube.readyState, 'no-device');
            });

            it('Should validate a device has been obtained', async () => {
                bluetoothMock.requestDevice = fake(() => new Promise(() => {
                    // forever pending
                }));

                // concurrent execution of requestDevice() and connect()
                groovtube.requestDevice(); // promise ignored

                const error = await assertRejected(groovtube.connect(), GroovTubeBleError);
                eq(error.message, 'connect(): Invalid state');
                eq(error.cause, undefined);
                eq(groovtube.readyState, 'requesting-device');
            });

            it('Should attempt to connect to the device', async () => {
                await groovtube.requestDevice();
                await groovtube.connect();
                eq(groovtube.readyState, 'ready');
                eq(deviceMock.gatt!.connect.callCount, 1);
                eq(serverMock.getPrimaryService.callCount, 1);
                eq(msServiceMock.getCharacteristic.callCount, 1);
                eq(msDataCharMock.startNotifications.callCount, 1);
            });

            it('Should attempt to connect to the device and not resolve until successful', async () => {
                await groovtube.requestDevice();

                const gattConnectPromise = createExplicitPromise<BluetoothRemoteGATTServer>();
                const getPrimaryServicePromise = createExplicitPromise<BluetoothRemoteGATTService>();
                const getCharacteristicPromise = createExplicitPromise<BluetoothRemoteGATTCharacteristic>();
                const startNotificationsPromise = createExplicitPromise<BluetoothRemoteGATTCharacteristic>();
                deviceMock.gatt!.connect = fake.returns(gattConnectPromise.promise);
                serverMock.getPrimaryService = fake.returns(getPrimaryServicePromise.promise);
                msServiceMock.getCharacteristic = fake.returns(getCharacteristicPromise.promise);
                msDataCharMock.startNotifications = fake.returns(startNotificationsPromise.promise);

                // start ticking and start the connection attempts
                const connectPromise = inspectPromise(groovtube.connect());
                // should immediately update the ready state
                eq(groovtube.readyState, 'connecting');

                // should attempt the connection but not yet resolve groovtube.connect()
                await clock.tickAsync(0);
                eq(deviceMock.gatt!.connect.callCount, 1);

                // should attempt to get the melody smart service after connecting succeeds
                gattConnectPromise.resolve(serverMock as any);
                await clock.tickAsync(0);
                eq(serverMock.getPrimaryService.callCount, 1);
                eq(serverMock.getPrimaryService.firstCall.firstArg, MELODY_SMART_SERVICE);

                // should attempt to get the data characteristics after getting the service
                getPrimaryServicePromise.resolve(msServiceMock as any);
                await clock.tickAsync(0);
                eq(msServiceMock.getCharacteristic.callCount, 1);
                eq(msServiceMock.getCharacteristic.firstCall.firstArg, MELODY_SMART_DATA_CHARACTERISTIC);

                getCharacteristicPromise.resolve(msDataCharMock as any);
                await clock.tickAsync(0);
                eq(msDataCharMock.startNotifications.callCount, 1);

                // after all this connection request should still be pending
                eq(connectPromise.state, 'pending');
                eq(groovtube.readyState, 'connecting');

                // However resolving the last mock should cause connect() to resolve now
                startNotificationsPromise.resolve(msDataCharMock as any);
                await clock.tickAsync(0);
                eq(connectPromise.state, 'fulfilled');
                eq(groovtube.readyState, 'ready');

                eq(deviceMock.gatt!.connect.callCount, 1);
                eq(serverMock.getPrimaryService.callCount, 1);
                eq(msServiceMock.getCharacteristic.callCount, 1);
                eq(msDataCharMock.startNotifications.callCount, 1);
            });

            it('Should attempt to reconnect after a delay if connecting fails', async () => {
                await groovtube.requestDevice();

                const connectError = Error('Error from test: connecting failed');
                deviceMock.gatt!.connect = fake.rejects(connectError);

                const connectPromise = inspectPromise(groovtube.connect());
                eq(groovtube.readyState, 'connecting');

                await clock.tickAsync(0);
                eq(errorEvents.length, 1);
                assert.instanceOf(errorEvents[0], GroovTubeBleError);
                eq(errorEvents[0].cause, connectError);
                eq(groovtube.readyState, 'connecting');
                eq(connectPromise.state, 'pending');
                eq(deviceMock.gatt!.connect.callCount, 1);

                deviceMock.gatt!.connect = fake.resolves(serverMock as any);

                // Should not attempt to connect again until the connect delay has lapsed
                await clock.tickAsync(CONNECT_DELAY - 1);
                eq(deviceMock.gatt!.connect.callCount, 0);

                // 2nd attempt should be successful
                await clock.tickAsync(TICK_DELAY);
                eq(deviceMock.gatt!.connect.callCount, 1);
                eq(connectPromise.state, 'fulfilled');
                eq(groovtube.readyState, 'ready');
                eq(errorEvents.length, 1);
                errorEvents.length = 0;
            });

            it('Should give up the connection attempt if initializing takes too long', async () => {
                await groovtube.requestDevice();

                const getPrimaryServicePromises: ExplicitPromise<BluetoothRemoteGATTService>[] = [];
                serverMock.getPrimaryService = fake<[number | string]>(() => {
                    const promise = createExplicitPromise<BluetoothRemoteGATTService>();
                    getPrimaryServicePromises.push(promise);
                    return promise.promise;
                });

                const connectPromise = inspectPromise(groovtube.connect());

                await clock.tickAsync(0);
                eq(deviceMock.gatt!.connect.callCount, 1);
                eq(serverMock.getPrimaryService.callCount, 1);

                // should attempt to connect again after the INIT_DEADLINE has lapsed
                await clock.tickAsync(INIT_DEADLINE);
                await clock.tickAsync(TICK_DELAY);
                eq(errorEvents.length, 1);
                assert.instanceOf(errorEvents[0], GroovTubeBleError);
                assert.instanceOf(errorEvents[0].cause, AbortError);

                eq(deviceMock.gatt!.connect.callCount, 2);
                eq(serverMock.getPrimaryService.callCount, 2);

                // Resolving the first attempt should have no effect, because this attempt has been abandoned
                getPrimaryServicePromises[0].resolve(msServiceMock as any);
                await clock.tickAsync(0);
                eq(msServiceMock.getCharacteristic.callCount, 0); // this is the next step, and should not have been called
                eq(connectPromise.state, 'pending');

                // however resolving the second attempt should now move things forward
                getPrimaryServicePromises[1].resolve(msServiceMock as any);
                await clock.tickAsync(0);
                eq(msServiceMock.getCharacteristic.callCount, 1);
                eq(connectPromise.state, 'fulfilled');
                eq(groovtube.readyState, 'ready');

                eq(errorEvents.length, 1);
                errorEvents.length = 0;
            });
        });

        describe('disconnect()', async () => {
            it('Should reject if not readyState is not valid', async () => {
                const error = await assertRejected(groovtube.disconnect(), GroovTubeBleError);
                eq(error.message, 'disconnect(): Invalid state');
            });

            it('Should disconnect from the device and stop interacting with it', async () => {
                await groovtube.requestDevice();

                await groovtube.connect();
                eq(deviceMock.gatt!.connect.callCount, 1);
                eq(serverMock.getPrimaryService.callCount, 1);
                eq(deviceMock.gatt!.disconnect.callCount, 0);
                eq(groovtube.readyState, 'ready');

                await groovtube.disconnect();
                eq(groovtube.readyState, 'have-device');
                eq(deviceMock.gatt!.disconnect.callCount, 1);

                // should no longer attempt to write values, nor try to connect again
                await clock.tickAsync(TICK_DELAY * 30000);
                eq(msDataCharMock.writeValueWithResponse.callCount, 0);
                eq(deviceMock.gatt!.connect.callCount, 1);
                eq(serverMock.getPrimaryService.callCount, 1);
            });

            it('Should abort connection attempts that are in progress (gatt.connect)', async () => {
                await groovtube.requestDevice();

                const gattConnectPromise = createExplicitPromise<BluetoothRemoteGATTServer>();
                deviceMock.gatt!.connect = fake.returns(gattConnectPromise.promise);

                const connectPromise = groovtube.connect();
                eq(groovtube.readyState, 'connecting');

                await groovtube.disconnect();
                eq(groovtube.readyState, 'have-device');

                const error = await assertRejected(connectPromise, GroovTubeBleError);
                eq(error.message, 'disconnect() has been requested');

                eq(errorEvents.length, 1);
                assert.instanceOf(errorEvents[0], GroovTubeBleError);
                assert.instanceOf(errorEvents[0].cause, AbortError);
                errorEvents.length = 0;
            });

            it('Should abort connection attempts that are in progress (server.getPrimaryService)', async () => {
                await groovtube.requestDevice();

                const getPrimaryServicePromise = createExplicitPromise<BluetoothRemoteGATTService>();
                serverMock.getPrimaryService = fake.returns(getPrimaryServicePromise.promise);

                const connectPromise = groovtube.connect();
                eq(groovtube.readyState, 'connecting');

                await groovtube.disconnect();
                eq(groovtube.readyState, 'have-device');

                const error = await assertRejected(connectPromise, GroovTubeBleError);
                eq(error.message, 'disconnect() has been requested');

                eq(errorEvents.length, 1);
                assert.instanceOf(errorEvents[0], GroovTubeBleError);
                assert.instanceOf(errorEvents[0].cause, AbortError);
                errorEvents.length = 0;
            });

            it('Should not interfere with future connection requests', async () => {
                await groovtube.requestDevice();

                const gattConnectPromise = createExplicitPromise<BluetoothRemoteGATTServer>();
                deviceMock.gatt!.connect = fake.returns(gattConnectPromise.promise);

                const connectPromise = groovtube.connect();
                await groovtube.disconnect();
                await assertRejected(connectPromise, GroovTubeBleError);

                deviceMock.gatt!.connect = fake(async () => serverMock) as any;
                await groovtube.connect();
                eq(groovtube.readyState, 'ready');
                eq(deviceMock.gatt!.connect.callCount, 1);
                eq(serverMock.getPrimaryService.callCount, 1);
                eq(msServiceMock.getCharacteristic.callCount, 1);
                eq(msDataCharMock.startNotifications.callCount, 1);

                eq(errorEvents.length, 1);
                assert.instanceOf(errorEvents[0], GroovTubeBleError);
                assert.instanceOf(errorEvents[0].cause, AbortError);
                errorEvents.length = 0;
            });
        });

        it('Should attempt to reconnect if the connection drops', async () => {
            await groovtube.requestDevice();
            await groovtube.connect();
            eq(groovtube.readyState, 'ready');

            const gattConnectPromise = createExplicitPromise<BluetoothRemoteGATTServer>();
            deviceMock.gatt!.connect = fake.returns(gattConnectPromise.promise);

            serverMock.connected = false;

            // Should detect the connection being gone at the next tick
            await clock.tickAsync(TICK_DELAY);
            eq(groovtube.readyState, 'connecting');

            // Should not attempt to connect again until the connect delay has lapsed
            await clock.tickAsync(CONNECT_DELAY - TICK_DELAY - 1);
            eq(deviceMock.gatt!.connect.callCount, 0);

            await clock.tickAsync(TICK_DELAY);
            eq(deviceMock.gatt!.connect.callCount, 1);

            gattConnectPromise.resolve(serverMock as any);
            await clock.tickAsync(0);
            eq(serverMock.getPrimaryService.callCount, 2);
            eq(msServiceMock.getCharacteristic.callCount, 2);
            eq(msDataCharMock.startNotifications.callCount, 2);
            eq(groovtube.readyState, 'ready');
        });
    });

    describe('breath events', () => {
        it('Should request breath data every tick', async () => {
            const assertExpectedBuffer = (buffer: ArrayBuffer) => {
                const expectedBuffer = Buffer.from('?b', 'ascii');
                assert(expectedBuffer.equals(Buffer.from(buffer)));
            };

            await groovtube.requestDevice();
            await groovtube.connect();

            await clock.tickAsync(TICK_DELAY);
            eq(msDataCharMock.writeValueWithResponse.callCount, 1);
            assertExpectedBuffer(msDataCharMock.writeValueWithResponse.getCall(0).firstArg);

            await clock.tickAsync(TICK_DELAY);
            eq(msDataCharMock.writeValueWithResponse.callCount, 2);
            assertExpectedBuffer(msDataCharMock.writeValueWithResponse.getCall(1).firstArg);

            await clock.tickAsync(TICK_DELAY);
            eq(msDataCharMock.writeValueWithResponse.callCount, 3);
            assertExpectedBuffer(msDataCharMock.writeValueWithResponse.getCall(2).firstArg);
        });

        it('Should emit a breath event whenever the characteristic is updated', async () => {
            await groovtube.requestDevice();
            await groovtube.connect();
            groovtube.deadZone = 0;

            const handleBreath = fake<BreathEvent>();
            groovtube.on('breath', handleBreath);

            callBreathHandler('000'); // maximum sip
            callBreathHandler('400'); // half sip
            callBreathHandler('800'); // neutral
            callBreathHandler('C00'); // half puff
            callBreathHandler('1000'); // maximum puff

            eq(handleBreath.callCount, 5);
            eq(handleBreath.getCall(0).firstArg, -1);
            eq(handleBreath.getCall(1).firstArg, -0.5);
            eq(handleBreath.getCall(2).firstArg, 0);
            eq(handleBreath.getCall(3).firstArg, 0.5);
            eq(handleBreath.getCall(4).firstArg, 1);
        });

        it('Should properly apply a deadZone to the breath value', async () => {
            await groovtube.requestDevice();
            await groovtube.connect();
            groovtube.deadZone = 0x100 / 2048;

            const handleBreath = fake<BreathEvent>();
            groovtube.on('breath', handleBreath);

            callBreathHandler('000'); // maximum sip
            callBreathHandler('380'); // half sip
            callBreathHandler('700'); // bottom of the dead zone
            callBreathHandler('800'); // neutral
            callBreathHandler('900'); // top of the dead zone
            callBreathHandler('c80'); // half puff
            callBreathHandler('1000'); // maximum puff

            eq(handleBreath.callCount, 7);
            eq(handleBreath.getCall(0).firstArg, -1);
            eq(handleBreath.getCall(1).firstArg, -0.5);
            eq(handleBreath.getCall(2).firstArg, 0);
            eq(handleBreath.getCall(3).firstArg, 0);
            eq(handleBreath.getCall(4).firstArg, 0);
            eq(handleBreath.getCall(5).firstArg, 0.5);
            eq(handleBreath.getCall(6).firstArg, 1);
        });

        it('Should ignore values received if the readyState is not ready', async () => {
            await groovtube.requestDevice();
            await groovtube.connect();
            const handler = msDataCharMock.oncharacteristicvaluechanged!;

            const handleBreath = fake<BreathEvent>();
            groovtube.on('breath', handleBreath);

            // simulate an event that was in the event loop queue, however disconnect() is called before the handler is invoked
            await groovtube.disconnect();
            handler.call(msDataCharMock as any, createEventMock('400'));

            await clock.tickAsync(0);
            eq(handleBreath.callCount, 0);
        });

        it('Should emit error events for invalid values', async () => {
            await groovtube.requestDevice();
            await groovtube.connect();
            const handler = msDataCharMock.oncharacteristicvaluechanged!;

            const handleBreath = fake<BreathEvent>();
            groovtube.on('breath', handleBreath);

            handler.call(msDataCharMock as any, {
                target: {
                    value: null,
                },
            } as any);

            eq(errorEvents.length, 1);
            assert.instanceOf(errorEvents[0], GroovTubeBleError);
            eq(errorEvents[0].message, 'Error during characteristicvaluechanged: Missing value');

            errorEvents.length = 0;
        });
    });

    describe('calibrate()', async () => {
        const calibrationValues = [
            // the mean is 840
            '830', '830', '830', '850', '850', '850',
            '840', '830', '850', '850', '840', '830',
            '830', '830', '830', '850', '840', '830',
            '830', '850', '850', '830', '850', '850',
            '830', '850', '840', '830', '850', '830',
            '830', '840', '850', '830', '830', '840',
            '850', '830', '850', '840', '840', '850',
            '850', '840', '830', '850', '850', '850',
            '840', '830',
        ];
        eq(calibrationValues.length, 50);

        it('Should collect 50 samples of which the mean is used as the new neutral', async () => {
            const handleCalibrationStateChange = fake<CalibrationStateChangeEvent>();
            groovtube.on('calibrationStateChange', handleCalibrationStateChange);
            eq(groovtube.isCalibrating, false);

            await groovtube.requestDevice();
            await groovtube.connect();
            eq(groovtube.isCalibrating, false);
            eq(handleCalibrationStateChange.callCount, 0);

            const handleBreath = fake<BreathEvent>();
            groovtube.on('breath', handleBreath);

            const calibratePromise = inspectPromise(groovtube.calibrate());
            eq(groovtube.isCalibrating, true);
            eq(handleCalibrationStateChange.callCount, 1);
            deq(handleCalibrationStateChange.firstCall.args, [true]);

            for (const value of calibrationValues) {
                eq(calibratePromise.state, 'pending');
                callBreathHandler(value);
            }

            await calibratePromise.promise;
            eq(groovtube.isCalibrating, false);
            eq(handleCalibrationStateChange.callCount, 2);
            deq(handleCalibrationStateChange.secondCall.args, [false]);

            // should not emit breath events during calibration
            eq(handleBreath.callCount, 0);

            groovtube.deadZone = 0;
            callBreathHandler('840'); // neutral value (post calibration)
            callBreathHandler('440'); // half sip
            callBreathHandler('c40'); // half puff

            eq(handleBreath.callCount, 3);
            eq(handleBreath.getCall(0).firstArg, 0);
            eq(handleBreath.getCall(1).firstArg, -0.5);
            eq(handleBreath.getCall(2).firstArg, 0.5);

            eq(handleCalibrationStateChange.callCount, 2);
        });

        it('Should resume incomplete calibration after a reconnect', async () => {
            const handleCalibrationStateChange = fake<CalibrationStateChangeEvent>();
            groovtube.on('calibrationStateChange', handleCalibrationStateChange);

            const handleBreath = fake<BreathEvent>();
            groovtube.on('breath', handleBreath);

            await groovtube.requestDevice();
            await groovtube.connect();
            const calibratePromise = inspectPromise(groovtube.calibrate());

            for (const value of calibrationValues.slice(0, 25)) {
                eq(calibratePromise.state, 'pending');
                callBreathHandler(value);
            }

            // simulate the device going away

            eq(groovtube.readyState, 'ready');
            serverMock.connected = false;
            await clock.tickAsync(TICK_DELAY);
            eq(groovtube.isCalibrating, true); // isCalibrating should be true even while disconnected
            eq(groovtube.readyState, 'connecting');
            await clock.tickAsync(CONNECT_DELAY - TICK_DELAY);
            eq(groovtube.readyState, 'ready');
            eq(groovtube.isCalibrating, true);

            for (const value of calibrationValues.slice(25, 50)) {
                eq(calibratePromise.state, 'pending');
                callBreathHandler(value);
            }

            await calibratePromise.promise;
            eq(groovtube.isCalibrating, false);

            groovtube.deadZone = 0;
            callBreathHandler('840'); // neutral value (post calibration)
            eq(handleBreath.callCount, 1);
            eq(handleBreath.getCall(0).firstArg, 0);

            eq(handleCalibrationStateChange.callCount, 2);
        });

        it('Should memorize the calibration between reconnects', async () => {
            const handleBreath = fake<BreathEvent>();
            groovtube.on('breath', handleBreath);

            await groovtube.requestDevice();
            await groovtube.connect();
            const calibratePromise = inspectPromise(groovtube.calibrate());
            for (const value of calibrationValues) {
                callBreathHandler(value);
            }

            await calibratePromise.promise;
            await groovtube.disconnect();
            await groovtube.connect();

            groovtube.deadZone = 0;
            callBreathHandler('840'); // neutral value (post calibration)
            eq(handleBreath.callCount, 1);
            eq(handleBreath.getCall(0).firstArg, 0);
        });

        it('Should reset the calibration if a new device has been obtained', async () => {
            const handleBreath = fake<BreathEvent>();
            groovtube.on('breath', handleBreath);

            await groovtube.requestDevice();
            await groovtube.connect();
            const calibratePromise = inspectPromise(groovtube.calibrate());
            for (const value of calibrationValues) {
                callBreathHandler(value);
            }

            await calibratePromise.promise;
            await groovtube.disconnect();
            await groovtube.requestDevice();
            await groovtube.connect();

            groovtube.deadZone = 0;
            callBreathHandler('800'); // neutral value (without calibration)
            eq(handleBreath.callCount, 1);
            eq(handleBreath.getCall(0).firstArg, 0);
        });

        it('Should reject if disconnect() is called during calibration', async () => {
            await groovtube.requestDevice();
            await groovtube.connect();
            const calibratePromise = inspectPromise(groovtube.calibrate());
            for (const value of calibrationValues.slice(0, 25)) {
                callBreathHandler(value);
            }

            await groovtube.disconnect();
            const error = await assertRejected(calibratePromise.promise, GroovTubeBleError);
            eq(error.message, 'Calibration aborted: disconnect() has been called');
        });
    });

    it('Should emit readyStateChange events whenever the readyState changes', async () => {
        const handleReadyStateChange = fake<ReadyStateChangeEvent>();
        groovtube.on('readyStateChange', handleReadyStateChange);

        eq(handleReadyStateChange.callCount, 0);
        eq(groovtube.canRequestDevice, true);
        eq(groovtube.canConnect, false);
        eq(groovtube.canDisconnect, false);

        await groovtube.requestDevice();
        eq(handleReadyStateChange.callCount, 2);
        eq(handleReadyStateChange.getCall(0).firstArg, 'requesting-device');
        eq(handleReadyStateChange.getCall(1).firstArg, 'have-device');
        eq(groovtube.canRequestDevice, true);
        eq(groovtube.canConnect, true);
        eq(groovtube.canDisconnect, false);

        await groovtube.connect();
        eq(handleReadyStateChange.callCount, 4);
        eq(handleReadyStateChange.getCall(2).firstArg, 'connecting');
        eq(handleReadyStateChange.getCall(3).firstArg, 'ready');
        eq(groovtube.canRequestDevice, false);
        eq(groovtube.canConnect, false);
        eq(groovtube.canDisconnect, true);

        await groovtube.disconnect();
        eq(handleReadyStateChange.callCount, 5);
        eq(handleReadyStateChange.getCall(4).firstArg, 'have-device');
        eq(groovtube.canRequestDevice, true);
        eq(groovtube.canConnect, true);
        eq(groovtube.canDisconnect, false);
    });
});
