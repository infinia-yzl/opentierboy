import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {inkHistoryMachine} from '../machines/ink-history';
import {defineModel, offered} from '../support/machines';

export type InkHistorySnapshot = SnapshotFrom<typeof inkHistoryMachine>;
export type InkHistoryEvent = EventFrom<typeof inkHistoryMachine>;

export interface InkHistoryView {
  readonly notes: number;
  readonly step: number;
  readonly total: number;
  readonly listChanged: boolean;
  readonly inkInAddress: boolean;
}

const view = (notes: number, step: number, total: number, listChanged = false): InkHistoryView =>
  ({notes, step, total, listChanged, inkInAddress: notes > 0});

export const INK_HISTORY_VIEWS = {
  opened: view(0, 1, 1),
  noteNotWritten: {...view(1, 1, 1), inkInAddress: false},
  runOfOneNote: view(1, 2, 2),
  runOfTwoNotes: view(2, 2, 2),
  runWithoutNotes: view(0, 2, 2),
  backFromRun: view(0, 1, 2),
  forwardOnRun: view(2, 2, 2),
  runAfterForward: view(3, 3, 3),
  listChanged: view(2, 3, 3, true),
  runAfterListChange: view(3, 4, 4, true),
  backFromListChange: view(2, 2, 3),
  reloaded: view(1, 2, 2),
  runAfterReload: view(2, 3, 3),
} as const satisfies Record<string, InkHistoryView>;

export function inkHistoryViewOf(snapshot: InkHistorySnapshot): InkHistoryView {
  return INK_HISTORY_VIEWS[snapshot.value as keyof typeof INK_HISTORY_VIEWS];
}

const constant = fc.constant({});

export const inkHistoryModel = defineModel({
  id: 'ink-history',
  machine: inkHistoryMachine,
  events: {
    DRAW_NOTE: {generate: constant, when: offered('DRAW_NOTE')},
    DRAW_NOTE_REFUSED: {generate: constant, when: offered('DRAW_NOTE_REFUSED')},
    REMOVE_LAST_NOTE: {generate: constant, when: offered('REMOVE_LAST_NOTE')},
    CLEAR: {generate: constant, when: offered('CLEAR')},
    CHANGE_LIST: {generate: constant, when: offered('CHANGE_LIST')},
    BACK: {generate: constant, when: offered('BACK')},
    FORWARD: {generate: constant, when: offered('FORWARD')},
    RELOAD: {generate: constant, when: offered('RELOAD')},
  },
});
