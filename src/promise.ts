export interface ExplicitPromise<T = void, E = Error> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: E) => void;
}

export const createExplicitPromise = <T = void, E = Error> (): ExplicitPromise<T, E> => {
    let resolve;
    let reject;
    const promise = new Promise<T>((_resolve, _reject): void => {
        resolve = _resolve;
        reject = _reject;
    });
    return {
        promise,
        resolve: resolve as any,
        reject: reject as any,
    };
};

export type InspectedPromise<T, E = any> =
    { promise: Promise<T>; state: 'pending'; } |
    { promise: Promise<T>; state: 'fulfilled'; value: T; } |
    { promise: Promise<T>; state: 'rejected'; reason: E; };

export const inspectPromise = <T = void> (promise: Promise<T>): InspectedPromise<T, any> => {
    const inspect: any = {
        promise,
        state: 'pending',
    };

    promise.then((value) => {
        inspect.state = 'fulfilled';
        inspect.value = value;
    }, (reason) => {
        inspect.state = 'rejected';
        inspect.reason = reason;
    });

    return inspect;
};
