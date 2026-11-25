/**
 * The Zen bar's step count ("7 / 13", owner decision, 2026-10-28): which version of the list is
 * on screen, out of the versions of this list in this browser tab's history. Browser history is
 * the list's undo (product rule 2), so the versions are history entries: the run of entries next
 * to the current one that open the same editor page (the same /rank path). Back stops at the
 * first of them, so it never leaves the list.
 *
 * Plain functions, no browser globals: components/useListSteps.ts reads the history.
 */

/** Where the list on screen is among its versions. `step` counts from 1. */
export interface ListSteps {
  readonly step: number;
  readonly total: number;
}

/** No versions to step through: the list on screen is its only version. */
export const SINGLE_STEP: ListSteps = Object.freeze({step: 1, total: 1});

/**
 * The step count from the history entries of this tab, by their /rank path (null for an entry
 * whose address is unknown), and the index of the current entry.
 */
export function listSteps(paths: readonly (string | null)[], current: number): ListSteps {
  const path = paths[current];
  if (path === undefined || path === null) return SINGLE_STEP;
  let first = current;
  while (first > 0 && paths[first - 1] === path) first--;
  let last = current;
  while (last < paths.length - 1 && paths[last + 1] === path) last++;
  return {step: current - first + 1, total: last - first + 1};
}

/** The path of an address (`/rank/overwatch/tank` of `https://…/rank/overwatch/tank?state=…`). */
export function pathOf(address: string | null | undefined, base: string): string | null {
  if (!address) return null;
  try {
    return new URL(address, base).pathname;
  } catch {
    return null;
  }
}

/** A history entry as the Navigation API lists it. */
export interface HistoryEntry {
  /** Stays the same for the entry's place in the history, also after a reload. */
  readonly key: string;
  /** Null for entries of other page loads: the site's referrer policy hides their address. */
  readonly url: string | null;
}

/**
 * The /rank path of each entry: from its address, or, when the browser hides it, from the
 * paths this tab remembered by entry key (`remembered`).
 */
export function entryPaths(entries: readonly HistoryEntry[], remembered: Readonly<Record<string, string>>, base: string): (string | null)[] {
  return entries.map(entry => pathOf(entry.url, base) ?? remembered[entry.key] ?? null);
}

/** The paths to remember, by entry key: those of `entries` whose path is known. Others are dropped. */
export function pathsToRemember(entries: readonly HistoryEntry[], paths: readonly (string | null)[]): Record<string, string> {
  const remembered: Record<string, string> = {};
  entries.forEach((entry, index) => {
    const path = paths[index];
    if (path) remembered[entry.key] = path;
  });
  return remembered;
}

/**
 * The history entries this page has seen, for browsers without the Navigation API, which lists
 * the entries itself. The page writes it down from the address changes it sees.
 */
export interface StepLog {
  readonly addresses: readonly string[];
  readonly index: number;
}

/**
 * A change of the address:
 * - 'push': a new entry (a change to the list). Entries after the current one are gone.
 * - 'replace': the current entry has a new address (the label settings, A3).
 * - 'traverse': Back or Forward. `direction` is known when the Zen bar's own buttons asked.
 */
export type AddressChange =
  | {readonly kind: 'push' | 'replace'; readonly address: string}
  | {readonly kind: 'traverse'; readonly address: string; readonly direction?: -1 | 1};

export function startLog(address: string): StepLog {
  return {addresses: [address], index: 0};
}

/**
 * The log after a change of the address. A traverse with a known direction moves one entry
 * that way. Without one, it goes to the entry next to the current one that has the new
 * address: the one before, else the one after. When there is no such entry, the log knows
 * nothing about the entries around, and starts again from the new address.
 */
export function followAddress(log: StepLog, change: AddressChange): StepLog {
  const {addresses, index} = log;
  switch (change.kind) {
    case 'push':
      return {addresses: [...addresses.slice(0, index + 1), change.address], index: index + 1};
    case 'replace':
      return {addresses: addresses.map((address, at) => (at === index ? change.address : address)), index};
    case 'traverse': {
      const {direction} = change;
      if (direction) {
        const to = index + direction;
        if (to < 0 || to >= addresses.length) return startLog(change.address);
        return {addresses: addresses.map((address, at) => (at === to ? change.address : address)), index: to};
      }
      if (addresses[index - 1] === change.address) return {addresses, index: index - 1};
      if (addresses[index + 1] === change.address) return {addresses, index: index + 1};
      return startLog(change.address);
    }
  }
}
