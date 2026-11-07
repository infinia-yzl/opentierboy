'use client';

import {useEffect, useMemo, useSyncExternalStore} from 'react';
import {
  endSession,
  finishTip,
  hideTips,
  loadStoredTips,
  requestTip,
  startSession,
  TIPS_ON,
  type TipId,
  type TipsSession,
  type TipsStorage,
  withdrawTip,
  writeStoredTips,
} from '@/lib/tips/tips';

/** The browser's local storage, or null when it is missing or blocked. */
function browserStorage(): TipsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * The tips of this page (lib/tips/tips.ts), one store for every component that shows or starts
 * a tip, so at most one tip shows. It holds nothing until load() runs in an effect: the server
 * and the first browser render show no tips, and both render the same page.
 */
function createTipsStore() {
  let session: TipsSession | null = null;
  const listeners = new Set<() => void>();
  const shareListeners = new Set<() => void>();

  const update = (change: (session: TipsSession) => TipsSession) => {
    if (!session) return;
    const next = change(session);
    if (next === session) return;
    if (next.stored !== session.stored) writeStoredTips(browserStorage(), next.stored);
    session = next;
    listeners.forEach(listener => listener());
  };

  return Object.freeze({
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: (): TipsSession | null => session,
    /** Reads the stored tips once per page load (later calls change nothing). */
    load() {
      if (session) return;
      session = startSession(loadStoredTips(browserStorage()));
      listeners.forEach(listener => listener());
    },
    request: (tip: TipId) => update(current => requestTip(current, tip)),
    withdraw: (tip: TipId) => update(current => withdrawTip(current, tip)),
    finish: (tip: TipId) => update(current => finishTip(current, tip)),
    hide: () => update(hideTips),
    /** The editor closed: its tips stop showing and waiting. */
    end: () => update(endSession),
    /** "Show the tips again" (About): every tip can show again, tips on. */
    reset() {
      writeStoredTips(browserStorage(), TIPS_ON);
      if (session) {
        session = startSession(TIPS_ON);
        listeners.forEach(listener => listener());
      }
    },
    /** The Share button in the "link is the save" toast: the toolbar's Share opens its panel. */
    openShare: () => shareListeners.forEach(listener => listener()),
    onOpenShare(listener: () => void): () => void {
      shareListeners.add(listener);
      return () => shareListeners.delete(listener);
    },
  });
}

const tipsStore = createTipsStore();
const serverSnapshot = () => null;

export interface Tips {
  /** The tip on screen, or null (always null on the server and in the first render). */
  current: TipId | null;
  /** The tips as stored, once loaded. */
  session: TipsSession | null;
  request: (tip: TipId) => void;
  withdraw: (tip: TipId) => void;
  finish: (tip: TipId) => void;
  /** "Hide tips": turns every tip off. */
  hide: () => void;
}

/** The tips of this page. Reads the stored tips in an effect, after the page starts. */
export function useTips(): Tips {
  const session = useSyncExternalStore(tipsStore.subscribe, tipsStore.getSnapshot, serverSnapshot);
  useEffect(() => tipsStore.load(), []);
  return useMemo(() => ({
    current: session?.current ?? null,
    session,
    request: tipsStore.request,
    withdraw: tipsStore.withdraw,
    finish: tipsStore.finish,
    hide: tipsStore.hide,
  }), [session]);
}

/** Ends the editor's tips when it closes (they never show on other pages). */
export const endTips = tipsStore.end;

/** "Show the tips again". */
export const resetTips = tipsStore.reset;

/** Asks the toolbar's Share button to open its panel. */
export const openSharePanel = tipsStore.openShare;

/** Calls `listener` when a tip asks the Share panel to open. Returns the unsubscribe function. */
export const onOpenSharePanel = tipsStore.onOpenShare;
