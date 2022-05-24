import { SinonSpy } from 'sinon';
import { Constructor } from '../src/types.js';

export const assertRejected = async <T>(promise: PromiseLike<any>, ErrorType: Constructor<T>): Promise<T> => {
    try {
        await promise;
    } catch (err) {
        if (err instanceof ErrorType) {
            return err;
        }
    }

    throw Error(`assertRejected() expected promise to reject with ${ErrorType.name}`);
};

export const stringToArrayBuffer = (input: string): ArrayBuffer => {
    const buffer = Buffer.from(input, 'utf-8');
    const arrayBuffer = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(arrayBuffer);
    view.set(buffer);
    return arrayBuffer;
};

export type FakeWrap<F extends (...args: any) => any> = SinonSpy<Parameters<F>, ReturnType<F>>;
