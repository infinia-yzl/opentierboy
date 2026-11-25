import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {scribbleMachine} from '../machines/scribble';
import {defineModel, offered} from '../support/machines';

export type ScribbleSnapshot = SnapshotFrom<typeof scribbleMachine>;
export type ScribbleEvent = EventFrom<typeof scribbleMachine>;
export type ScribblePen = 'zenOff' | 'penOff' | 'penOn';

const NOTE_COUNTS = {blank: 0, oneNote: 1, twoNotes: 2} as const;
type Value = Partial<Record<keyof typeof NOTE_COUNTS, ScribblePen>>;

export function notesIn(snapshot: ScribbleSnapshot): number {
  const [ink] = Object.keys(snapshot.value as Value) as (keyof typeof NOTE_COUNTS)[];
  return NOTE_COUNTS[ink];
}

export function penOf(snapshot: ScribbleSnapshot): ScribblePen {
  const [pen] = Object.values(snapshot.value as Value);
  return pen;
}

const constant = fc.constant({});

export const scribbleModel = defineModel({
  id: 'scribble',
  machine: scribbleMachine,
  events: {
    TOGGLE_ZEN: {generate: constant, when: offered('TOGGLE_ZEN')},
    EXIT_ZEN: {generate: constant, when: offered('EXIT_ZEN')},
    PRESS_ESCAPE: {generate: constant, when: offered('PRESS_ESCAPE')},
    PRESS_SCRIBBLE: {generate: constant, when: offered('PRESS_SCRIBBLE')},
    PRESS_D: {generate: constant, when: offered('PRESS_D')},
    DRAW_NOTE: {generate: constant, when: offered('DRAW_NOTE')},
    REMOVE_LAST_NOTE: {generate: constant, when: offered('REMOVE_LAST_NOTE')},
    CLEAR: {generate: constant, when: offered('CLEAR')},
  },
});
