'use client';

import {useEffect, useSyncExternalStore} from 'react';
import {useSearchParams} from 'next/navigation';
import {
  entryPaths,
  followAddress,
  listSteps,
  pathOf,
  pathsToRemember,
  SINGLE_STEP,
  startLog,
  type AddressChange,
  type ListSteps,
  type StepLog,
} from '@/lib/zen/steps';

/**
 * The Zen bar's step count ("7 / 13") and its Back and Forward. They use the browser history,
 * which is the list's undo (product rule 2), never a separate undo stack.
 *
 * Browsers with the Navigation API list this tab's history entries themselves
 * (`navigation.entries()`), so the count comes straight from them. They hide the addresses of
 * entries from earlier page loads (the referrer policy), so the path of each entry is also kept
 * in sessionStorage by its entry key: after a reload, the versions from before it still count.
 * sessionStorage belongs to this tab and holds only /rank paths, never a list. Other browsers
 * get the count from a log of the address changes this page has seen (useStepLog).
 */

interface NavigationEntryLike {
  readonly key: string;
  readonly url: string | null;
  readonly index: number;
}

/** sessionStorage key: the /rank path of each history entry of this tab, by entry key. */
const ENTRY_PATHS_KEY = 'otb-zen-entry-paths';

function readRememberedPaths(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(ENTRY_PATHS_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((pair): pair is [string, string] => typeof pair[1] === 'string'));
  } catch {
    return {};
  }
}

function rememberPaths(paths: Record<string, string>) {
  try {
    sessionStorage.setItem(ENTRY_PATHS_KEY, JSON.stringify(paths));
  } catch {
    // The count then starts at this page load.
  }
}

interface NavigationLike {
  readonly currentEntry: NavigationEntryLike | null;
  entries(): NavigationEntryLike[];
  addEventListener(type: 'currententrychange', listener: () => void): void;
  removeEventListener(type: 'currententrychange', listener: () => void): void;
}

function navigationApi(): NavigationLike | null {
  if (typeof window === 'undefined') return null;
  const navigation = (window as unknown as {navigation?: NavigationLike}).navigation;
  return navigation && typeof navigation.entries === 'function' ? navigation : null;
}

/**
 * The step count store: one per page (a store with closures, A47), shared by the editor, which
 * writes the fallback log, and the Zen bar, which reads the count.
 */
function createListStepsStore() {
  const listeners = new Set<() => void>();
  let steps: ListSteps = SINGLE_STEP;
  /** The fallback log (browsers without the Navigation API). */
  let log: StepLog | null = null;
  /** Set by popstate: the next address change is Back or Forward. */
  let traversing = false;
  /** Set by the Zen bar's buttons: which way the next traverse goes. */
  let direction: -1 | 1 | undefined;
  let historyLength = 0;

  const publish = (next: ListSteps) => {
    if (next.step === steps.step && next.total === steps.total) return;
    steps = next;
    listeners.forEach(listener => listener());
  };

  const readNavigation = (navigation: NavigationLike): ListSteps => {
    const current = navigation.currentEntry;
    if (!current) return SINGLE_STEP;
    const entries = navigation.entries();
    const paths = entryPaths(entries, readRememberedPaths(), window.location.href);
    rememberPaths(pathsToRemember(entries, paths));
    return listSteps(paths, current.index);
  };

  const readLog = (): ListSteps => {
    if (!log) return SINGLE_STEP;
    const base = window.location.href;
    return listSteps(log.addresses.map(address => pathOf(address, base)), log.index);
  };

  return Object.freeze({
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      const navigation = navigationApi();
      const update = () => publish(navigation ? readNavigation(navigation) : readLog());
      update();
      navigation?.addEventListener('currententrychange', update);
      return () => {
        listeners.delete(listener);
        navigation?.removeEventListener('currententrychange', update);
      };
    },
    getSnapshot: (): ListSteps => steps,
    traverse(to: -1 | 1) {
      direction = to;
      if (to === -1) window.history.back();
      else window.history.forward();
    },
    /** Reads the history again (Navigation API), which also remembers the entries' paths. */
    refresh() {
      const navigation = navigationApi();
      if (navigation) publish(readNavigation(navigation));
    },
    popped() {
      traversing = true;
    },
    /** The fallback log: the address is now `address` (see useStepLog). */
    addressSeen(address: string) {
      const current = log?.addresses[log.index];
      if (!log || pathOf(current, window.location.href) !== window.location.pathname) {
        log = startLog(address);
      } else if (current !== address) {
        let change: AddressChange;
        if (traversing) change = {kind: 'traverse', address, direction};
        else if (window.history.length === historyLength && log.index === log.addresses.length - 1) change = {kind: 'replace', address};
        else change = {kind: 'push', address};
        log = followAddress(log, change);
      }
      traversing = false;
      direction = undefined;
      historyLength = window.history.length;
      publish(readLog());
    },
  });
}

const store = createListStepsStore();
const serverSnapshot = () => SINGLE_STEP;

/** Where the list on screen is among its versions in this tab's history. */
export function useListSteps(): ListSteps {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
}

/** The previous version of the list: the browser's Back. */
export const stepBack = () => store.traverse(-1);

/** The next version of the list: the browser's Forward. */
export const stepForward = () => store.traverse(1);

/**
 * Writes down the address changes of the editor from its start, so the count knows the list's
 * first version: with the Navigation API, the path of every entry (kept across reloads); without
 * it, the log. In the log, a change after popstate is Back or Forward; any other change is a new
 * entry, or, when the history did not grow while the log was at its newest entry, a replaced one
 * (the label settings, A3).
 */
export function useStepLog() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (navigationApi()) return;
    window.addEventListener('popstate', store.popped);
    return () => window.removeEventListener('popstate', store.popped);
  }, []);

  useEffect(() => {
    if (navigationApi()) store.refresh();
    else store.addressSeen(window.location.pathname + window.location.search);
  }, [searchParams]);
}
