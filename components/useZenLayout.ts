'use client';

import {useEffect, useLayoutEffect, useSyncExternalStore} from 'react';
import {useZenMode} from '@/components/usePageState';
import {isZenModeOn, setZenMode} from '@/components/zenMode';
import {
  isStageLayout,
  LAYOUT_CHOICES,
  LAYOUT_PARAM,
  parseLayoutParam,
  type LayoutChoice,
  type OverlayBackground,
  type StageLayout,
  type ZenLayout,
} from '@/lib/zen/layouts';

/**
 * Zen's layout (lib/zen/layouts.ts) and the wordmark, chosen in the Zen bar's Layout menu.
 *
 * View settings, like the ranking order (components/useRankingOrder.ts): they never write the
 * link or a history entry, and they live in memory for the page's lifetime. They stay across Back
 * and Forward, and when Zen is turned off and on again. A page opened with the `layout`
 * parameter (an OBS browser source) starts in that layout (components/TierListManager.tsx).
 */
export interface ZenLayoutView {
  readonly layout: ZenLayout;
  readonly background: OverlayBackground;
  /** The OpenTierBoy wordmark in the frame's corner (the boards' optional watermark). */
  readonly wordmark: boolean;
}

const INITIAL_VIEW: ZenLayoutView = Object.freeze({...LAYOUT_CHOICES.editor, wordmark: true});

function createZenLayoutStore() {
  let view = INITIAL_VIEW;
  const listeners = new Set<() => void>();
  const set = (next: ZenLayoutView) => {
    view = Object.freeze(next);
    listeners.forEach(listener => listener());
  };
  return Object.freeze({
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: (): ZenLayoutView => view,
    setChoice({layout, background}: LayoutChoice) {
      if (layout !== view.layout || background !== view.background) set({...view, layout, background});
    },
    setWordmark(wordmark: boolean) {
      if (wordmark !== view.wordmark) set({...view, wordmark});
    },
  });
}

const store = createZenLayoutStore();
const serverSnapshot = () => INITIAL_VIEW;

export function useZenLayout(): ZenLayoutView {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
}

export const setLayoutChoice = store.setChoice;
export const setWordmark = store.setWordmark;

/** The frame layout on screen: the chosen layout while Zen is on, or null in the editor's Zen and outside Zen. */
export function useActiveStage(): StageLayout | null {
  const isZenMode = useZenMode();
  const {layout} = useZenLayout();
  return isZenMode && isStageLayout(layout) ? layout : null;
}

/** On <html>, for app/globals.css: the frame layout on screen, and the overlay's transparent background. */
export const LAYOUT_ATTRIBUTE = 'data-zen-layout';
export const BACKGROUND_ATTRIBUTE = 'data-zen-background';

/**
 * Keeps the attributes on <html> in step with the frame layout on screen, and removes them when
 * the editor goes. It reads the live state, not the render's: on the first render the head
 * script's attributes (a page opened with `layout`) must stay until the store has the layout.
 */
export function useStageAttributes() {
  const stage = useActiveStage();
  const {background} = useZenLayout();
  useLayoutEffect(() => {
    const {layout, background: liveBackground} = store.getSnapshot();
    const live = isZenModeOn() && isStageLayout(layout) ? layout : null;
    const html = document.documentElement;
    if (live) html.setAttribute(LAYOUT_ATTRIBUTE, live);
    else html.removeAttribute(LAYOUT_ATTRIBUTE);
    if (live === 'overlay' && liveBackground === 'transparent') html.setAttribute(BACKGROUND_ATTRIBUTE, 'transparent');
    else html.removeAttribute(BACKGROUND_ATTRIBUTE);
  }, [stage, background]);
  useEffect(() => () => {
    document.documentElement.removeAttribute(LAYOUT_ATTRIBUTE);
    document.documentElement.removeAttribute(BACKGROUND_ATTRIBUTE);
  }, []);
}

/**
 * A page opened with the `layout` parameter (lib/zen/layouts.ts, layoutAddress) starts in Zen,
 * in that layout: an OBS browser source shows the overlay with no clicks. Read once, when the
 * editor opens; the parameter is not part of the list's link, so the next change to the list
 * writes an address without it, and the layout stays in memory. Call it before
 * useStageAttributes, so the frame's attributes from the head script stay on.
 */
export function useLayoutFromAddress() {
  useLayoutEffect(() => {
    const choice = parseLayoutParam(new URLSearchParams(window.location.search).get(LAYOUT_PARAM));
    if (!choice || !isStageLayout(choice.layout)) return;
    store.setChoice(choice);
    setZenMode(true, {announce: false});
  }, []);
}
