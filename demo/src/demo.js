import GroovTubeBle from 'groovtube';

/* eslint-disable no-console */

const requestDeviceButton = document.getElementById('request-device-button');
const connectButton = document.getElementById('connect-button');
const disconnectButton = document.getElementById('disconnect-button');
const calibrateButton = document.getElementById('calibrate-button');
const statusNode = document.getElementById('status');
const breathValueNode = document.getElementById('breath-value');
const hammerBarNode = document.getElementById('hammer-bar');

const gt = new GroovTubeBle(navigator.bluetooth, console.log);
// set it as a global so that the user can experiment using the DevTools
window.groovtubeInstance = gt;

let hammerValue = 0;

const handleReadyStateChange = () => {
    statusNode.textContent = gt.readyState;
    requestDeviceButton.disabled = !gt.canRequestDevice;
    connectButton.disabled = !(gt.canRequestDevice || gt.canConnect);
    disconnectButton.disabled = !gt.canDisconnect;
    calibrateButton.disabled = gt.readyState !== 'ready';
};

gt.on('readyStateChange', handleReadyStateChange);
handleReadyStateChange();

gt.on('breath', (breath) => {
    breathValueNode.textContent = `${Math.round(breath * 100)}%`;
    hammerValue -= 0.01;
    hammerValue += 0.06 * breath;
    hammerValue = Math.min(1, Math.max(0, hammerValue));
});

const updateBar = () => {
    hammerBarNode.style.height = `${Math.round(hammerValue * 100)}%`;
    requestAnimationFrame(updateBar);
};
updateBar();

requestDeviceButton.addEventListener('click', async () => {
    try {
        await gt.requestDevice();
    } catch (err) {
        console.error(err);
    }
});

connectButton.addEventListener('click', async () => {
    try {
        if (gt.readyState === 'no-device') {
            await gt.requestDevice();
        }
        await gt.connect();
    } catch (err) {
        console.error(err);
    }
});

disconnectButton.addEventListener('click', async () => {
    try {
        await gt.disconnect();
    } catch (err) {
        console.error(err);
    }
});

calibrateButton.addEventListener('click', async () => {
    try {
        await gt.calibrate();
    } catch (err) {
        console.error(err);
    }
});
