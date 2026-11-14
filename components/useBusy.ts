'use client';

import {useEffect, useLayoutEffect, useSyncExternalStore} from 'react';
import {pageBusy, type StartGate} from '@/lib/busy';

/**
 * Counts the page as busy while `busy` is true. A layout effect, so the page says so in the
 * same event that made `busy` true.
 */
export function useBusyWhile(busy: boolean): void {
  useLayoutEffect(() => (busy ? pageBusy.begin() : undefined), [busy]);
}

/**
 * True while the page is working on something (lib/busy.ts). The server's page says busy: a page
 * is busy until React has taken it over in the browser.
 */
export function usePageBusy(): boolean {
  return useSyncExternalStore(pageBusy.subscribe, pageBusy.isBusy, () => true);
}

/**
 * Counts the page as busy until the part behind `gate` has started (lib/busy.ts, StartGate).
 * Called next to that part, in code that starts with the rest of the page, while `when` is true.
 */
export function useHoldUntilStarted(gate: StartGate, when = true): void {
  useLayoutEffect(() => (when ? gate.hold() : undefined), [gate, when]);
}

/**
 * Marks the part behind `gate` as started. A passive effect in the part's outermost component:
 * it runs after the effects of everything inside, such as the listeners for pasted files.
 */
export function useStarted(gate: StartGate): void {
  useEffect(() => gate.start(), [gate]);
}
