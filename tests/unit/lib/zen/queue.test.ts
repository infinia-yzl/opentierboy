import {describe, expect, it} from 'vitest';
import {itemsLeftText, queueOrder, RANKING_ORDER_NAMES, RANKING_ORDERS, shuffleIds} from '@/lib/zen/queue';

/** Zen's ranking order (lib/zen/queue.ts, used by the Unranked tray and the Zen bar). */

/** A random source that returns the given numbers in turn. */
const sequence = (...values: number[]) => {
  let at = 0;
  return () => values[at++ % values.length];
};

describe('RANKING_ORDERS', () => {
  it('returns Pick freely, In order and Shuffle in the menu order when the names are read', () => {
    expect(RANKING_ORDERS.map(order => RANKING_ORDER_NAMES[order])).toEqual(['Pick freely', 'In order', 'Shuffle']);
  });
});

describe('shuffleIds', () => {
  it('returns the ids in the order the random source draws when the source is fixed', () => {
    // Fisher-Yates from the end: 0.0 swaps d with a, 0.5 swaps c with b, 0.0 swaps c (now at 1) with d (now at 0).
    expect(shuffleIds(['a', 'b', 'c', 'd'], sequence(0, 0.5, 0))).toEqual(['c', 'd', 'b', 'a']);
  });

  it('returns the ids as they are when every draw is the last place', () => {
    expect(shuffleIds(['a', 'b', 'c'], () => 0.999)).toEqual(['a', 'b', 'c']);
  });

  it('returns every id once and leaves the input as it is when the source is Math.random', () => {
    const ids = Object.freeze(['a', 'b', 'c', 'd', 'e']);
    const shuffled = shuffleIds(ids, Math.random);
    expect([...shuffled].sort()).toEqual([...ids]);
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns the last place when the source returns 1', () => {
    expect(shuffleIds(['a', 'b'], () => 1)).toEqual(['a', 'b']);
  });

  it('returns an empty list when there are no ids', () => {
    expect(shuffleIds([], Math.random)).toEqual([]);
  });
});

describe('queueOrder', () => {
  const tray = ['ana', 'mercy', 'kiriko', 'lucio'];

  it('returns the tray order when the order is pick', () => {
    expect(queueOrder(tray, 'pick', ['lucio', 'ana'])).toEqual(tray);
  });

  it('returns the tray order when the order is order', () => {
    expect(queueOrder(tray, 'order', ['lucio', 'ana', 'kiriko', 'mercy'])).toEqual(tray);
  });

  it('returns the drawn order when the order is shuffle', () => {
    expect(queueOrder(tray, 'shuffle', ['lucio', 'ana', 'kiriko', 'mercy'])).toEqual(['lucio', 'ana', 'kiriko', 'mercy']);
  });

  it('returns the drawn order without the ranked items when items left the tray after the draw', () => {
    expect(queueOrder(['mercy', 'lucio'], 'shuffle', ['lucio', 'ana', 'kiriko', 'mercy'])).toEqual(['lucio', 'mercy']);
  });

  it('returns items the draw does not know last, in tray order, when they joined the tray after the draw', () => {
    expect(queueOrder(['moira', 'mercy', 'juno', 'lucio'], 'shuffle', ['lucio', 'mercy'])).toEqual(['lucio', 'mercy', 'moira', 'juno']);
  });
});

describe('itemsLeftText', () => {
  it('returns "6 left" when 6 items are left', () => {
    expect(itemsLeftText(6)).toBe('6 left');
  });
});
