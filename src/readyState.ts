import { ReadyState } from './types.js';

/*
┌───────────┐  requestDevice() ┌───────────────────┐ requestDevice() ┌─────────────┐
│           ├─────────────────►│                   │◄────────────────│             │
│ no-device │                  │ requesting-device │                 │ have-device │
│           │◄─────────────────┤                   ├────────────────►│             │
└───────────┘     failed       └───────────────────┘     success     └──▲──────┬───┘
                                                                        │      │
                                                            disconnect()│      │connect()
                                                 ┌──────────────────────┤      │
                                                 │                      │      │
                                             ┌───┴───┐   connected   ┌──┴──────▼──┐
                                             │       │◄──────────────┤            │
                                             │ ready │               │ connecting │
                                             │       ├──────────────►│            │
                                             └───────┘     lost      └────────────┘
                                                        connection
*/

export const isReadyStateTransitionOk = (oldReadyState: ReadyState, newReadyState: ReadyState): boolean => {
    const o = oldReadyState;
    const n = newReadyState;
    /* eslint-disable no-multi-spaces, space-in-parens */
    return (
        (   o === 'no-device'         && n === 'requesting-device')
        || (o === 'requesting-device' && n === 'no-device'        )
        || (o === 'requesting-device' && n === 'have-device'      )
        || (o === 'have-device'       && n === 'connecting'       )
        || (o === 'have-device'       && n === 'requesting-device')
        || (o === 'connecting'        && n === 'have-device'      )
        || (o === 'connecting'        && n === 'ready'            )
        || (o === 'ready'             && n === 'connecting'       )
        || (o === 'ready'             && n === 'have-device'      )
    );
};
