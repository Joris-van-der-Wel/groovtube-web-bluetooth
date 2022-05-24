/**
 * How often (milliseconds) to poll for new breath values / check for the connection status.
 */
export const TICK_DELAY = 10;

/**
 * How often (milliseconds) to attempt to reconnect.
 */
export const CONNECT_DELAY = 1000;

/**
 * How long (milliseconds) it may take to retrieve services and characteristics after connecting.
 */
export const INIT_DEADLINE = 10000;

/**
 * How long (milliseconds) a disconnection attempt may take.
 */
export const DISCONNECT_DEADLINE = 10000;

/**
 * How long (milliseconds) a characteristic write operation may take.
 */
export const WRITE_VALUE_DEADLINE = 1000;

/**
 * The UUID of the Bluetooth BLE remote GATT Service that the Melody Smart data characteristic can be found on.
 */
export const MELODY_SMART_SERVICE = 'bc2f4cc6-aaef-4351-9034-d66268e328f0';

/**
 * The UUID of the Bluetooth BLE remote GATT characteristic to send data commands to.
 */
export const MELODY_SMART_DATA_CHARACTERISTIC = '06d1e5e7-79ad-4a71-8faa-373789f7d93c';
// export const MELODY_SMART_COMMAND_CHARACTERISTIC = "818ae306-9c5b-448d-b51a-7add6a5d314d";

/**
 * GroovTube specific data commands
 */
export const DATA_COMMANDS = Object.freeze({
    /**
     * Whenever this command is sent, the device will respond with the breath value
     */
    REQUEST_BREATH: new Uint8Array([0x3F, 0x62]).buffer, // ?b
    // LED_LEFT_ON:    new Uint8Array([0x6C, 0x31]).buffer, // l1
    // LED_LEFT_OFF:   new Uint8Array([0x6C, 0x30]).buffer, // l0
    // LED_RIGHT_ON:   new Uint8Array([0x72, 0x31]).buffer, // r1
    // LED_RIGHT_OFF:  new Uint8Array([0x72, 0x30]).buffer, // r0
});

/**
 * The range of the breath value received from the device.
 * - around BREATH_RANGE is neutral
 * - towards 0 represents strength of sipping
 * - towards BREATH_RANGE*2 represents strength of puffing
 */
export const BREATH_RANGE = 2048;

/**
 * How many samples to gather during calibration
 */
export const CALIBRATE_SAMPLES = 50;

/**
 * The default value for groovTubeBleInstance.deadZone
 */
export const DEFAULT_DEADZONE = 0.025;
