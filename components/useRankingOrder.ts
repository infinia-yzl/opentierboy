'use client';

import {useSyncExternalStore} from 'react';
import {shuffleIds, type RandomSource, type RankingOrder} from '@/lib/zen/queue';

/**
 * Zen's ranking order and "Hide the queue" (owner decisions, 2026-10-28 and 2026-10-29).
 *
 * They are view settings, so they never write the link or a history entry. They live in memory,
 * in this store, for the page's lifetime: Zen itself is a state of the page (the `zen-mode`
 * class), not a saved choice, and Shuffle's order belongs to the items of the list on screen,
 * which means nothing to another list or a later visit. The settings stay across Back and
 * Forward, and when Zen is turned off and on again; a reload starts with Pick freely.
 */
export interface RankingOrderView {
  readonly order: RankingOrder;
  readonly hideQueue: boolean;
  /** Shuffle's order: the Unranked items' ids as drawn (lib/zen/queue.ts, queueOrder). */
  readonly shuffled: readonly string[];
}

const INITIAL_VIEW: RankingOrderView = Object.freeze({order: 'pick', hideQueue: false, shuffled: Object.freeze([])});

function createRankingOrderStore(random: RandomSource) {
  let view = INITIAL_VIEW;
  const listeners = new Set<() => void>();
  const set = (next: RankingOrderView) => {
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
    getSnapshot: (): RankingOrderView => view,
    /** Chooses a ranking order. Shuffle draws a new order of the Unranked items. */
    setOrder(order: RankingOrder, trayIds: readonly string[]) {
      set({...view, order, shuffled: order === 'shuffle' ? shuffleIds(trayIds, random) : view.shuffled});
    },
    setHideQueue(hideQueue: boolean) {
      if (hideQueue !== view.hideQueue) set({...view, hideQueue});
    },
  });
}

const store = createRankingOrderStore(Math.random);
const serverSnapshot = () => INITIAL_VIEW;

export function useRankingOrder(): RankingOrderView {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
}

export const getRankingOrder = store.getSnapshot;
export const setRankingOrder = store.setOrder;
export const setHideQueue = store.setHideQueue;
