export type TickerCallback = (this: void, now: number) => Promise<void>;

/**
 * A utility which repeatedly executes a callback, using a configurable delay (tickDelay).
 * The next execution is scheduled as soon as the previous has completed, either synchronous or asynchronous (callback
 * returns a Promise).
 * In other words, the effective execution interval is the configured delay plus the execution time of the callback.
 *
 * This utility makes it easy to poll for values from a source, while avoiding to flood that source with unacknowledged
 * requests. For example:
 *
 * const ticker = new Ticker(async () => {
 *     const weather = await httpRequest('https://localhost/weather');
 *     if (weather === 'tornado') {
 *         console.log('Tornado warning!');
 *     }
 * }, 10000);
 */
export class Ticker {
    private readonly callback: TickerCallback;

    /**
     * How long to wait after the previous execution, to start the next one.
     */
    public readonly tickDelay: number;

    /**
     * This value guards against incorrect usage of start() and stop()
     */
    private _started: boolean = false;

    /**
     * This value guards against _schedule running too often
     */
    private _scheduleToken: symbol = Symbol('scheduleToken');

    /**
     * The return value of setTimeout or null. This is used so that a pending tick can be cancelled by stop()
     */
    private _timerHandle: any = null;

    /**
     * The promise of the callback that is currently being executed. This is used by stop() so that the caller can be
     * sure that the callback is no longer being executed.
     */
    private _pendingTick: Promise<void> | null = null;

    /**
     *
     * @param callback The callback to execute periodically
     * @param tickDelay The delay in milliseconds between executions of the callback
     */
    public constructor(callback: TickerCallback, tickDelay: number) {
        // make sure it always returns a promise and that `this` is undefined
        this.callback = async (...args) => {
            try {
                // Resolve value is ignored. the promise returned by this.callback() might be kept for a long time so it
                // should not use up much memory
                await callback(...args);
            } catch (err) {
                // Rejection is ignored on purpose. The catch block makes sure we do not trip any uncaught rejection
                // handlers
            }
        };
        this.tickDelay = tickDelay;
    }

    /**
     * If true, start() has been called and the tick are currently being executed periodically
     */
    public get started(): boolean {
        return this._started;
    }

    /**
     * Start executing the callback periodically. The first execution is performed immediately, this helps to catch errors early.
     */
    public start(): void {
        if (this.started) {
            throw Error('Ticker has already been started');
        }

        this._started = true;
        this._schedule(); // promise ignored
    }

    /**
     * Cancel the periodic execution of the callback, and wait for the current execution to complete.
     */
    public async stop(): Promise<void> {
        // make sure _schedule will not schedule itself again
        this._scheduleToken = Symbol('scheduleToken');
        clearTimeout(this._timerHandle);
        this._timerHandle = null;

        // wait for the last tick to settle
        await this._pendingTick;
        this._pendingTick = null;

        // Is now allowed to be started again
        this._started = false;
    }

    private _schedule = (): void => {
        const scheduleToken = Symbol('scheduleToken');
        this._scheduleToken = scheduleToken;

        const promise = this.callback(Date.now());

        this._pendingTick = promise.then(() => {
            if (scheduleToken === this._scheduleToken) {
                this._timerHandle = setTimeout(this._schedule, this.tickDelay);
            }
            // else: _schedule() has been executed concurrently, or stop() has been called
        });
    };
}
