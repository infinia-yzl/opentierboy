import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {zenStepsMachine} from '../machines/zen-steps';
import {always, defineModel, offered} from '../support/machines';

export const MAX_ZEN_STEPS = 3;

export type ZenStepsSnapshot = SnapshotFrom<typeof zenStepsMachine>;
export type ZenStepsEvent = EventFrom<typeof zenStepsMachine>;

export interface ZenStepsView {
  readonly step: number;
  readonly total: number;
}

export function zenStepsViewOf(snapshot: ZenStepsSnapshot): ZenStepsView {
  const match = /^step(\d)of(\d)$/.exec(String(snapshot.value));
  if (!match) throw new RangeError(`Not a step state: ${String(snapshot.value)}`);
  return {step: Number(match[1]), total: Number(match[2])};
}

const constant = fc.constant({});

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
