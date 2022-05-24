import mocha from 'mocha-sugar-free';
import { assert } from 'chai';

import { GroovTubeBleError, isGroovTubeBleError } from '../src/index.js';

const { describe, it } = mocha;
const { strictEqual: eq } = assert;

describe('GroovTubeBleError', () => {
    it('Should construct properly', async () => {
        const wrapped = Error('wrapped!');
        const error = new GroovTubeBleError('Error from a test', wrapped);
        eq(error.name, 'GroovTubeBleError');
        eq(error.cause, wrapped);
        eq(error.message, 'Error from a test: wrapped!');
    });

    describe('isGroovTubeBleError', () => {
        it('Should match GroovTubeBleError instances', () => {
            const error = new GroovTubeBleError('Error from a test');
            eq(isGroovTubeBleError(error), true);
            eq(isGroovTubeBleError(new Error('Error from a test')), false);
        });
    });
});
