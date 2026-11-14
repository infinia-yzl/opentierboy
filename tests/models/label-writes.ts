import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {labelWritesMachine} from '../machines/label-writes';
import {defineModel, offered} from '../support/machines';

export type LabelWritesSnapshot = SnapshotFrom<typeof labelWritesMachine>;
export type LabelWritesEvent = EventFrom<typeof labelWritesMachine>;
type LabelWritesState = 'opened' | 'changeWaits' | 'topWaits' | 'changeThenTopWait' | 'topThenChangeWait' | 'topSaved'
  | 'changeThenTopSaved' | 'topThenChangeSaved' | 'backToOpened' | 'backToTop';

/** What the address holds: the link the list opened with, or a link the editor wrote. */
export type LabelWritesAddress = 'opened' | {readonly version: 1 | 2; readonly top: boolean};

/** What one state of the label writes machine shows. */
export interface LabelWritesView {
  /** The version on screen: 1 is the list as opened, 2 has Mauga in row F. */
  readonly onScreen: 1 | 2;
  /** True when the labels sit on Top on screen. */
  readonly top: boolean;
  readonly address: LabelWritesAddress;
  /** The history entries the page added since it opened. */
  readonly newEntries: 0 | 1;
  /** True while a link waits for the server's held answer: the page is busy. */
  readonly waiting: boolean;
}

const VIEWS: Readonly<Record<LabelWritesState, LabelWritesView>> = {
  opened: {onScreen: 1, top: false, address: 'opened', newEntries: 0, waiting: false},
  changeWaits: {onScreen: 2, top: false, address: 'opened', newEntries: 0, waiting: true},
  topWaits: {onScreen: 1, top: true, address: 'opened', newEntries: 0, waiting: true},
  changeThenTopWait: {onScreen: 2, top: true, address: 'opened', newEntries: 0, waiting: true},
  topThenChangeWait: {onScreen: 2, top: true, address: 'opened', newEntries: 0, waiting: true},
  topSaved: {onScreen: 1, top: true, address: {version: 1, top: true}, newEntries: 0, waiting: false},
  changeThenTopSaved: {onScreen: 2, top: true, address: {version: 2, top: true}, newEntries: 1, waiting: false},
  topThenChangeSaved: {onScreen: 2, top: true, address: {version: 2, top: true}, newEntries: 1, waiting: false},
  backToOpened: {onScreen: 1, top: true, address: 'opened', newEntries: 1, waiting: false},
  backToTop: {onScreen: 1, top: true, address: {version: 1, top: true}, newEntries: 1, waiting: false},
};

/** What the page shows in a state of the label writes machine. */
export function labelWritesViewOf(snapshot: LabelWritesSnapshot): LabelWritesView {
  const view = VIEWS[snapshot.value as LabelWritesState];
  if (!view) throw new RangeError(`No view for the label writes state ${String(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});

/** Every event is sent only where the machine takes it. Back is never pressed while a link waits (link-writes.ts says why). */
export const labelWritesModel = defineModel({
  id: 'label-writes',
  machine: labelWritesMachine,
  events: {
    CHANGE_LIST: {generate: constant, when: offered('CHANGE_LIST')},
    CHOOSE_TOP: {generate: constant, when: offered('CHOOSE_TOP')},
    SERVER_ANSWERS: {generate: constant, when: offered('SERVER_ANSWERS')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
  },
});
