import mocha from 'mocha-sugar-free';
import { assert } from 'chai';
import { fake, SinonFakeTimers, useFakeTimers } from 'sinon';

import { createExplicitPromise } from '../src/promise.js';
import { Ticker } from '../src/Ticker.js';

const {
    describe, it, beforeEach, afterEach,
} = mocha;
const { strictEqual: eq } = assert;

const TICK_DELAY = 1000;

describe('Ticker', () => {
    let clock: SinonFakeTimers;

    beforeEach(() => {
        clock = useFakeTimers(1652364000000);
    });

    afterEach(() => {
        clock.restore();
    });

    it('Should periodically execute the callback until stopped', async () => {
        const callback = fake.resolves(undefined);
        const ticker = new Ticker(callback, 1000);
        eq(ticker.started, false);

        await ticker.start();
        eq(callback.callCount, 1);
        eq(callback.getCall(0).firstArg, 1652364000000);
        eq(ticker.started, true);

        await clock.tickAsync(TICK_DELAY);
        eq(callback.callCount, 2);
        eq(callback.getCall(1).firstArg, 1652364001000);
        eq(ticker.started, true);

        await clock.tickAsync(TICK_DELAY);
        eq(callback.callCount, 3);
        eq(callback.getCall(2).firstArg, 1652364002000);
        eq(ticker.started, true);

        await ticker.stop();
        eq(ticker.started, false);

        await clock.tickAsync(TICK_DELAY * 10);
        eq(callback.callCount, 3); // still 3
    });

    describe('start()', () => {
        it('Should start only once', async () => {
            const callback = fake.resolves(undefined);
            const ticker = new Ticker(callback, TICK_DELAY);
            ticker.start();
            assert.throws(() => ticker.start(), Error, 'Ticker has already been started');

            eq(callback.callCount, 1);
        });

        it('Should continue ticking if the first callback rejects', async () => {
            const expectedError = new Error('Error from a test!');
            const callback = fake.rejects(expectedError);

            const ticker = new Ticker(callback, TICK_DELAY);
            ticker.start();

            // Should still have started
            eq(ticker.started, true);

            await clock.tickAsync(TICK_DELAY);
            eq(callback.callCount, 2);
        });
    });

    describe('stop()', () => {
        it('Should wait for the pending tick to settle', async () => {
            const p = createExplicitPromise();
            const callback = fake.returns(p.promise);

            const ticker = new Ticker(callback, TICK_DELAY);
            let stopResolved = false;
            ticker.start();
            const stopPromise = ticker.stop().then(() => { stopResolved = true; });

            // stop has not completed yet
            eq(ticker.started, true);
            eq(stopResolved, false);

            await clock.tickAsync(TICK_DELAY * 10);

            eq(ticker.started, true);
            eq(stopResolved, false);

            p.resolve();

            await stopPromise;
            eq(ticker.started, false);
        });
    });
});
