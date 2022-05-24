/**
 * Check if a value looks like an GroovTubeBleError.
 * In most cases you could simply use `value instanceof GroovTubeBleError`, however this function
 * could be useful if you are dealing with multiple realms (e.g. iframes) or NPM dependency conflicts.
 */
export const isGroovTubeBleError = (value: any): value is GroovTubeBleError => Boolean(
    value
        && typeof value === 'object'
        && typeof value.message === 'string'
        && value.name === 'GroovTubeBleError',
);

export class GroovTubeBleError extends Error {
    public readonly cause?: unknown;

    public constructor(message: string, cause?: unknown) {
        const causeMessage = cause && typeof (cause as any).message === 'string' ? (cause as any).message : null;

        super(`${message}${causeMessage ? `: ${causeMessage}` : ''}`);
        this.name = 'GroovTubeBleError';
        this.cause = cause;
    }
}
