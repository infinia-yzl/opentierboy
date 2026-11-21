import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {RECENT_PIN_LIMIT, RECENT_UNPINNED_LIMIT} from '@/lib/recent/recentLinks';
import {recentlyViewedMachine} from '../machines/recently-viewed';
import {defineModel, offered} from '../support/machines';

export const WALK_LISTS = {tanks: 'Tanks list', support: 'Support list'} as const;
export type WalkList = keyof typeof WALK_LISTS;

export const OTHER_PINNED_LISTS: readonly string[] = Array.from({length: RECENT_PIN_LIMIT - 1}, (_, index) => `Pinned list ${index + 1}`);
export const OTHER_RECENT_LISTS: readonly string[] = Array.from({length: RECENT_UNPINNED_LIMIT - 1}, (_, index) => `Other list ${index + 1}`);

export const PIN_LIMIT_TOAST = `You can pin up to ${RECENT_PIN_LIMIT} lists`;

export type RecentlyViewedSnapshot = SnapshotFrom<typeof recentlyViewedMachine>;
export type RecentlyViewedEvent = EventFrom<typeof recentlyViewedMachine>;

export interface RecentlyViewedView {
  readonly pinned: WalkList | null;
  readonly recent: WalkList | null;
  readonly pinRefused: boolean;
}

const view = (pinned: WalkList | null, recent: WalkList | null, pinRefused = false): RecentlyViewedView => ({pinned, recent, pinRefused});

const RECENTLY_VIEWED_VIEWS: Readonly<Record<string, RecentlyViewedView>> = {
  'nonePinned.noneListed': view(null, null),
  'nonePinned.tanksRecent': view(null, 'tanks'),
  'nonePinned.supportRecent': view(null, 'support'),
  'tanksPinned.supportUnlisted': view('tanks', null),
  'tanksPinned.supportRecent': view('tanks', 'support'),
  'tanksPinned.supportPinRefused': view('tanks', 'support', true),
  'supportPinned.tanksUnlisted': view('support', null),
  'supportPinned.tanksRecent': view('support', 'tanks'),
  'supportPinned.tanksPinRefused': view('support', 'tanks', true),
};

function statePath(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${statePath(child)}`;
}

export function recentlyViewedViewOf(snapshot: RecentlyViewedSnapshot): RecentlyViewedView {
  const found = RECENTLY_VIEWED_VIEWS[statePath(snapshot.value)];
  if (!found) throw new RangeError(`No view for the Recently viewed state ${statePath(snapshot.value)}`);
  return found;
}

export function recentLinkNames({pinned, recent}: RecentlyViewedView): string[] {
  return [
    ...(pinned ? [WALK_LISTS[pinned]] : []),
    ...OTHER_PINNED_LISTS,
    ...OTHER_RECENT_LISTS,
    ...(recent ? [WALK_LISTS[recent]] : []),
  ];
}

const constant = fc.constant({});

export const recentlyViewedModel = defineModel({
  id: 'recently-viewed',
  machine: recentlyViewedMachine,
  events: {
    OPEN_TANKS: {generate: constant, when: offered('OPEN_TANKS')},
    OPEN_SUPPORT: {generate: constant, when: offered('OPEN_SUPPORT')},
    REOPEN_TANKS: {generate: constant, when: offered('REOPEN_TANKS')},
    REOPEN_SUPPORT: {generate: constant, when: offered('REOPEN_SUPPORT')},
    PIN_TANKS: {generate: constant, when: offered('PIN_TANKS')},
    PIN_SUPPORT: {generate: constant, when: offered('PIN_SUPPORT')},
    UNPIN_TANKS: {generate: constant, when: offered('UNPIN_TANKS')},
    UNPIN_SUPPORT: {generate: constant, when: offered('UNPIN_SUPPORT')},
    REMOVE_TANKS: {generate: constant, when: offered('REMOVE_TANKS')},
    REMOVE_SUPPORT: {generate: constant, when: offered('REMOVE_SUPPORT')},
  },
});
