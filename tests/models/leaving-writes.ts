import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {leavingWritesMachine} from '../machines/leaving-writes';
import {defineModel, offered} from '../support/machines';

export type LeavingWritesSnapshot = SnapshotFrom<typeof leavingWritesMachine>;
export type LeavingWritesEvent = EventFrom<typeof leavingWritesMachine>;

/** What one state of the leaving writes machine shows. */
export type LeavingWritesView =
  | {
    readonly page: 'editor';
    /** The version on screen: 1 is the list as opened, 2 has Mauga in row F. */
    readonly onScreen: 1 | 2;
    /** The version in the address. */
    readonly inAddress: 1 | 2;
    /** True when the dropped image address added Red to Unranked. */
    readonly dropped: boolean;
    /** True while a list write waits for the server's held answer. */
    readonly linkHeld: boolean;
    /** True where the page is busy on purpose: a link or the trip home waits. */
    readonly busy: boolean;
  }
  | {readonly page: 'home'};

const editor = (onScreen: 1 | 2, inAddress: 1 | 2, {dropped = false, linkHeld = false, busy = true} = {}): LeavingWritesView =>
  ({page: 'editor', onScreen, inAddress, dropped, linkHeld, busy});

/** Each state, by its path, and what it shows. */
const VIEWS: Readonly<Record<string, LeavingWritesView>> = {
  editing: editor(1, 1, {busy: false}),
  waiting: editor(2, 1, {linkHeld: true}),
  'leaving.nothingWaits': editor(1, 1),
  'leaving.linkSent': editor(2, 1, {linkHeld: true}),
  'leaving.linkDropped': editor(2, 1),
  'leaving.dropWaits': editor(1, 1, {dropped: true}),
  'cameBack.waiting': editor(2, 1, {linkHeld: true}),
  'cameBack.homeAnswered': editor(2, 1, {linkHeld: true}),
  'cameBack.saved': editor(2, 2, {busy: false}),
  'home.linkHeld': {page: 'home'},
  'home.nothingHeld': {page: 'home'},
};

/** The dotted path of a state, such as 'leaving.linkSent'. */
function pathOf(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${pathOf(child)}`;
}

/** What the page shows in a state of the leaving writes machine. */
export function leavingWritesViewOf(snapshot: LeavingWritesSnapshot): LeavingWritesView {
  const view = VIEWS[pathOf(snapshot.value)];
  if (!view) throw new RangeError(`No view for the leaving writes state ${pathOf(snapshot.value)}`);
  return view;
}

/** True where the page is busy on purpose (modelSut's `busyIn`). */
export const leavingWritesBusy = (snapshot: LeavingWritesSnapshot) => {
  const view = leavingWritesViewOf(snapshot);
  return view.page === 'editor' && view.busy;
};

const constant = fc.constant({});

/** Every event is sent only where the machine takes it: the server answers only what it holds. */
export const leavingWritesModel = defineModel({
  id: 'leaving-writes',
  machine: leavingWritesMachine,
  events: {
    CHANGE_LIST: {generate: constant, when: offered('CHANGE_LIST')},
    CLICK_HOME: {generate: constant, when: offered('CLICK_HOME')},
    DROP_IMAGE_LINK: {generate: constant, when: offered('DROP_IMAGE_LINK')},
    SERVER_ANSWERS: {generate: constant, when: offered('SERVER_ANSWERS')},
    HOME_ANSWERS: {generate: constant, when: offered('HOME_ANSWERS')},
  },
});
