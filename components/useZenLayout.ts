'use client';

import {useEffect, useLayoutEffect, useSyncExternalStore} from 'react';
import {useZenMode} from '@/components/usePageState';
import {isStageLayout, type StageLayout, type ZenLayout} from '@/lib/zen/layouts';

/**
 * Zen's layout (lib/zen/layouts.ts), chosen in the Zen bar's Layout menu.
 *
 * A view setting, like the ranking order (components/useRankingOrder.ts): it never writes the
 * link or a history entry, and it lives in memory for the page's lifetime. It stays across Back
 * and Forward, and when Zen is turned off and on again. No address opens a layout (owner
 * decision, 2026-11-01).
 */
function createZenLayoutStore() {
  let layout: ZenLayout = 'editor';
  const listeners = new Set<() => void>();
  return Object.freeze({
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: (): ZenLayout => layout,
    setLayout(next: ZenLayout) {
      if (next === layout) return;
      layout = next;
      listeners.forEach(listener => listener());
    },
  });
}

const store = createZenLayoutStore();
const serverSnapshot = (): ZenLayout => 'editor';

export function useZenLayout(): ZenLayout {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
}

export const setZenLayout = store.setLayout;

/** The frame layout on screen: the chosen layout while Zen is on, or null in the editor's Zen and outside Zen. */
export function useActiveStage(): StageLayout | null {
  const isZenMode = useZenMode();
  const layout = useZenLayout();
  return isZenMode && isStageLayout(layout) ? layout : null;
}

/** On <html>, for app/globals.css: the frame layout on screen. */
export const LAYOUT_ATTRIBUTE = 'data-zen-layout';

/**
 * Keeps the frame layout on screen on <html>, so the page under the frame does not scroll
 * (app/globals.css), and removes it when the editor goes.
 */
export function useStageAttributes() {
  const stage = useActiveStage();
  useLayoutEffect(() => {
    if (stage) document.documentElement.setAttribute(LAYOUT_ATTRIBUTE, stage);
    else document.documentElement.removeAttribute(LAYOUT_ATTRIBUTE);
  }, [stage]);
  useEffect(() => () => document.documentElement.removeAttribute(LAYOUT_ATTRIBUTE), []);
}
