import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {RECENT_PIN_LIMIT, RECENT_UNPINNED_LIMIT} from '@/lib/recent/recentLinks';
import {recentlyViewedMachine} from '../machines/recently-viewed';
import {defineModel, offered} from '../support/machines';

/** The two lists the walk opens, by the machine's names for them, with their titles. */
export const WALK_LISTS = {tanks: 'Tanks list', support: 'Support list'} as const;
export type WalkList = keyof typeof WALK_LISTS;

/**
 * The other lists that local storage starts with, one short of each cap (lib/recent/recentLinks.ts):
 * pinned ones, most recently pinned first, and unpinned ones opened later than the walk's lists,
 * most recently opened first.
 */
export const OTHER_PINNED_LISTS: readonly string[] = Array.from({length: RECENT_PIN_LIMIT - 1}, (_, index) => `Pinned list ${index + 1}`);
export const OTHER_RECENT_LISTS: readonly string[] = Array.from({length: RECENT_UNPINNED_LIMIT - 1}, (_, index) => `Other list ${index + 1}`);

/** The toast of a refused pin (components/RecentlyViewed.tsx). */
export const PIN_LIMIT_TOAST = `You can pin up to ${RECENT_PIN_LIMIT} lists`;

export type RecentlyViewedSnapshot = SnapshotFrom<typeof recentlyViewedMachine>;
export type RecentlyViewedEvent = EventFrom<typeof recentlyViewedMachine>;

/** What one state shows on Home: the walk's pinned list, its unpinned list and the pin-limit toast. */
export interface RecentlyViewedView {
  readonly pinned: WalkList | null;
  readonly recent: WalkList | null;
  readonly pinRefused: boolean;
}

const view = (pinned: WalkList | null, recent: WalkList | null, pinRefused = false): RecentlyViewedView => ({pinned, recent, pinRefused});

/** Each state of the machine, by its path, and what Home shows. */
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

/** What Home shows in a state of the machine. */
export function recentlyViewedViewOf(snapshot: RecentlyViewedSnapshot): RecentlyViewedView {
  const found = RECENTLY_VIEWED_VIEWS[statePath(snapshot.value)];
  if (!found) throw new RangeError(`No view for the Recently viewed state ${statePath(snapshot.value)}`);
  return found;
}

/** The names of the links in Recently viewed, in order: pinned ones first, then the others. */
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
  // Each control is sent where Home shows it: Pin on an unpinned list, Unpin on a pinned one,
  // Reopen and Remove on a listed one, Open (a link from outside Home) for an unlisted one.
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
    TOAST_TIMES_OUT: {generate: constant, when: offered('TOAST_TIMES_OUT')},
  },
});
