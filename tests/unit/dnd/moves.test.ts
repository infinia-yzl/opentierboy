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
import type Tier from '@/models/Tier';
import {tierTemplates} from '@/models/Tier';
import {seededRandom} from '../support/randomStates';

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
  it('moves an item from Unranked to the end of a tier', () => {
    const tiers = deepFreeze(sampleTiers());
    const next = moveItem(tiers, {tierId: 'uncategorized', index: 1}, {tierId: 'tier-b', index: 0});
    expect(names(next)[2]).toEqual(['tier-b', 'B', ['rein']]);
    expect(names(next)[5]).toEqual(['uncategorized', '', ['zarya', 'ram', 'hog']]);
  });

  it('reorders inside a row; the target index counts the row without the moved item', () => {
    const tiers = deepFreeze(sampleTiers());
    expect(moveItem(tiers, {tierId: 'tier-s', index: 2}, {tierId: 'tier-s', index: 0})[0].items.map(i => i.id))
      .toEqual(['sigma', 'mauga', 'winston']);
    expect(moveItem(tiers, {tierId: 'tier-s', index: 0}, {tierId: 'tier-s', index: 2})[0].items.map(i => i.id))
      .toEqual(['winston', 'sigma', 'mauga']);
  });

  it('inserts at any place in another row, end included', () => {
    const tiers = deepFreeze(sampleTiers());
    expect(moveItem(tiers, {tierId: 'tier-a', index: 0}, {tierId: 'tier-s', index: 1})[0].items.map(i => i.id))
      .toEqual(['mauga', 'ana', 'winston', 'sigma']);
    expect(moveItem(tiers, {tierId: 'tier-a', index: 0}, {tierId: 'tier-s', index: 3})[0].items.map(i => i.id))
      .toEqual(['mauga', 'winston', 'sigma', 'ana']);
  });

  it('returns the same array for a drop where the drag started', () => {
    const tiers = sampleTiers();
    expect(moveItem(tiers, {tierId: 'tier-s', index: 1}, {tierId: 'tier-s', index: 1})).toBe(tiers);
  });

  it('returns the same array for positions that do not fit the list', () => {
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

  it('keeps unchanged rows as the same objects', () => {
    const tiers = sampleTiers();
    const next = moveItem(tiers, {tierId: 'tier-s', index: 0}, {tierId: 'tier-a', index: 0});
    expect(next[0]).not.toBe(tiers[0]);
    expect(next[1]).not.toBe(tiers[1]);
    for (const row of [2, 3, 4, 5]) expect(next[row]).toBe(tiers[row]);
    expect(next[1].items[0]).toBe(tiers[0].items[0]);
  });

  it('gives the same list as the editor today, for 2,000 random moves (seeded)', () => {
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
  it('moves the contents and keeps every label at its position (product rule 6)', () => {
    const tiers = deepFreeze(sampleTiers());
    const next = reorderRows(tiers, 0, 1);
    expect(names(next).slice(0, 3)).toEqual([
      ['tier-a', 'S', ['ana']],
      ['tier-s', 'A', ['mauga', 'winston', 'sigma']],
      ['tier-b', 'B', []],
    ]);
  });

  it('keeps Unranked, the last row, in place: it is a fixed tray (owner decision, 2026-10-31)', () => {
    const tiers = deepFreeze(sampleTiers());
    expect(reorderRows(tiers, 5, 0)).toBe(tiers);
    expect(reorderRows(tiers, 0, 5)).toBe(tiers);
  });

  it('returns the same array when nothing moves or the indexes do not fit', () => {
    const tiers = sampleTiers();
    expect(reorderRows(tiers, 2, 2)).toBe(tiers);
    expect(reorderRows(tiers, -1, 2)).toBe(tiers);
    expect(reorderRows(tiers, 0, 6)).toBe(tiers);
    expect(reorderRows(tiers, 1.5, 2)).toBe(tiers);
  });

  it('keeps rows whose contents and label do not change as the same objects', () => {
    const tiers = sampleTiers();
    const next = reorderRows(tiers, 1, 3);
    expect(next[0]).toBe(tiers[0]);
    expect(next[4]).toBe(tiers[4]);
    expect(next[5]).toBe(tiers[5]);
  });

  it('gives the same list as the editor before 2.0.0 for moves between ranked rows, and leaves Unranked in place', () => {
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
  it('finds an item, the first one for duplicate ids', () => {
    const tiers = sampleTiers();
    expect(findItem(tiers, 'orisa')).toEqual({tierId: 'tier-c', index: 1});
    expect(findItem(tiers, 'nope')).toBeNull();
    tiers[1].items.push(item('rein'));
    expect(findItem(tiers, 'rein')).toEqual({tierId: 'tier-a', index: 1});
  });
});

describe('addTier (#182)', () => {
  it('adds an empty row just above Unranked, with a new id and the label position', () => {
    const tiers = deepFreeze(sampleTiers().map(t => ({...t, labelPosition: 'top' as const})));
    const result = addTier(tiers);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('tier-1');
    expect(result!.tiers).toHaveLength(7);
    expect(result!.tiers[5]).toEqual({id: 'tier-1', name: '', items: [], labelPosition: 'top'});
    expect(result!.tiers[6]).toBe(tiers[5]);
  });

  it('takes a name and a position, and keeps Unranked last', () => {
    const tiers = sampleTiers();
    expect(addTier(tiers, {name: 'Tier 0', index: 0})!.tiers.map(t => t.name)).toEqual(['Tier 0', 'S', 'A', 'B', 'C', 'F', '']);
    expect(addTier(tiers, {index: 99})!.tiers.at(-1)!.id).toBe('uncategorized');
    expect(addTier(tiers, {index: -5})!.tiers[0].id).toBe('tier-1');
    expect(addTier(tiers, {index: Number.NaN})!.tiers[5].id).toBe('tier-1');
  });

  it('never reuses an id in the list', () => {
    const tiers = [tier('tier-1', 'X'), tier('tier-3', 'Y'), tier('uncategorized', '')];
    expect(newTierId(tiers)).toBe('tier-2');
    const once = addTier(tiers)!;
    const twice = addTier(once.tiers)!;
    expect([once.id, twice.id]).toEqual(['tier-2', 'tier-4']);
    expect(new Set(twice.tiers.map(t => t.id)).size).toBe(5);
  });

  it('stops at the row limit', () => {
    let tiers = sampleTiers();
    while (canAddTier(tiers)) tiers = addTier(tiers)!.tiers;
    expect(tiers).toHaveLength(MAX_TIER_ROWS);
    expect(addTier(tiers)).toBeNull();
    expect(addTier(sampleTiers(), {maxRows: 6})).toBeNull();
    expect(addTier([])).toBeNull();
  });
});

describe('removeTier (#182)', () => {
  it('removes a row and moves its items to the end of Unranked', () => {
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

  it('never removes Unranked or the last ranked row', () => {
    const tiers = sampleTiers();
    expect(canRemoveTier(tiers, 5)).toBe(false);
    expect(removeTier(tiers, 5)).toBe(tiers);
    expect(removeTier(tiers, -1)).toBe(tiers);
    const two = [tier('tier-s', 'S', ['a']), tier('uncategorized', '', ['b'])];
    expect(canRemoveTier(two, 0)).toBe(false);
    expect(removeTier(two, 0)).toBe(two);
  });

  it('keeps every item when rows are added and removed at random (seeded)', () => {
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
