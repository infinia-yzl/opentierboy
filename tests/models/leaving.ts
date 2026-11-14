import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {leavingMachine} from '../machines/leaving';
import {defineModel, offered, type When} from '../support/machines';

export type LeavingSnapshot = SnapshotFrom<typeof leavingMachine>;
export type LeavingEvent = EventFrom<typeof leavingMachine>;

/** What one state of the leaving machine shows. */
export type LeavingView =
  | {
    readonly page: 'editor';
    /** The version on screen and in the address: 1 is the list as opened, 2 has Mauga in row F. */
    readonly version: 1 | 2;
    /** True where the page is busy on purpose: the trip home waits for its held answer. */
    readonly busy: boolean;
    /** True after Back from Home: Home's history entry follows, for Forward. */
    readonly homeAhead: boolean;
  }
  | {readonly page: 'home'};

const editor = (version: 1 | 2, {busy = false, homeAhead = false} = {}): LeavingView => ({page: 'editor', version, busy, homeAhead});

/** Each state, by its path, and what it shows. */
const VIEWS: Readonly<Record<string, LeavingView>> = {
  'editing.opened': editor(1),
  'editing.changed': editor(2),
  'leaving.fromOpened': editor(1, {busy: true}),
  'leaving.fromChanged': editor(2, {busy: true}),
  'stayed.homeHeld': editor(2),
  'stayed.homeAnswered': editor(2),
  'home.fromOpened': {page: 'home'},
  'home.fromChanged': {page: 'home'},
  'back.opened': editor(1, {homeAhead: true}),
  'back.changed': editor(2, {homeAhead: true}),
};

/** The dotted path of a state, such as 'leaving.fromOpened'. */
function pathOf(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${pathOf(child)}`;
}

/** What the page shows in a state of the leaving machine. */
export function leavingViewOf(snapshot: LeavingSnapshot): LeavingView {
  const view = VIEWS[pathOf(snapshot.value)];
  if (!view) throw new RangeError(`No view for the leaving state ${pathOf(snapshot.value)}`);
  return view;
}

/** True where the page is busy on purpose (modelSut's `busyIn`). */
export const leavingBusy = (snapshot: LeavingSnapshot) => {
  const view = leavingViewOf(snapshot);
  return view.page === 'editor' && view.busy;
};

const constant = fc.constant({});
/** Home is on its way: a dropped image address adds nothing (a transition without a target, which `offered` does not see). */
const leavingForHome = ({snapshot}: When) => (snapshot as LeavingSnapshot).matches('leaving');

/** Every event is sent only where the machine takes it: the server answers only what it holds. */
export const leavingModel = defineModel({
  id: 'leaving',
  machine: leavingMachine,
  events: {
    CHANGE_LIST: {generate: constant, when: offered('CHANGE_LIST')},
    CLICK_HOME: {generate: constant, when: offered('CLICK_HOME')},
    DROP_IMAGE_LINK: {generate: constant, when: leavingForHome},
    HOME_ANSWERS: {generate: constant, when: offered('HOME_ANSWERS')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
  },
});
