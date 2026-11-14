import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {zenStepsMachine} from '../machines/zen-steps';
import {always, defineModel, offered} from '../support/machines';

/** The versions the Zen steps machine follows: the list as opened and 2 changes. */
export const MAX_ZEN_STEPS = 3;

export type ZenStepsSnapshot = SnapshotFrom<typeof zenStepsMachine>;
export type ZenStepsEvent = EventFrom<typeof zenStepsMachine>;

/** What one state shows: the version on screen (1 is the list as opened) and the versions in the history. */
export interface ZenStepsView {
  readonly step: number;
  readonly total: number;
}

/** What the page shows in a state of the Zen steps machine, such as 'step2of3'. */
export function zenStepsViewOf(snapshot: ZenStepsSnapshot): ZenStepsView {
  const match = /^step(\d)of(\d)$/.exec(String(snapshot.value));
  if (!match) throw new RangeError(`Not a step state: ${String(snapshot.value)}`);
  return {step: Number(match[1]), total: Number(match[2])};
}

const constant = fc.constant({});

/**
 * The Zen bar's Back and Forward are sent only where they are on; where they are off, each state
 * checks that they are. The browser's Back is never sent on the first version, where it would
 * leave the list. The browser offers Forward everywhere: on the latest version the page must stay
 * as it is, which after a change that came after Back checks that the later versions are gone.
 */
export const zenStepsModel = defineModel({
  id: 'zen-steps',
  machine: zenStepsMachine,
  events: {
    CHANGE_LIST: {generate: constant, when: offered('CHANGE_LIST')},
    ZEN_BACK: {generate: constant, when: offered('ZEN_BACK')},
    ZEN_FORWARD: {generate: constant, when: offered('ZEN_FORWARD')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
    BROWSER_FORWARD: {generate: constant, when: always},
  },
});
