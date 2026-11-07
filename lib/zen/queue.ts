/**
 * Zen's ranking order (owner decisions, 2026-10-28 and 2026-10-29): the order in which the
 * Unranked items come up while someone ranks a list in Zen.
 *
 * - 'pick': Pick freely. The Unranked tray as it is; any item can go next.
 * - 'order': In order. The items come up in the tray's order, one at a time ("Up next").
 * - 'shuffle': Shuffle. The items come up in an order drawn at random.
 *
 * Ranking order is a view setting: it never changes the list or its link. Plain functions, no
 * React and no browser globals: the editor's Zen (components/ZenBar.tsx) and later layouts
 * that show Zen use them.
 */
export type RankingOrder = 'pick' | 'order' | 'shuffle';

export const RANKING_ORDERS: readonly RankingOrder[] = Object.freeze(['pick', 'order', 'shuffle']);

/** The names of the ranking orders, as the menu shows them. */
export const RANKING_ORDER_NAMES: Readonly<Record<RankingOrder, string>> = Object.freeze({
  pick: 'Pick freely',
  order: 'In order',
  shuffle: 'Shuffle',
});

/** A source of random numbers in [0, 1), like Math.random. Tests pass their own. */
export type RandomSource = () => number;

/** The ids in an order drawn at random (Fisher-Yates). The input stays as it is. */
export function shuffleIds(ids: readonly string[], random: RandomSource): string[] {
  const shuffled = [...ids];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.min(index, Math.floor(random() * (index + 1)));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

/**
 * The Unranked items in the order they come up, by their ids.
 *
 * - 'pick' and 'order': the tray's order.
 * - 'shuffle': the tray's items in the drawn order `shuffled`. Items the drawn order does not
 *   know (put back into Unranked after the draw, for example) come last, in the tray's order.
 */
export function queueOrder(trayIds: readonly string[], order: RankingOrder, shuffled: readonly string[]): string[] {
  if (order !== 'shuffle') return [...trayIds];
  const inTray = new Set(trayIds);
  const drawn = shuffled.filter(id => inTray.has(id));
  const known = new Set(drawn);
  return [...drawn, ...trayIds.filter(id => !known.has(id))];
}

/** "6 left": how many Unranked items are left to rank. */
export function itemsLeftText(count: number): string {
  return `${count} left`;
}
