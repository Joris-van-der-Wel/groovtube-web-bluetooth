import { createExplicitPromise } from './promise.js';

export class AbortError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'GroovTubeAbortError';
    }
}

export type Abortable = <T>(wrapped: Promise<T>) => Promise<T>;
export type AbortableCallback<R> = (abortable: Abortable) => Promise<R>;

const withAbortable = async <R>(opts: { timeout?: number, signal?: AbortSignal }, callback: AbortableCallback<R>): Promise<R> => {
    const { timeout, signal } = opts;
    const { promise, reject } = createExplicitPromise<never, AbortError>();

    // todo: could pass an AbortSignal here. However this is not supported by the browser apis's that we are using
    //       so there is no need for now.
    const abortable: Abortable = (wrapped) => Promise.race([promise, wrapped]);

    const handleAbort = () => reject(new AbortError('Operation aborted'));

    const timer = typeof timeout === 'number'
        ? setTimeout(() => reject(new AbortError(`Operation aborted after timeout of ${timeout}ms`)), timeout)
        : undefined;

    signal?.addEventListener('abort', handleAbort);
    if (signal?.aborted) {
        handleAbort();
    }

    try {
        return await Promise.race([promise, callback(abortable)]);
    } finally {
        signal?.removeEventListener('abort', handleAbort);
        clearTimeout(timer);
    }
};

export default withAbortable;
