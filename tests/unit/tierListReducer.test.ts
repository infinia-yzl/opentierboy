import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import TierCortex from '@/lib/TierCortex';
import {tierTemplates} from '@/models/Tier';
import type {ItemSet} from '@/models/ItemSet';
import {
  addressNeedsLoading,
  createTierListReducer,
  findItemToDelete,
  initialTierListState,
  loadList,
  stateParam,
  type TierListAction,
  type TierListState,
} from '@/lib/tierListReducer';
import sharedLinks from '../fixtures/shared-links.json';

/**
 * The editor store (lib/tierListReducer.ts, run by contexts/TierContext.tsx). The address is
 * the save and the undo: every change to the list records exactly one write (a new history
 * entry), and opening a link, Back and Forward record none (A1).
 */

const lz = (value: unknown) => LZString.compressToEncodedURIComponent(JSON.stringify(value));
const json = (link: string) => JSON.parse(LZString.decompressFromEncodedURIComponent(link)!);

const TANKS: ItemSet = {
  packageName: 'image-overwatch', packageDisplayName: 'OVERWATCH', tagName: 'tank', tagTitle: 'Tank',
  images: ['mau.webp', 'win.webp', 'sig.webp'],
};
const PAGE_TITLE = 'OVERWATCH - Tank';
const MAU = 'image-overwatch-mau.webp';
const WIN = 'image-overwatch-win.webp';
const SIG = 'image-overwatch-sig.webp';

/** A v2 link in the five-row template: S, A, B, C, F and Unranked. */
function fiveRowLink(rows: Partial<Record<'S' | 'A' | 'B' | 'C' | 'F' | '', string[]>>, title?: string) {
  const ids = ['tier-s', 'tier-a', 'tier-b', 'tier-c', 'tier-f', 'uncategorized'];
  const names = ['S', 'A', 'B', 'C', 'F', ''] as const;
  const state = {tiers: names.map((name, index) => ({i: ids[index], n: name, t: (rows[name] ?? []).map(i => ({i}))})), ...(title ? {title} : {})};
  return lz(state);
}

function setup(address: string | null, cortex = new TierCortex()) {
  const encode = (title: string, tiers: TierListState['tiers']) => cortex.encodeListForURL(title, tiers);
  const reducer = createTierListReducer(encode);
  const load = (to: string | null) => loadList(cortex, to, TANKS, PAGE_TITLE);
  let state = initialTierListState(load(address), address, encode);
  const store = {
    get state() {
      return state;
    },
    dispatch(action: TierListAction) {
      state = reducer(state, action);
      return state;
    },
    /** The address changed (open, Back, Forward, an own write arriving), as the provider reports it. */
    visit(to: string | null) {
      const loaded = addressNeedsLoading(state, to) ? load(to) : null;
      return store.dispatch({type: 'addressChanged', address: to, loaded});
    },
    names: () => state.tiers.map(tier => tier.name),
    contents: () => state.tiers.map(tier => tier.items.map(item => item.content)),
    links: () => state.writes.map(write => write.link),
  };
  return store;
}

describe('opening a link writes nothing (A1)', () => {
  const v0 = sharedLinks.find(link => link.format === 'v0')!;
  const v1 = sharedLinks.find(link => link.format === 'v1')!;
  const v2Titled = sharedLinks.find(link => link.id === 'link-002')!;

  for (const [name, link] of [['a v0 link', v0.state], ['a titled v1 link', v1.state], ['a titled v2 link', v2Titled.state],
    ['an untitled v2 link', fiveRowLink({S: [MAU]})], ['a plain template address', null], ['a damaged link', 'not-a-link']] as const) {
    it(name, () => {
      const store = setup(link);
      expect(store.state.writes).toEqual([]);
      expect(store.state.address).toBe(link);
      // Seeing the same address again (a re-render) changes nothing.
      expect(addressNeedsLoading(store.state, link)).toBe(false);
    });
  }

  it('a titled link with an aliased id, whose next save writes the new id (A30)', () => {
    const cortex = new TierCortex({aliases: {'image-overwatch-old-mauga.webp': MAU}});
    const link = fiveRowLink({S: ['image-overwatch-old-mauga.webp']}, 'Renamed');
    const store = setup(link, cortex);
    expect(store.state.writes).toEqual([]);
    expect(store.contents()[0]).toEqual(['Mauga']);
    // The list on screen has another link than the address, but nothing is written until an edit.
    expect(store.state.link).not.toBe(link);

    store.dispatch({type: 'tierRenamed', index: 1, name: 'Also good'});
    expect(store.state.writes).toHaveLength(1);
    expect(json(store.links()[0]).tiers[0].t).toEqual([{i: MAU}]);
  });

  it('decoding and encoding a v2 link written by the app gives the same link', () => {
    for (const link of sharedLinks.filter(entry => entry.format === 'v2')) {
      const cortex = new TierCortex();
      const decoded = cortex.decodeTierStateFromURL(link.state)!;
      // The fixtures store the links as URLSearchParams read them: with spaces for '+'.
      expect(cortex.encodeListForURL(decoded.title ?? '', decoded.tiers), link.id).toBe(link.state.replace(/ /g, '+'));
    }
  });
});

describe('every change to the list writes one new link', () => {
  it('in order, never merged', () => {
    const store = setup(fiveRowLink({'': [MAU, WIN, SIG]}));
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-s', index: 0}});
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-a', index: 0}});
    store.dispatch({type: 'titleChanged', title: 'My picks'});

    expect(store.state.writes.map(write => write.id)).toEqual([0, 1, 2]);
    const [first, second, third] = store.links().map(json);
    expect(first.tiers[0].t).toEqual([{i: MAU}]);
    expect(second.tiers[1].t).toEqual([{i: WIN}]);
    expect(third.title).toBe('My picks');
    expect(store.state.link).toBe(store.links()[2]);
  });

  it('writes the page title into the link of a list without one, as before', () => {
    const store = setup(null);
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-s', index: 0}});
    expect(json(store.links()[0]).title).toBe(PAGE_TITLE);
  });

  it('writes a title set back to the page title', () => {
    const store = setup(fiveRowLink({S: [MAU]}, 'Custom'));
    store.dispatch({type: 'titleChanged', title: PAGE_TITLE});
    expect(json(store.links()[0]).title).toBe(PAGE_TITLE);
  });

  it('writes nothing for a change that leaves the link as it was', () => {
    const store = setup(fiveRowLink({S: [MAU, WIN]}));
    const before = store.state;
    store.dispatch({type: 'tierRenamed', index: 0, name: 'S'});
    store.dispatch({type: 'itemMoved', from: {tierId: 'tier-s', index: 1}, to: {tierId: 'tier-s', index: 1}});
    store.dispatch({type: 'titleChanged', title: PAGE_TITLE});
    expect(store.state).toBe(before);
  });

  it('writes nothing for the layout settings', () => {
    for (const address of [null, fiveRowLink({S: [MAU]}), fiveRowLink({S: [MAU]}, 'Titled')]) {
      const store = setup(address);
      store.dispatch({type: 'labelPositionChanged', labelPosition: 'top'});
      store.dispatch({type: 'labelsToggled'});
      expect(store.state.labelPosition).toBe('top');
      expect(store.state.showLabels).toBe(false);
      expect(store.state.writes).toEqual([]);
    }
  });
});

describe('the address', () => {
  it('an own write arriving in the address loads nothing', () => {
    const store = setup(fiveRowLink({'': [MAU, WIN]}));
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-s', index: 0}});
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-a', index: 0}});
    const [first, second] = store.links();
    const tiers = store.state.tiers;

    // The first write arrives while the second is still on its way: the list stays as it is.
    store.visit(first);
    expect(store.state.tiers).toBe(tiers);
    expect(store.links()).toEqual([second]);
    store.visit(second);
    expect(store.state.tiers).toBe(tiers);
    expect(store.state.writes).toEqual([]);
    expect(store.state.addressHoldsList).toBe(true);
  });

  it('recognises an own write that the address reports with spaces for "+"', () => {
    // URLSearchParams reads '+' as a space; the provider puts it back with stateParam().
    const store = setup(fiveRowLink({'': [MAU, WIN, SIG]}));
    let index = 0;
    while (!store.state.writes.some(write => write.link.includes('+'))) {
      store.dispatch({type: 'titleChanged', title: `Title ${index++}`});
    }
    const withPlus = store.state.writes.find(write => write.link.includes('+'))!.link;
    const asRead = withPlus.replace(/\+/g, ' ');
    expect(stateParam(asRead)).toBe(withPlus);
    expect(stateParam(null)).toBeNull();
    expect(stateParam(undefined)).toBeNull();
    expect(addressNeedsLoading(store.state, stateParam(asRead))).toBe(false);
  });

  it('writes nothing when a change gives back the link the address holds, with no write waiting', () => {
    // A link without a title shows the page title; clearing the title gives back that link.
    const untitled = fiveRowLink({S: [MAU]});
    const store = setup(untitled);
    store.dispatch({type: 'titleChanged', title: ''});
    expect(store.state.link).toBe(untitled);
    expect(store.state.writes).toEqual([]);
    expect(store.state.title).toBe('');

    // With a write still on its way, the same change is a write: the address will move on.
    store.dispatch({type: 'titleChanged', title: 'Mine'});
    store.dispatch({type: 'titleChanged', title: ''});
    expect(store.links()).toHaveLength(2);
    expect(store.links()[1]).toBe(untitled);
  });

  it('Back and Forward show the list of the address and write nothing', () => {
    const start = fiveRowLink({'': [MAU, WIN]});
    const store = setup(start);
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-s', index: 0}});
    const edited = store.links()[0];
    store.visit(edited);

    store.visit(start);
    expect(store.contents()).toEqual([[], [], [], [], [], ['Mauga', 'Winston']]);
    store.visit(edited);
    expect(store.contents()).toEqual([['Mauga'], [], [], [], [], ['Winston']]);
    expect(store.state.writes).toEqual([]);
    expect(store.state.nextWriteId).toBe(1);
  });

  it('Back to the plain template address shows the template\'s starting list and title', () => {
    const store = setup(null);
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-s', index: 0}});
    store.dispatch({type: 'titleChanged', title: 'Mine'});
    store.dispatch({type: 'labelPositionChanged', labelPosition: 'right'});
    store.visit(store.links()[0]);
    store.visit(store.links()[0]);

    store.visit(null);
    expect(store.contents()).toEqual([[], [], [], [], [], ['Mauga', 'Winston', 'Sigma']]);
    expect(store.state.title).toBe(PAGE_TITLE);
    expect(store.state.writes).toEqual([]);
    // Layout settings are not part of the list: they stay.
    expect(store.state.labelPosition).toBe('right');
  });

  it('a link without a title shows the page title after a titled one', () => {
    const untitled = fiveRowLink({S: [MAU]});
    const store = setup(untitled);
    store.dispatch({type: 'titleChanged', title: 'My picks'});
    store.visit(store.links()[0]);
    store.visit(untitled);
    expect(store.state.title).toBe(PAGE_TITLE);
    expect(store.state.writes).toEqual([]);
  });

  it('knows whether the address holds the list on screen (the long-link warning)', () => {
    expect(setup(fiveRowLink({S: [MAU]})).state.addressHoldsList).toBe(true);
    expect(setup('not-a-link').state.addressHoldsList).toBe(false);
    expect(setup(null).state.addressHoldsList).toBe(false);
  });
});

describe('list changes', () => {
  it('moving a row moves its items and keeps the names in place', () => {
    const store = setup(fiveRowLink({S: [MAU], A: [WIN]}));
    store.dispatch({type: 'tierMoved', from: 0, to: 1});
    expect(store.names()).toEqual(['S', 'A', 'B', 'C', 'F', '']);
    expect(store.contents().slice(0, 2)).toEqual([['Winston'], ['Mauga']]);
    expect(store.state.tiers.map(tier => tier.id).slice(0, 2)).toEqual(['tier-a', 'tier-s']);
  });

  it('Reset, then Undo from the toast, restores the ranking as a new change', () => {
    const store = setup(fiveRowLink({S: [MAU], A: [WIN], '': [SIG]}));
    const before = store.state.tiers;
    store.dispatch({type: 'rankingsReset'});
    expect(store.contents()).toEqual([[], [], [], [], [], ['Mauga', 'Sigma', 'Winston']]);
    store.dispatch({type: 'tiersRestored', tiers: before});
    expect(store.contents()).toEqual([['Mauga'], ['Winston'], [], [], [], ['Sigma']]);
    // Undo pushes a new entry, it does not go back (A6).
    expect(store.state.writes).toHaveLength(2);
  });

  it('Remove All, then Undo from the toast, brings the items back', () => {
    const store = setup(fiveRowLink({S: [MAU]}));
    const before = store.state.tiers;
    store.dispatch({type: 'allItemsRemoved'});
    expect(store.contents().flat()).toEqual([]);
    store.dispatch({type: 'tiersRestored', tiers: before});
    expect(store.contents()[0]).toEqual(['Mauga']);
    expect(store.state.writes).toHaveLength(2);
  });

  it('Reset adds an Unranked row to a list without one', () => {
    const store = setup(lz({tiers: [{i: 'tier-s', n: 'S', t: [{i: WIN}, {i: MAU}]}]}));
    store.dispatch({type: 'rankingsReset'});
    expect(store.state.tiers).toEqual([
      {id: 'tier-s', name: 'S', items: []},
      {id: 'uncategorized', name: '', items: [expect.objectContaining({id: MAU}), expect.objectContaining({id: WIN})]},
    ]);
  });

  it('deleting an item and restoring it puts it at the end of its tier', () => {
    const store = setup(fiveRowLink({S: [MAU, WIN]}));
    const deleted = findItemToDelete(store.state.tiers, MAU)!;
    expect(deleted.tierId).toBe('tier-s');
    store.dispatch({type: 'itemDeleted', itemId: MAU});
    expect(store.contents()[0]).toEqual(['Winston']);
    store.dispatch({type: 'itemRestored', item: deleted.item, tierId: deleted.tierId});
    expect(store.contents()[0]).toEqual(['Winston', 'Mauga']);
    expect(findItemToDelete(store.state.tiers, 'missing')).toBeNull();
  });

  it('adding items leaves out items the list holds (same id or label), and Undo removes the added ids', () => {
    const cortex = new TierCortex();
    const store = setup(fiveRowLink({S: [MAU]}), cortex);
    const added = [...cortex.resolveItemsFromPackage('image-overwatch', ['mau.webp', 'win.webp']), {id: 'k3j9x0a1b', content: 'Mauga'}];
    store.dispatch({type: 'itemsAdded', items: added});
    expect(store.contents()).toEqual([['Mauga'], [], [], [], [], ['Winston']]);
    store.dispatch({type: 'itemsRemoved', itemIds: added.map(item => item.id)});
    expect(store.contents().flat()).toEqual([]);
  });

  it('switching row templates keeps items in tiers with the same id and moves the rest to Unranked', () => {
    const store = setup(fiveRowLink({S: [MAU], C: [WIN], F: [SIG]}));
    store.dispatch({type: 'rowTemplateChanged', template: tierTemplates['3rows']});
    expect(store.names()).toEqual(['S', 'A', 'B', '']);
    expect(store.contents()).toEqual([['Mauga'], [], [], ['Winston', 'Sigma']]);
    store.dispatch({type: 'rowTemplateChanged', template: tierTemplates['7rows']});
    expect(store.names()).toEqual(['SS', 'S', 'A', 'B', 'C', 'D', 'F', '']);
    // Template tiers are never changed by a switch.
    expect(tierTemplates['3rows'].every(tier => tier.items.length === 0)).toBe(true);
  });

  it('never changes a list it was given', () => {
    const store = setup(fiveRowLink({S: [MAU, WIN], '': [SIG]}));
    const snapshot = JSON.stringify(store.state.tiers);
    const tiers = store.state.tiers;
    for (const action of [
      {type: 'itemMoved', from: {tierId: 'tier-s', index: 0}, to: {tierId: 'uncategorized', index: 0}},
      {type: 'itemMoved', from: {tierId: 'tier-s', index: 0}, to: {tierId: 'tier-s', index: 1}},
      {type: 'tierMoved', from: 0, to: 5},
      {type: 'itemDeleted', itemId: WIN},
      {type: 'itemsAdded', items: [{id: 'new-one', content: 'New'}]},
      {type: 'rankingsReset'},
      {type: 'allItemsRemoved'},
      {type: 'rowTemplateChanged', template: tierTemplates['3rows']},
    ] as TierListAction[]) {
      createTierListReducer(() => 'x')(store.state, action);
    }
    expect(store.state.tiers).toBe(tiers);
    expect(JSON.stringify(tiers)).toBe(snapshot);
  });
});
