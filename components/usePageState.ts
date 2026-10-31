'use client';

import {useSyncExternalStore} from 'react';

/**
 * Page states that every item tile follows: whether the page is scrolling, and whether zen mode
 * is on. A list can hold hundreds of tiles, so each state has one listener for the whole page
 * (a store with closures, A47), and the tiles subscribe to it. One scroll listener and one
 * MutationObserver per tile made every scroll event (and every auto-scroll step of a drag) run
 * once per tile.
 */

type Listener = () => void;

/** A page state with one source listener, attached while at least one component subscribes. */
function createPageStore(read: () => boolean, attach: (changed: () => void) => () => void) {
  const listeners = new Set<Listener>();
  let detach: (() => void) | null = null;
  let value = false;
  const changed = () => {
    const next = read();
    if (next === value) return;
    value = next;
    listeners.forEach(listener => listener());
  };
  return Object.freeze({
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      if (!detach) {
        value = read();
        detach = attach(changed);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && detach) {
          detach();
          detach = null;
        }
      };
    },
    getSnapshot: (): boolean => value,
  });
}

/** How long after the last scroll event the page counts as still scrolling. */
export const SCROLL_QUIET_MS = 450;

function createScrollingStore() {
  let scrolling = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return createPageStore(() => scrolling, (changed) => {
    const onScroll = () => {
      scrolling = true;
      changed();
      clearTimeout(timer);
      timer = setTimeout(() => {
        scrolling = false;
        changed();
      }, SCROLL_QUIET_MS);
    };
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
      timer = undefined;
      scrolling = false;
    };
  });
}

function createZenModeStore() {
  const read = () => typeof document !== 'undefined' && document.documentElement.classList.contains('zen-mode');
  return createPageStore(read, (changed) => {
    const observer = new MutationObserver(changed);
    observer.observe(document.documentElement, {attributes: true, attributeFilter: ['class']});
    return () => observer.disconnect();
  });
}

const scrollingStore = createScrollingStore();
const zenModeStore = createZenModeStore();
const serverSnapshot = () => false;

/** True while the page scrolls, and for SCROLL_QUIET_MS after the last scroll event. */
export function usePageScrolling(): boolean {
  return useSyncExternalStore(scrollingStore.subscribe, scrollingStore.getSnapshot, serverSnapshot);
}

/** True while zen mode is on (the `zen-mode` class on <html>). */
export function useZenMode(): boolean {
  return useSyncExternalStore(zenModeStore.subscribe, zenModeStore.getSnapshot, serverSnapshot);
}
