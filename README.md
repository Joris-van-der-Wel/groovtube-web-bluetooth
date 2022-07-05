# GroovTube
Javascript library for interfacing with the GroovTube peripheral using the [Web Bluetooth API](https://webbluetoothcg.github.io/web-bluetooth/).

The GroovTube is a unique device which makes breathing and oral motor skills visible and analyzable in a fun way. It turns your breath into real-time image effects, for people with breathing, speech, or oral motor disabilities. For more details see: https://www.groovtube.nl/en


# Installation
To install the library, create a new Node.js project and install it as a dependency:

```sh
mkdir myproject
cd myproject
npm init
npm install --save groovtube
```

If you are using TypeScript you will also need the `@types/web-bluetooth` package as a dev dependency:

```
npm install --save-dev @types/web-bluetooth
```

Next, there are two options for loading the library. 

## UMD
A UMD (Universal Module Definition) bundle is provided which lets you load this library using a single javascript file. This file can be loaded directly into a HTML file, after which the library is exposed as the global variable `groovtube`:

```sh
mkdir example
cp node_modules/groovtube/umd.js example/groovtube.js
```

example/index.html:
```html
<!DOCTYPE html>
<html>
<head>
    <title>Example</title>
</head>
<body>
    ...

    <script src="groovtube.js"></script>
    <script>
        (() => {
            const {GroovTubeBle} = groovtube;
            const gt = new GroovTubeBle(navigator.bluetooth, console.log);
            // ...
        })();
    </script>
</body>
```


## Bundler
The second option is to use a module bundler such as [webpack](https://webpack.js.org/), [esbuild](https://esbuild.github.io/), [browserify](https://browserify.org/) and others.

Configuring such a bundler is out of scope for this readme. However, once setup properly you can simply import the library from your own javascript or typescript module:

```js
import GroovTubeBle from 'groovtube';

const gt = new GroovTubeBle(navigator.bluetooth, console.log);
// ...
```

An example using webpack can be found in the ["demo"](https://github.com/Joris-van-der-Wel/groovtube-web-bluetooth/tree/master/demo) directory.


# Basic usage
This library exposes a class named `GroovTubeBle`, instances of which maintain a connection to a single GroovTube device. Once connected, it will continuously poll for breath samples from the device.

Note: this guide assumes you are familiar with [promises](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises) and [async/await](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function).

## Constructor
The first step is to construct an instance of `GroovTubeBle`. The constructor must be provided with the value of `navigator.bluetooth`, that is provided by web browsers supporting the [Web Bluetooth API](https://webbluetoothcg.github.io/web-bluetooth/). Optionally, you can also provide a callback function which will receive log messages.

```js
const gt = new GroovTubeBle(navigator.bluetooth, console.log);
```

The instance will not perform any work, such as connecting to the device, until one of its methods is called.

## requestDevice()
The second step is to prompt the user to pick a device using the [`requestDevice()`](#api-GroovTubeBle-requestDevice) method:

```js
await gt.requestDevice();
```

This will pop up a browser dialog, presenting the user with a list of nearby bluetooth devices. After selecting a device, the promise returned by the method will resolve. Or, if the user cancels the dialog, the promise will reject. 

The list that is presented to the user will be filtered by this library. This means that unrelated bluetooth devices will not be visible. Although, do note that other bluetooth devices may be presented to the user, if they are using the same off-the-shelf hardware module as the GroovTube.

This function __must__ be called as a direct result of a (trusted) user input event (for example a button "click"). This is a browser limitation imposed to prevent sites from spamming the user with popups (similar to how popup blockers work).

This will work:
```js
someButton.addEventListener('click', () => {
    gt.requestDevice().catch(/* ... */);
});
```

However, this will have no effect:
```js
someButton.addEventListener('click', () => {
    setTimeout(() => {
        gt.requestDevice().catch(/* ... */);
    }, 0);
});
```

## connect() and disconnect()
The third step is to actually connect to the device using the [`connect()`](#api-GroovTubeBle-connect) method, at which point sensor values will be read continuously from the device.

```js
await gt.connect();
```

If the device is turned off or goes out of range, this library will attempt to reconnect automatically.

When the [`disconnect()`](#api-GroovTubeBle-disconnect) method is called, any active connection is dropped and the library will no longer attempt to reconnect:

```js
await gt.disconnect();
```

## Breath events
While a connection is active, the instance will emit "breath" events. The event handler is passed a single argument, which represents the strength of the sip or puff. Sips are represented by a negative fraction, puffs by a positive fraction. Some examples:

| Value |                       |
|------:|-----------------------|
|  -1.0 | Sip at full strength  |
|  -0.5 | Sip at half strength  |
|   0.0 | Neutral               |
|   0.5 | Puff at half strength |
|   1.0 | Puff at full strength |


You can listen for breath events by registering an event handler callback using [`on("breath", (number) => void)`](#api-GroovTubeBle-on-breath):

```js
gt.on('breath', (breath) => {
    console.log(`Breath is now ${Math.round(breath * 100)}%`);
});
```

## Calibration and dead zone
Sensors are not perfect. The sensor may suffer from noise. And it is likely that the neutral value reported by the device is offset from the intended value. This library offers two strategies for dealing with these issues.

Firstly, to help deal with noise, the library imposes a dead zone on the sensor value. Basically this means that slight variations around the neutral value are considered to be exactly neutral. When constructing an instance of `GroovTubeBle`, a default value for the dead zone is set that should usually be good enough. The dead zone can be get/set using the [`deadZone`](#api-GroovTubeBle-deadZone) property:

```js
gt.deadZone = 0.025;
```

Secondly, to help deal with an offset neutral, the [`calibrate()`](#api-GroovTubeBle-calibrate) method should be used. When called it causes the library to gather sensor values for some time. During this time the end-user should make sure the device is at rest. The average of the gathered sensor values are then used to offset all future breath values.

```
await gt.calibrate();
```

## Putting it all together
A minimal example:

```js
import GroovTubeBle from 'groovtube';

const gt = new GroovTubeBle(navigator.bluetooth, console.log);

gt.on('breath', (breath) => {
    console.log(`Breath is now ${Math.round(breath * 100)}%`);
});

connectButton.addEventListener('click', async () => {
    try {
        await gt.requestDevice();
        await gt.connect();
        await gt.calibrate();
    } catch (err) {
        console.error(err);
    }
});

```

Also check out the ["demo"](https://github.com/Joris-van-der-Wel/groovtube-web-bluetooth/tree/master/demo) directory.

# API Reference

## Top-Level Exports
* default: [GroovTubeBle](#api-GroovTubeBle)
* [GroovTubeBleError](#api-GroovTubeBleError)
* [isGroovTubeBleError(any): boolean](#api-isGroovTubeBleError)

Example:
```js
import GroovTubeBle, {GroovTubeBleError, isGroovTubeBleError} from 'groovtube';
```

## <a id="api-GroovTubeBle"></a>GroovTubeBle

Constructor:
* [`constructor(Bluetooth, (object) => void)`](#api-GroovTubeBle-constructor)

Properties:
* [`deadZone: number`](#api-GroovTubeBle-deadZone)
* [`readyState: string`](#api-GroovTubeBle-readyState)
* [`canRequestDevice: boolean`](#api-GroovTubeBle-canRequestDevice)
* [`canConnect: boolean`](#api-GroovTubeBle-canConnect)
* [`canDisconnect: boolean`](#api-GroovTubeBle-canDisconnect)
* [`breathValue: number | null`](#api-GroovTubeBle-breathValue)

Methods:
* [`on("readyStateChange", (string) => void)`](#api-GroovTubeBle-on-readyStateChange)
* [`on("breath", (number) => void)`](#api-GroovTubeBle-on-breath)
* [`on("error", (GroovTubeBleError) => void)`](#api-GroovTubeBle-on-error)
* [`removeListener(string, ?Function)`](#api-GroovTubeBle-removeListener)
* [`requestDevice(): Promise<void>`](#api-GroovTubeBle-requestDevice)
* [`connect(): Promise<void>`](#api-GroovTubeBle-connect)
* [`disconnect(): Promise<void>`](#api-GroovTubeBle-disconnect)
* [`calibrate(): Promise<void>`](#api-GroovTubeBle-calibrate)

### <a id="api-GroovTubeBle-constructor"></a>`constructor(Bluetooth, (object) => void)`
Parameters:
* `bluetooth: Bluetooth` - Must be set to `navigator.bluetooth`.
* `logger?: (object) => void` - May be set to a function which will receive log messages. Each message is an object containing further details.

### <a id="api-GroovTubeBle-deadZone"></a>`deadZone: number`
A value between 0 and 1. If the sip or puff strength is lower than this value, the strength is assumed to be 0. A deadZone of 0 has no effect. A deadZone of 0.5 means that any sip or puff below 50% strength is assumed to be 0%.

```js
console.log('The dead zone is', gt.deadZone);
gt.deadZone = 0.025;
```

### <a id="api-GroovTubeBle-readyState"></a>`readyState: string`
Returns the current state of device discovery and connectivity. It will be set to one of the following values:

| Value                 |                                                                                                                                                                         |
|-----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `"no-device"`         | This is the initial state. `requestDevice()` has not been called yet, or was not successful.                                                                            |
| `"requesting-device"` | `requestDevice()` has just been called and we are waiting for the user to select a device.                                                                              |
| `"have-device"`       | The user has picked a device, `requestDevice()` has just been resolved successfully.                                                                                    |
| `"connecting"`        | Attempting to connect to the device that has been picked by the user. Either `connect()` has just been called, or the library is attempting to automatically reconnect. |
| `"ready"`             | The connection has been established. Breath values will be polled for continuously while in the "ready" state.                                                          |

`GroovTubeBle` instances will also emit an event whenever the ready state changes. See: [`on("readyStateChange", (string) => void)`](#api-GroovTubeBle-on-readyStateChange).

```js
console.log('The ready state is', gt.readyState);
```

### <a id="api-GroovTubeBle-canRequestDevice"></a>`canRequestDevice: boolean`
Returns whether the instance is in a valid state for [`requestDevice()`](#api-GroovTubeBle-requestDevice) to be called. This is a convenience for checking if the [`readyState`](#api-GroovTubeBle-readyState) is `"no-device"` or `"have-device"`.

### <a id="api-GroovTubeBle-canConnect"></a>`canConnect: boolean`
Returns whether the instance is in a valid state for [`connect()`](#api-GroovTubeBle-connect) to be called. This is a convenience for checking if the [`readyState`](#api-GroovTubeBle-readyState) is `"have-device"`.

### <a id="api-GroovTubeBle-canDisconnect"></a>`canDisconnect: boolean`
Returns whether the instance is in a valid state for [`disconnect()`](#api-GroovTubeBle-disconnect) to be called. This is a convenience for checking if the [`readyState`](#api-GroovTubeBle-readyState) is `"connecting"` or `"ready"`.

### <a id="api-GroovTubeBle-breathValue"></a>`breathValue: number | null`
Returns the last read breath sensor value. This value is between -1 and 1, it represents the strength of the sip or puff. Sips are represented by a negative fraction, puffs by a positive fraction. If no value has been read, if there is no active connection the value will be `null`.

Some examples:

| Value |                       |
|------:|-----------------------|
|  -1.0 | Sip at full strength  |
|  -0.5 | Sip at half strength  |
|   0.0 | Neutral               |
|   0.5 | Puff at half strength |
|   1.0 | Puff at full strength |

```js
console.log(`The breath value is ${Math.round(gt.breathValue * 100)}%`);
```

### <a id="api-GroovTubeBle-on-readyStateChange"></a>`on("readyStateChange", (string) => void)`
Parameters:
* `eventName: "readyStateChange"`
* `listener: (readyState: string) => void`

Registers a function to be called whenever the `readyState` on this instance changes. The new value for [`readyState`](#api-GroovTubeBle-readyState) will be passed as the first argument.

```js
gt.on('readyStateChange', readyState => {
    console.log('The ready state has changed to', readyState);
});
```

### <a id="api-GroovTubeBle-on-breath"></a>`on("breath", (number) => void)`
Parameters:
* `eventName: "breath"`
* `listener: (breathValue: number) => void`

Registers a function to be called whenever the `breathValue` on this instance changes. The new value for [`breathValue`](#api-GroovTubeBle-breathValue) will be passed as the first argument.

```js
gt.on('breath', breathValue => {
    console.log(`The breath value is now ${Math.round(breathValue * 100)}%`);
});
```

### <a id="api-GroovTubeBle-on-error"></a>`on("error", (GroovTubeBleError) => void)`
Parameters:
* `eventName: "error"`
* `listener: (error: GroovTubeBleError) => void`


Registers a function to be called whenever an error occurs that can not be reported in another way. For example if a reconnection attempt fails.

```js
gt.on('error', error => {
    console.error('An error occurred', error);
});
```

### <a id="api-GroovTubeBle-removeListener"></a>`removeListener(string, ?Function)`
Parameters:
* `eventName: string`
* `listener?: Function`

Removes the registration of a function that has been previously registered using the `on()` method. If the `listener` 
parameter is not given, all registrations for that event name are removed.

```js
function handleError(error) {
    console.error('An error occurred', error);
}

gt.on('error', handleError);
// ...
gt.removeListener('error', handleError);
```

### <a id="api-GroovTubeBle-requestDevice"></a>`requestDevice(): Promise<void>`
Ask the user to select the GroovTube BLE peripheral. This will pop up a browser dialog, presenting the user with a list of nearby bluetooth devices. After selecting a device, the promise returned by the method will resolve. Or, if the user cancels the dialog, the promise will reject.

The list that is presented to the user will be filtered by this library. This means that unrelated bluetooth devices will not be visible. Although, do note that other bluetooth devices may be presented to the user, if they are using the same off-the-shelf hardware module.

This function __must__ be called as a direct result of a (trusted) user input event (for example a button "click"). This is a browser limitation imposed to prevent sites from spamming the user with popups (similar to how popup blockers work).

```js
await gt.requestDevice();
```

### <a id="api-GroovTubeBle-connect"></a>`connect(): Promise<void>`
Attempt to connect to the peripheral and start reading from the breath sensor.

If the connection is dropped, this instance will attempt to reconnect after a short delay, until `disconnect()` is
called. This method will resolve as soon as the first successful connection has been made. The `requestDevice()`
method must have been successfully called first.

```js
await gt.connect();
```

### <a id="api-GroovTubeBle-disconnect"></a>`disconnect(): Promise<void>`
Drop any active connection to the peripheral and no longer attempt to reconnect.

```js
await gt.disconnect();
```

### <a id="api-GroovTubeBle-calibrate"></a>`calibrate(): Promise<void>`
Collect a number of samples from the device to determine the neutral value of the breath sensor.

The user should not be sipping or puffing during the calibration. It is recommended to perform calibration at
least once. This method will resolve when enough samples have been collected. No "breath" events will be emitted
while this method is busy.

```js
await gt.calibrate();
```

## <a id="api-GroovTubeBleError"></a>GroovTubeBleError
Extends `Error`

Properties:
* `name: "GroovTubeBleError"`
* `message: string`
* `cause: unknown`

All error values which originate from this library will be an instance of `GroovTubeBleError`. 

The `cause` property might contain further details, this is usually an instance of `Error`. For example, if the error originated from the bluetooth api of the browser, the `cause` will be set to that error value.

## <a id="api-isGroovTubeBleError"></a>isGroovTubeBleError(any): boolean
Tests if the given value looks like an instance of `GroovTubeBleError`. In most cases it is not necessary to use this function, instead you can simply use `value instanceof GroovTubeBleError`. However, it may be useful if you are dealing with multiple javascript realms.
