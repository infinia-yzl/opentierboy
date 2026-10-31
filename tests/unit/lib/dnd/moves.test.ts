import {describe, expect, it} from 'vitest';
import {
  addTier,
  canAddTier,
  canRemoveTier,
  findItem,
  MAX_TIER_ROWS,
  moveItem,
  newTierId,
  removeTier,
  reorderRows,
} from '@/lib/dnd/moves';
import {V3_LIMITS} from '@/lib/state';
import type Tier from '@/models/Tier';
import {tierTemplates} from '@/models/Tier';
import {seededRandom} from '../../support/random-states';

function item(id: string, content = id) {
  return {id, content};
}

function tier(id: string, name: string, itemIds: string[] = []): Tier {
  return {id, name, items: itemIds.map(itemId => item(itemId)), labelPosition: 'left'};
}

/** The 5-row template with items, as the editor holds it. */
function sampleTiers(): Tier[] {
  return [
    tier('tier-s', 'S', ['mauga', 'winston', 'sigma']),
    tier('tier-a', 'A', ['ana']),
    tier('tier-b', 'B'),
    tier('tier-c', 'C', ['dva', 'orisa']),
    tier('tier-f', 'F'),
    tier('uncategorized', '', ['zarya', 'rein', 'ram', 'hog']),
  ];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function names(tiers: Tier[]) {
  return tiers.map(t => [t.id, t.name, t.items.map(i => i.id)]);
}

/**
 * The editor's drop handler today (components/DragDropTierList.tsx onDragEnd), copied as it
 * is, mutations included. The new functions must give the same lists.
 */
const reorder = <T, >(list: T[], startIndex: number, endIndex: number): T[] => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};

interface DropResult {
  type: 'TIER' | 'DEFAULT';
  source: {droppableId: string; index: number};
  destination: {droppableId: string; index: number} | null;
}

function todaysOnDragEnd(tiers: Tier[], result: DropResult): Tier[] {
  const {source, destination, type} = result;
  if (!destination) return tiers;
  let newTiers: Tier[];
  if (type === 'TIER') {
    newTiers = reorder(tiers, source.index, destination.index);
    newTiers = newTiers.map((tier, index) => ({...tier, name: tiers[index].name}));
  } else {
    newTiers = [...tiers];
    const sourceTier = newTiers.find(t => t.id === source.droppableId)!;
    const destTier = newTiers.find(t => t.id === destination.droppableId)!;
    if (sourceTier.id === destTier.id) {
      sourceTier.items = reorder(sourceTier.items, source.index, destination.index);
    } else {
      const [movedItem] = sourceTier.items.splice(source.index, 1);
      destTier.items.splice(destination.index, 0, movedItem);
    }
  }
  return newTiers;
}

function randomTiers(random: () => number): Tier[] {
  const rowCount = 2 + Math.floor(random() * 8);
  let nextItem = 0;
  return Array.from({length: rowCount}, (_, row) => {
    const itemCount = Math.floor(random() * (random() < 0.3 ? 30 : 6));
    const isLast = row === rowCount - 1;
    return tier(`row-${row}`, isLast ? '' : `L${row}`, Array.from({length: itemCount}, () => `item-${nextItem++}`));
  });
}

describe('moveItem', () => {
  it('returns row B with the item and Unranked without it when an item moves from Unranked to row B', () => {
    const tiers = deepFreeze(sampleTiers());
    const next = moveItem(tiers, {tierId: 'uncategorized', index: 1}, {tierId: 'tier-b', index: 0});
    expect(names(next)[2]).toEqual(['tier-b', 'B', ['rein']]);
    expect(names(next)[5]).toEqual(['uncategorized', '', ['zarya', 'ram', 'hog']]);
  });

  it('returns the reordered row, counting the target index without the item, when an item moves inside its row', () => {
    const tiers = deepFreeze(sampleTiers());
    expect(moveItem(tiers, {tierId: 'tier-s', index: 2}, {tierId: 'tier-s', index: 0})[0].items.map(i => i.id))
      .toEqual(['sigma', 'mauga', 'winston']);
    expect(moveItem(tiers, {tierId: 'tier-s', index: 0}, {tierId: 'tier-s', index: 2})[0].items.map(i => i.id))
      .toEqual(['winston', 'sigma', 'mauga']);
  });

  it('returns the item at the target index when it moves to the middle or the end of another row', () => {
    const tiers = deepFreeze(sampleTiers());
    expect(moveItem(tiers, {tierId: 'tier-a', index: 0}, {tierId: 'tier-s', index: 1})[0].items.map(i => i.id))
      .toEqual(['mauga', 'ana', 'winston', 'sigma']);
    expect(moveItem(tiers, {tierId: 'tier-a', index: 0}, {tierId: 'tier-s', index: 3})[0].items.map(i => i.id))
      .toEqual(['mauga', 'winston', 'sigma', 'ana']);
  });

  it('returns the same array when the target is the source', () => {
    const tiers = sampleTiers();
    expect(moveItem(tiers, {tierId: 'tier-s', index: 1}, {tierId: 'tier-s', index: 1})).toBe(tiers);
  });

  it('returns the same array when a position does not fit the list', () => {
    const tiers = sampleTiers();
    const cases: [string, number, string, number][] = [
      ['nope', 0, 'tier-a', 0],
      ['tier-s', 0, 'nope', 0],
      ['tier-s', 3, 'tier-a', 0],
      ['tier-s', -1, 'tier-a', 0],
      ['tier-s', 0.5, 'tier-a', 0],
      ['tier-s', 0, 'tier-a', 2],
      ['tier-s', 0, 'tier-s', 3],
      ['tier-b', 0, 'tier-a', 0],
      ['tier-s', 0, 'tier-a', Number.NaN],
    ];
    for (const [fromTier, fromIndex, toTier, toIndex] of cases) {
      expect(moveItem(tiers, {tierId: fromTier, index: fromIndex}, {tierId: toTier, index: toIndex}), `${fromTier}[${fromIndex}] → ${toTier}[${toIndex}]`).toBe(tiers);
    }
  });

  it('returns the untouched rows and items as the same objects when an item moves between two rows', () => {
    const tiers = sampleTiers();
    const next = moveItem(tiers, {tierId: 'tier-s', index: 0}, {tierId: 'tier-a', index: 0});
    expect(next[0]).not.toBe(tiers[0]);
    expect(next[1]).not.toBe(tiers[1]);
    for (const row of [2, 3, 4, 5]) expect(next[row]).toBe(tiers[row]);
    expect(next[1].items[0]).toBe(tiers[0].items[0]);
  });

  it('returns the list of the pre-2.0.0 onDragEnd when run on 2,000 seeded random moves', () => {
    const random = seededRandom(5_142);
    for (let run = 0; run < 2_000; run++) {
      const tiers = randomTiers(random);
      const filled = tiers.filter(t => t.items.length > 0);
      if (filled.length === 0) continue;
      const source = filled[Math.floor(random() * filled.length)];
      const target = tiers[Math.floor(random() * tiers.length)];
      const fromIndex = Math.floor(random() * source.items.length);
      const room = target.id === source.id ? target.items.length : target.items.length + 1;
      const toIndex = Math.floor(random() * room);

      const expected = todaysOnDragEnd(structuredClone(tiers), {
        type: 'DEFAULT',
        source: {droppableId: source.id, index: fromIndex},
        destination: {droppableId: target.id, index: toIndex},
      });
      const next = moveItem(deepFreeze(tiers), {tierId: source.id, index: fromIndex}, {tierId: target.id, index: toIndex});
      expect(next, `run ${run}`).toEqual(expected);
      expect(next.flatMap(t => t.items).length).toBe(tiers.flatMap(t => t.items).length);
    }
  });
});

describe('reorderRows', () => {
  it('returns contents moved and labels in place when row S moves to the place of row A (product rule 6)', () => {
    const tiers = deepFreeze(sampleTiers());
    const next = reorderRows(tiers, 0, 1);
    expect(names(next).slice(0, 3)).toEqual([
      ['tier-a', 'S', ['ana']],
      ['tier-s', 'A', ['mauga', 'winston', 'sigma']],
      ['tier-b', 'B', []],
    ]);
  });

  it('returns the same array when the Unranked row moves or a row moves onto it (owner decision, 2026-10-31)', () => {
    const tiers = deepFreeze(sampleTiers());
    expect(reorderRows(tiers, 5, 0)).toBe(tiers);
    expect(reorderRows(tiers, 0, 5)).toBe(tiers);
  });

  it('returns the same array when from equals to or an index does not fit', () => {
    const tiers = sampleTiers();
    expect(reorderRows(tiers, 2, 2)).toBe(tiers);
    expect(reorderRows(tiers, -1, 2)).toBe(tiers);
    expect(reorderRows(tiers, 0, 6)).toBe(tiers);
    expect(reorderRows(tiers, 1.5, 2)).toBe(tiers);
  });

  it('returns rows with unchanged contents and label as the same objects when rows move', () => {
    const tiers = sampleTiers();
    const next = reorderRows(tiers, 1, 3);
    expect(next[0]).toBe(tiers[0]);
    expect(next[4]).toBe(tiers[4]);
    expect(next[5]).toBe(tiers[5]);
  });

  it('returns the pre-2.0.0 onDragEnd list when ranked rows move, and the input when Unranked moves', () => {
    const lists: Tier[][] = [
      ...Object.values(tierTemplates).map(template => template.map(row => ({...row, items: [item(`${row.id}-x`)]}))),
      sampleTiers(),
    ];
    const random = seededRandom(182);
    for (let run = 0; run < 200; run++) lists.push(randomTiers(random));
    for (const tiers of lists) {
      for (let from = 0; from < tiers.length; from++) {
        for (let to = 0; to < tiers.length; to++) {
          const last = tiers.length - 1;
          const expected = from === last || to === last ? tiers : todaysOnDragEnd(structuredClone(tiers), {
            type: 'TIER',
            source: {droppableId: 'all-tiers', index: from},
            destination: {droppableId: 'all-tiers', index: to},
          });
          expect(reorderRows(deepFreeze(tiers), from, to), `${from} → ${to}`).toEqual(expected);
        }
      }
    }
  });
});

describe('findItem', () => {
  it('returns the first position, or null, when the id appears once, twice or nowhere', () => {
    const tiers = sampleTiers();
    expect(findItem(tiers, 'orisa')).toEqual({tierId: 'tier-c', index: 1});
    expect(findItem(tiers, 'nope')).toBeNull();
    tiers[1].items.push(item('rein'));
    expect(findItem(tiers, 'rein')).toEqual({tierId: 'tier-a', index: 1});
  });
});

describe('addTier (#182)', () => {
  it('returns an empty row tier-1 above Unranked with the label position when called without options', () => {
    const tiers = deepFreeze(sampleTiers().map(t => ({...t, labelPosition: 'top' as const})));
    const result = addTier(tiers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('tier-1');
    expect(result!.tiers).toHaveLength(7);
    expect(result!.tiers[5]).toEqual({id: 'tier-1', name: '', items: [], labelPosition: 'top'});
    expect(result!.tiers[6]).toBe(tiers[5]);
  });

  it('returns the row at options.index, clamped above Unranked, when called with a name and an index', () => {
    const tiers = sampleTiers();
    expect(addTier(tiers, {name: 'Tier 0', index: 0})!.tiers.map(t => t.name)).toEqual(['Tier 0', 'S', 'A', 'B', 'C', 'F', '']);
    expect(addTier(tiers, {index: 99})!.tiers.at(-1)!.id).toBe('uncategorized');
    expect(addTier(tiers, {index: -5})!.tiers[0].id).toBe('tier-1');
    expect(addTier(tiers, {index: Number.NaN})!.tiers[5].id).toBe('tier-1');
  });

  it('returns a new id that no row has when the list has tier-1 and tier-3', () => {
    const tiers = [tier('tier-1', 'X'), tier('tier-3', 'Y'), tier('uncategorized', '')];
    expect(newTierId(tiers)).toBe('tier-2');
    const once = addTier(tiers)!;
    const twice = addTier(once.tiers)!;
    expect([once.id, twice.id]).toEqual(['tier-2', 'tier-4']);
    expect(new Set(twice.tiers.map(t => t.id)).size).toBe(5);
  });

  it('returns null when the list has MAX_TIER_ROWS rows, options.maxRows rows or no rows', () => {
    let tiers = sampleTiers();
    while (canAddTier(tiers)) tiers = addTier(tiers)!.tiers;
    expect(tiers).toHaveLength(MAX_TIER_ROWS);
    expect(addTier(tiers)).toBeNull();
    expect(addTier(sampleTiers(), {maxRows: 6})).toBeNull();
    expect(addTier([])).toBeNull();
  });
});

describe('removeTier (#182)', () => {
  it('returns the list without the row and its items at the end of Unranked when row S is removed', () => {
    const tiers = deepFreeze(sampleTiers());
    const next = removeTier(tiers, 0);
    expect(names(next)).toEqual([
      ['tier-a', 'A', ['ana']],
      ['tier-b', 'B', []],
      ['tier-c', 'C', ['dva', 'orisa']],
      ['tier-f', 'F', []],
      ['uncategorized', '', ['zarya', 'rein', 'ram', 'hog', 'mauga', 'winston', 'sigma']],
    ]);
    expect(next[0]).toBe(tiers[1]);
  });

  it('returns the same array when the row is Unranked, the last ranked row or out of range', () => {
    const tiers = sampleTiers();
    expect(canRemoveTier(tiers, 5)).toBe(false);
    expect(removeTier(tiers, 5)).toBe(tiers);
    expect(removeTier(tiers, -1)).toBe(tiers);
    const two = [tier('tier-s', 'S', ['a']), tier('uncategorized', '', ['b'])];
    expect(canRemoveTier(two, 0)).toBe(false);
    expect(removeTier(two, 0)).toBe(two);
  });

  it('returns every item, Unranked last and unique row ids when 500 seeded adds and removes run', () => {
    const random = seededRandom(86);
    let tiers = sampleTiers();
    const all = tiers.flatMap(t => t.items.map(i => i.id)).sort();
    for (let step = 0; step < 500; step++) {
      if (random() < 0.5) tiers = addTier(tiers, {index: Math.floor(random() * tiers.length)})?.tiers ?? tiers;
      else tiers = removeTier(tiers, Math.floor(random() * tiers.length));
      expect(tiers.at(-1)!.id).toBe('uncategorized');
      expect(tiers.length).toBeGreaterThanOrEqual(2);
      expect(tiers.length).toBeLessThanOrEqual(MAX_TIER_ROWS);
      expect(new Set(tiers.map(t => t.id)).size).toBe(tiers.length);
    }
    expect(tiers.flatMap(t => t.items.map(i => i.id)).sort()).toEqual(all);
  });
});

describe('MAX_TIER_ROWS (#182)', () => {
  it('returns at most V3_LIMITS.maxRows when MAX_TIER_ROWS is compared with the v3 decoder cap', () => {
    expect(MAX_TIER_ROWS).toBeLessThanOrEqual(V3_LIMITS.maxRows);
  });
});
