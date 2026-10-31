import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import {createTierCortex} from '@/lib/TierCortex';
import {V3_LIMITS} from '@/lib/state';
import {createTierListReducer, initialTierListState, loadList, type TierListAction} from '@/lib/tierListReducer';
import {itemDndId, rowDndId, tierItemsDndId} from '@/lib/dnd/ids';
import {MAX_TIER_ROWS} from '@/lib/dnd/moves';
import type Tier from '@/models/Tier';
import type {ItemSet} from '@/models/ItemSet';

/**
 * Checks for the list the editor hands to lib/dnd (components/DragDropTierList.tsx passes the
 * store's tiers to TierDragDrop). dnd-kit keeps draggables and droppables by id, and the moves
 * find rows and items by id, so every tier id and every item id must be unique in that list,
 * whatever link it came from: 5a makes repeated tier ids unique (A38) and keeps only the first
 * place of a repeated item id (A32). Rows added by hand (#182) must fit in a link.
 */

const lz = (value: unknown) => LZString.compressToEncodedURIComponent(JSON.stringify(value));
const cortex = createTierCortex();
const TANKS: ItemSet = {
  packageName: 'image-overwatch', packageDisplayName: 'OVERWATCH', tagName: 'tank', tagTitle: 'Tank',
  images: ['mau.webp', 'win.webp', 'sig.webp'],
};
const MAU = 'image-overwatch-mau.webp';
const WIN = 'image-overwatch-win.webp';

/** Every dnd-kit id of a list: rows, item areas and items. */
function dndIds(tiers: readonly Tier[]): string[] {
  return tiers.flatMap(tier => [rowDndId(tier.id), tierItemsDndId(tier.id), ...tier.items.map(item => itemDndId(item.id))]);
}

function expectUniqueIds(tiers: readonly Tier[]) {
  const tierIds = tiers.map(tier => tier.id);
  const itemIds = tiers.flatMap(tier => tier.items.map(item => item.id));
  expect(new Set(tierIds).size, `tier ids ${tierIds.join(', ')}`).toBe(tierIds.length);
  expect(new Set(itemIds).size, `item ids ${itemIds.join(', ')}`).toBe(itemIds.length);
  const ids = dndIds(tiers);
  expect(new Set(ids).size).toBe(ids.length);
}

/** The tiers the editor starts with for a link: what TierDragDrop gets first. */
function editorTiers(address: string | null): Tier[] {
  const encode = (title: string, tiers: Tier[]) => cortex.encodeListForURL(title, tiers);
  return initialTierListState(loadList(cortex, address, TANKS, 'Tanks'), address, encode).tiers;
}

const LINKS: [string, string][] = [
  ['a v2 link with a repeated tier id (A38)', lz({tiers: [
    {i: 'tier-s', n: 'S', t: [{i: MAU}]}, {i: 'tier-s', n: 'A', t: [{i: WIN}]}, {i: 'uncategorized', n: '', t: []},
  ]})],
  ['a v2 link with a repeated item id (A32)', lz({tiers: [
    {i: 'tier-s', n: 'S', t: [{i: MAU}, {i: MAU}]}, {i: 'tier-a', n: 'A', t: [{i: MAU}]}, {i: 'uncategorized', n: '', t: [{i: WIN}]},
  ]})],
  ['a v0 link with both', lz([
    {id: 'x', name: 'S', items: [{id: MAU}, {id: WIN}]}, {id: 'x', name: 'A', items: [{id: WIN}]}, {id: 'uncategorized', name: '', items: []},
  ])],
  ['a v3 link with both', `3.${lz({r: [['x', 'S', [MAU, MAU]], ['x', 'A', [WIN]], ['uncategorized', '', [WIN]]]})}`],
  ['a v3 link where an item id equals a tier id', `3.${lz({r: [['a', 'S', [{i: 'a', c: 'A'}]], ['uncategorized', '', []]]})}`],
];

describe('initialTierListState and createTierListReducer', () => {
  for (const [name, link] of LINKS) {
    it(`returns unique tier and item ids when the link is ${name}`, () => {
      const tiers = editorTiers(link);
      expect(tiers.length).toBeGreaterThan(1);
      expectUniqueIds(tiers);
    });
  }

  it('returns unique tier and item ids when a template opens without a link', () => {
    expectUniqueIds(editorTiers(null));
  });

  it('returns unique tier and item ids after each action when rows and items are added, moved and removed', () => {
    const encode = (title: string, tiers: Tier[]) => cortex.encodeListForURL(title, tiers);
    const reducer = createTierListReducer(encode);
    let state = initialTierListState(loadList(cortex, LINKS[0][1], TANKS, 'Tanks'), LINKS[0][1], encode);
    const actions: TierListAction[] = [
      {type: 'tierAdded'},
      {type: 'tierAdded'},
      {type: 'itemsAdded', items: [{id: MAU, content: 'Mauga'}, {id: 'k3j9x0a1b', content: 'my cat'}]},
      {type: 'tierMoved', from: 0, to: 2},
      {type: 'tierRemoved', tierId: state.tiers[1].id},
      {type: 'tierAdded'},
      {type: 'itemMoved', from: {tierId: state.tiers[0].id, index: 0}, to: {tierId: 'uncategorized', index: 0}},
    ];
    for (const action of actions) {
      state = reducer(state, action);
      expectUniqueIds(state.tiers);
    }
  });
});

describe('MAX_TIER_ROWS (#182)', () => {
  it('returns at most V3_LIMITS.maxRows when MAX_TIER_ROWS is compared with the v3 decoder cap', () => {
    expect(MAX_TIER_ROWS).toBeLessThanOrEqual(V3_LIMITS.maxRows);
  });
});
