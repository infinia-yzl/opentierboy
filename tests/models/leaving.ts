import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {leavingMachine} from '../machines/leaving';
import {defineModel, offered} from '../support/machines';

export type LeavingSnapshot = SnapshotFrom<typeof leavingMachine>;
export type LeavingEvent = EventFrom<typeof leavingMachine>;

export type LeavingView =
  | {
    readonly page: 'editor';
    readonly version: 1 | 2;
    readonly imageAdded: boolean;
    readonly homeAhead: boolean;
  }
  | {readonly page: 'home'};

const editor = (version: 1 | 2, {imageAdded = false, homeAhead = false} = {}): LeavingView => ({page: 'editor', version, imageAdded, homeAhead});

const VIEWS: Readonly<Record<string, LeavingView>> = {
  'editing.opened': editor(1),
  'editing.changed': editor(2),
  'leaving.fromOpened': editor(1),
  'leaving.fromChanged': editor(2),
  'stayed.list.changed': editor(2),
  'stayed.list.imageAdded': editor(1, {imageAdded: true}),
  'stayed.list.changedAndImageAdded': editor(2, {imageAdded: true}),
  'home.fromOpened': {page: 'home'},
  'home.fromChanged': {page: 'home'},
  'back.opened': editor(1, {homeAhead: true}),
  'back.changed': editor(2, {homeAhead: true}),
};

function pathOf(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${pathOf(child)}`;
}

export function leavingViewOf(snapshot: LeavingSnapshot): LeavingView {
  const view = VIEWS[pathOf(snapshot.value)];
  if (!view) throw new RangeError(`No view for the leaving state ${pathOf(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});

export const leavingModel = defineModel({
  id: 'leaving',
  machine: leavingMachine,
  events: {
    CHANGE_LIST: {generate: constant, when: offered('CHANGE_LIST')},
    CLICK_HOME: {generate: constant, when: offered('CLICK_HOME')},
    DROP_IMAGE_LINK: {generate: constant, when: offered('DROP_IMAGE_LINK')},
    HOME_ANSWERS: {generate: constant, when: offered('HOME_ANSWERS')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
  },
});
