import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import {createTierCortex} from '@/lib/TierCortex';
import {type ListLayout} from '@/lib/listLink';
import {decodeState} from '@/lib/state';
import {tierTemplates} from '@/models/Tier';
import type {ItemSet} from '@/models/ItemSet';
import {
  addressNeedsLoading,
  createTierListReducer,
  findItemToDelete,
  initialTierListState,
  itemsToAdd,
  LAYOUT_LINK_WRITE,
  type LayoutLinkWrite,
  loadList,
  stateParam,
  type TierListAction,
  type TierListState,
} from '@/lib/tierListReducer';
import {MAX_TIER_ROWS} from '@/lib/dnd/moves';
import sharedLinks from '../../fixtures/shared-links.json';

/**
 * The editor store (lib/tierListReducer.ts, run by contexts/TierContext.tsx). The address is
 * the save and the undo: every change to the list records exactly one write (a new history
 * entry), and opening a link, Back and Forward record none (A1).
 */

const lz = (value: unknown) => LZString.compressToEncodedURIComponent(JSON.stringify(value));
/** The list a written link holds (the app writes v3 links). */
const decoded = (link: string) => decodeState(link)!;

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

/** A v3 link of a five-row list, as the app writes it. */
function fiveRowV3Link(rows: Partial<Record<'S' | 'A' | 'B' | 'C' | 'F' | '', string[]>>, title = '', layout?: ListLayout) {
  const cortex = createTierCortex();
  return cortex.encodeListForURL(title, cortex.decodeTierStateFromURL(fiveRowLink(rows))!.tiers, layout);
}

function setup(address: string | null, cortex = createTierCortex(), layoutWrite: LayoutLinkWrite = LAYOUT_LINK_WRITE) {
  const encode = (title: string, tiers: TierListState['tiers'], layout: ListLayout) => cortex.encodeListForURL(title, tiers, layout);
  const reducer = createTierListReducer(encode, {layoutWrite});
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
    modes: () => state.writes.map(write => write.mode),
  };
  return store;
}

describe('initialTierListState with opened links (A1)', () => {
  const v0 = sharedLinks.find(link => link.format === 'v0')!;
  const v1 = sharedLinks.find(link => link.format === 'v1')!;
  const v2Titled = sharedLinks.find(link => link.id === 'link-002')!;

  for (const [name, link] of [['a v0 link', v0.state], ['a titled v1 link', v1.state], ['a titled v2 link', v2Titled.state],
    ['an untitled v2 link', fiveRowLink({S: [MAU]})], ['a plain template address', null], ['a damaged link', 'not-a-link']] as const) {
    it(`writes no link when it opens ${name}`, () => {
      const store = setup(link);
      expect(store.state.writes).toEqual([]);
      expect(store.state.address).toBe(link);
      // Seeing the same address again (a re-render) changes nothing.
      expect(addressNeedsLoading(store.state, link)).toBe(false);
    });
  }

  it('writes no link when it opens a titled link with an aliased id, and the new id on the next edit (A30)', () => {
    const cortex = createTierCortex({aliases: {'image-overwatch-old-mauga.webp': MAU}});
    const link = fiveRowLink({S: ['image-overwatch-old-mauga.webp']}, 'Renamed');
    const store = setup(link, cortex);
    expect(store.state.writes).toEqual([]);
    expect(store.contents()[0]).toEqual(['Mauga']);
    // The list on screen has another link than the address, but nothing is written until an edit.
    expect(store.state.link).not.toBe(link);

    store.dispatch({type: 'tierRenamed', index: 1, name: 'Also good'});
    expect(store.state.writes).toHaveLength(1);
    expect(decoded(store.links()[0]).tiers[0].items).toEqual([{id: MAU}]);
  });

  for (const [name, link] of [['a v3 link', fiveRowV3Link({S: [MAU]}, 'Titled', {labelPosition: 'top', showLabels: false})],
    ['an untitled v3 link', fiveRowV3Link({S: [MAU]})]] as const) {
    it(`writes no link when it opens ${name}`, () => {
      const store = setup(link);
      expect(store.state.writes).toEqual([]);
      expect(addressNeedsLoading(store.state, link)).toBe(false);
    });
  }

  it('returns the same link from a second encode when a shared link is opened, encoded and reopened', () => {
    const cortex = createTierCortex();
    for (const link of sharedLinks) {
      const opened = cortex.decodeTierStateFromURL(link.state)!;
      const written = cortex.encodeListForURL(opened.title ?? '', opened.tiers, opened.layout);
      const reopened = cortex.decodeTierStateFromURL(written)!;
      expect(cortex.encodeListForURL(reopened.title ?? '', reopened.tiers, reopened.layout), link.id).toBe(written);
    }
  });
});

describe('createTierListReducer writes', () => {
  it('writes one push per change, in order, when three changes are dispatched', () => {
    const store = setup(fiveRowLink({'': [MAU, WIN, SIG]}));
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-s', index: 0}});
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-a', index: 0}});
    store.dispatch({type: 'titleChanged', title: 'My picks'});

    expect(store.state.writes.map(write => write.id)).toEqual([0, 1, 2]);
    expect(store.modes()).toEqual(['push', 'push', 'push']);
    const [first, second, third] = store.links().map(decoded);
    expect(first.tiers[0].items).toEqual([{id: MAU}]);
    expect(second.tiers[1].items).toEqual([{id: WIN}]);
    expect(third.title).toBe('My picks');
    expect(store.state.link).toBe(store.links()[2]);
  });

  it('writes the page title into the link when a list without a title changes', () => {
    const store = setup(null);
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-s', index: 0}});
    expect(decoded(store.links()[0]).title).toBe(PAGE_TITLE);
  });

  it('writes the page title into the link when the title changes back to the page title', () => {
    const store = setup(fiveRowLink({S: [MAU]}, 'Custom'));
    store.dispatch({type: 'titleChanged', title: PAGE_TITLE});
    expect(decoded(store.links()[0]).title).toBe(PAGE_TITLE);
  });

  it('writes no link and returns the same state when a change leaves the link as it was', () => {
    const store = setup(fiveRowLink({S: [MAU, WIN]}));
    const before = store.state;
    store.dispatch({type: 'tierRenamed', index: 0, name: 'S'});
    store.dispatch({type: 'itemMoved', from: {tierId: 'tier-s', index: 1}, to: {tierId: 'tier-s', index: 1}});
    store.dispatch({type: 'titleChanged', title: PAGE_TITLE});
    expect(store.state).toBe(before);
  });

});

describe('createTierListReducer with short legacy upload ids (A42)', () => {
  it('returns one id legacy-ab3c9 when the address moves between v2 and v3 versions, so Undo adds nothing', () => {
    const names = ['S', 'A', 'B', 'C', 'F', ''];
    const ids = ['tier-s', 'tier-a', 'tier-b', 'tier-c', 'tier-f', 'uncategorized'];
    const v2 = lz({tiers: names.map((name, index) => ({i: ids[index], n: name,
      t: name === 'S' ? [{i: 'ab3c9', c: 'My cat'}] : name === '' ? [{i: MAU}] : []}))});
    const store = setup(v2);
    expect(store.state.tiers[0].items.map(item => item.id)).toEqual(['legacy-ab3c9']);

    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-a', index: 0}});
    const edited = store.links()[0];
    store.visit(edited);
    const deleted = findItemToDelete(store.state.tiers, 'legacy-ab3c9')!;
    store.dispatch({type: 'itemDeleted', itemId: 'legacy-ab3c9'});
    store.visit(store.links()[0]);

    // Back to the v3 version and to the v2 version: the upload has the same id in both.
    store.visit(edited);
    expect(store.state.tiers[0].items.map(item => item.id)).toEqual(['legacy-ab3c9']);
    store.visit(v2);
    expect(store.state.tiers[0].items.map(item => item.id)).toEqual(['legacy-ab3c9']);
    // Toast Undo of the delete: the list holds the upload already, so nothing changes.
    const before = store.state;
    store.dispatch({type: 'itemRestored', item: deleted.item, tierId: deleted.tierId});
    expect(store.state).toBe(before);
    expect(store.contents()[0]).toEqual(['My cat']);
  });
});

describe('createTierListReducer layout settings (A3)', () => {
  it('returns replace from LAYOUT_LINK_WRITE when read (owner decision, 2026-10-25)', () => {
    expect(LAYOUT_LINK_WRITE).toBe('replace');
  });

  it('writes a replace link with the layout when the label position or label visibility changes', () => {
    for (const address of [null, fiveRowLink({S: [MAU]}), fiveRowV3Link({S: [MAU]}, 'Titled')]) {
      const store = setup(address);
      store.dispatch({type: 'labelPositionChanged', labelPosition: 'top'});
      store.dispatch({type: 'labelsToggled'});
      expect(store.state.labelPosition).toBe('top');
      expect(store.state.showLabels).toBe(false);
      expect(store.modes()).toEqual(['replace', 'replace']);
      expect(decoded(store.links()[1])).toMatchObject({labelPosition: 'top', showLabels: false});
      // Choosing the same position again writes nothing.
      store.dispatch({type: 'labelPositionChanged', labelPosition: 'top'});
      expect(store.state.writes).toHaveLength(2);
    }
  });

  it('writes push links with the layout on screen when the list changes after a layout change', () => {
    const store = setup(fiveRowLink({'': [MAU, WIN]}));
    store.dispatch({type: 'labelPositionChanged', labelPosition: 'right'});
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-s', index: 0}});
    store.dispatch({type: 'rowTemplateChanged', template: tierTemplates['7rows']});
    expect(store.modes()).toEqual(['replace', 'push', 'push']);
    expect(decoded(store.links()[2])).toMatchObject({rowTemplate: '7rows', labelPosition: 'right'});
  });

  it('writes a push link when the layout changes and layoutWrite is push', () => {
    const store = setup(fiveRowLink({S: [MAU]}), createTierCortex(), 'push');
    store.dispatch({type: 'labelsToggled'});
    expect(store.modes()).toEqual(['push']);
    expect(decoded(store.links()[0]).showLabels).toBe(false);
  });

  it('writes no link until the next list change when the layout changes and layoutWrite is next-edit', () => {
    const store = setup(fiveRowLink({'': [MAU]}), createTierCortex(), 'next-edit');
    store.dispatch({type: 'labelPositionChanged', labelPosition: 'top'});
    expect(store.state.writes).toEqual([]);
    expect(store.state.labelPosition).toBe('top');
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-s', index: 0}});
    expect(store.modes()).toEqual(['push']);
    expect(decoded(store.links()[0]).labelPosition).toBe('top');
  });

  it('returns the v3 link layout when it opens, and left with labels when a legacy link or a template opens', () => {
    const v3 = setup(fiveRowV3Link({S: [MAU]}, '', {labelPosition: 'top', showLabels: false}));
    expect([v3.state.labelPosition, v3.state.showLabels]).toEqual(['top', false]);
    for (const address of [null, fiveRowLink({S: [MAU]}), 'not-a-link']) {
      const store = setup(address);
      expect([store.state.labelPosition, store.state.showLabels]).toEqual(['left', true]);
    }
  });

  it('returns the layout on screen, writing no link, when the address goes Back and Forward (owner, 2026-10-25)', () => {
    // The owner's example: Mauga to S, Winston to A, labels on Top, then Back.
    const start = fiveRowV3Link({'': [MAU, WIN]});
    const store = setup(start);
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-s', index: 0}});
    const mauga = store.links()[0];
    store.visit(mauga);
    store.dispatch({type: 'itemMoved', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-a', index: 0}});
    store.visit(store.links()[0]);
    store.dispatch({type: 'labelPositionChanged', labelPosition: 'top'});
    const winstonOnTop = store.links()[0];
    store.visit(winstonOnTop);
    expect(decoded(winstonOnTop).labelPosition).toBe('top');

    // Back: the entry before holds labels on the left. Winston leaves A, the labels stay on Top.
    store.visit(mauga);
    expect(store.contents()).toEqual([['Mauga'], [], [], [], [], ['Winston']]);
    expect(store.state.labelPosition).toBe('top');
    expect(store.state.writes).toEqual([]);
    // Forward and Back to the start: still on Top, nothing written.
    store.visit(winstonOnTop);
    store.visit(start);
    expect(store.state.labelPosition).toBe('top');
    expect(store.state.writes).toEqual([]);
  });
});

describe('createTierListReducer address changes', () => {
  it('returns the same tiers and writes no link when an own write arrives in the address', () => {
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

  it('returns the link with + from stateParam, and no reload, when the address reads + as spaces', () => {
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

  it('writes no link when a change results in the address link and no write waits', () => {
    // A link without a title shows the page title; clearing the title gives back that link.
    const untitled = fiveRowV3Link({S: [MAU]});
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

  it('returns the list of the address and writes no link when the address goes Back and Forward', () => {
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

  it('returns the template list and the page title when the address goes Back to the plain template', () => {
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

  it('returns the page title when the address goes Back to an untitled link after a titled one', () => {
    const untitled = fiveRowLink({S: [MAU]});
    const store = setup(untitled);
    store.dispatch({type: 'titleChanged', title: 'My picks'});
    store.visit(store.links()[0]);
    store.visit(untitled);
    expect(store.state.title).toBe(PAGE_TITLE);
    expect(store.state.writes).toEqual([]);
  });

  it('returns addressHoldsList true only when the address has a decodable link (the long-link warning)', () => {
    expect(setup(fiveRowLink({S: [MAU]})).state.addressHoldsList).toBe(true);
    expect(setup('not-a-link').state.addressHoldsList).toBe(false);
    expect(setup(null).state.addressHoldsList).toBe(false);
  });
});

describe('createTierListReducer list actions', () => {
  it('returns the row contents moved and the names in place when tierMoved runs', () => {
    const store = setup(fiveRowLink({S: [MAU], A: [WIN]}));
    store.dispatch({type: 'tierMoved', from: 0, to: 1});
    expect(store.names()).toEqual(['S', 'A', 'B', 'C', 'F', '']);
    expect(store.contents().slice(0, 2)).toEqual([['Winston'], ['Mauga']]);
    expect(store.state.tiers.map(tier => tier.id).slice(0, 2)).toEqual(['tier-a', 'tier-s']);
  });

  it('writes one link with an empty Tier 6 row above Unranked when tierAdded runs', () => {
    const store = setup(fiveRowLink({S: [MAU], '': [WIN]}));
    store.dispatch({type: 'tierAdded'});
    expect(store.names()).toEqual(['S', 'A', 'B', 'C', 'F', 'Tier 6', '']);
    expect(store.contents()).toEqual([['Mauga'], [], [], [], [], [], ['Winston']]);
    expect(store.state.tiers[5].id).toBe('tier-1');
    expect(store.state.writes).toHaveLength(1);
    // The link keeps the new row.
    expect(decoded(store.links()[0]).tiers.map(tier => tier.name)).toEqual(['S', 'A', 'B', 'C', 'F', 'Tier 6', '']);
  });

  it('writes no link when tierAdded runs at MAX_TIER_ROWS rows', () => {
    const store = setup(fiveRowLink({}));
    while (store.state.tiers.length < MAX_TIER_ROWS) store.dispatch({type: 'tierAdded'});
    const writes = store.state.writes.length;
    const full = store.dispatch({type: 'tierAdded'});
    expect(full.tiers).toHaveLength(MAX_TIER_ROWS);
    expect(full.writes).toHaveLength(writes);
  });

  it('writes one link with the items at the end of Unranked when tierRemoved runs', () => {
    const store = setup(fiveRowLink({S: [MAU], B: [WIN, SIG]}));
    store.dispatch({type: 'tierRemoved', tierId: 'tier-b'});
    expect(store.names()).toEqual(['S', 'A', 'C', 'F', '']);
    expect(store.contents()).toEqual([['Mauga'], [], [], [], ['Winston', 'Sigma']]);
    expect(store.state.writes).toHaveLength(1);
  });

  it('writes no link when tierRemoved targets Unranked, an unknown row or the last ranked row', () => {
    const store = setup(fiveRowLink({S: [MAU]}));
    store.dispatch({type: 'tierRemoved', tierId: 'uncategorized'});
    store.dispatch({type: 'tierRemoved', tierId: 'nope'});
    expect(store.state.writes).toHaveLength(0);
    for (const tierId of ['tier-a', 'tier-b', 'tier-c', 'tier-f', 'tier-s']) store.dispatch({type: 'tierRemoved', tierId});
    expect(store.names()).toEqual(['S', '']);
    expect(store.contents()).toEqual([['Mauga'], []]);
    expect(store.state.writes).toHaveLength(4);
  });

  it('writes a new link with the ranking back when tiersRestored runs after rankingsReset (toast Undo)', () => {
    const store = setup(fiveRowLink({S: [MAU], A: [WIN], '': [SIG]}));
    const before = store.state.tiers;
    store.dispatch({type: 'rankingsReset'});
    expect(store.contents()).toEqual([[], [], [], [], [], ['Mauga', 'Sigma', 'Winston']]);
    store.dispatch({type: 'tiersRestored', tiers: before});
    expect(store.contents()).toEqual([['Mauga'], ['Winston'], [], [], [], ['Sigma']]);
    // Undo pushes a new entry, it does not go back (A6).
    expect(store.state.writes).toHaveLength(2);
  });

  it('writes a new link with the items back when tiersRestored runs after allItemsRemoved (toast Undo)', () => {
    const store = setup(fiveRowLink({S: [MAU]}));
    const before = store.state.tiers;
    store.dispatch({type: 'allItemsRemoved'});
    expect(store.contents().flat()).toEqual([]);
    store.dispatch({type: 'tiersRestored', tiers: before});
    expect(store.contents()[0]).toEqual(['Mauga']);
    expect(store.state.writes).toHaveLength(2);
  });

  it('returns an Unranked row with every item when rankingsReset runs on a list without one', () => {
    const store = setup(lz({tiers: [{i: 'tier-s', n: 'S', t: [{i: WIN}, {i: MAU}]}]}));
    store.dispatch({type: 'rankingsReset'});
    expect(store.state.tiers).toEqual([
      {id: 'tier-s', name: 'S', items: []},
      {id: 'uncategorized', name: '', items: [expect.objectContaining({id: MAU}), expect.objectContaining({id: WIN})]},
    ]);
  });

  it('returns the item at the end of its tier when itemRestored runs after itemDeleted', () => {
    const store = setup(fiveRowLink({S: [MAU, WIN]}));
    const deleted = findItemToDelete(store.state.tiers, MAU)!;
    expect(deleted.tierId).toBe('tier-s');
    store.dispatch({type: 'itemDeleted', itemId: MAU});
    expect(store.contents()[0]).toEqual(['Winston']);
    store.dispatch({type: 'itemRestored', item: deleted.item, tierId: deleted.tierId});
    expect(store.contents()[0]).toEqual(['Winston', 'Mauga']);
    expect(findItemToDelete(store.state.tiers, 'missing')).toBeNull();
  });

  it('returns only items with a new id and label when itemsAdded runs, and itemsRemoved removes only those', () => {
    const cortex = createTierCortex();
    const store = setup(fiveRowLink({S: [MAU]}), cortex);
    const newItems = [...cortex.resolveItemsFromPackage('image-overwatch', ['mau.webp', 'win.webp']), {id: 'k3j9x0a1b', content: 'Mauga'}];
    const added = itemsToAdd(store.state.tiers, newItems);
    expect(added.map(item => item.content)).toEqual(['Winston']);

    store.dispatch({type: 'itemsAdded', items: newItems});
    expect(store.contents()).toEqual([['Mauga'], [], [], [], [], ['Winston']]);
    // Undo from the toast: Mauga was ranked before the add, so it stays.
    store.dispatch({type: 'itemsRemoved', itemIds: added.map(item => item.id)});
    expect(store.contents()).toEqual([['Mauga'], [], [], [], [], []]);
  });

  it('returns the same state when itemsAdded gets only items already in the list', () => {
    const cortex = createTierCortex();
    const store = setup(fiveRowLink({S: [MAU]}), cortex);
    const before = store.state;
    store.dispatch({type: 'itemsAdded', items: cortex.resolveItemsFromPackage('image-overwatch', ['mau.webp'])});
    expect(store.state).toBe(before);
    expect(itemsToAdd(store.state.tiers, cortex.resolveItemsFromPackage('image-overwatch', ['mau.webp']))).toEqual([]);
  });

  it('returns the same state when itemRestored runs and the item is in the list again', () => {
    const start = fiveRowLink({S: [MAU, WIN]});
    const store = setup(start);
    const deleted = findItemToDelete(store.state.tiers, MAU)!;
    store.dispatch({type: 'itemDeleted', itemId: MAU});
    store.visit(store.links()[0]);
    // Back to the version that still has Mauga, then Undo from the toast.
    store.visit(start);
    const before = store.state;
    store.dispatch({type: 'itemRestored', item: deleted.item, tierId: deleted.tierId});
    expect(store.state).toBe(before);
    expect(store.contents()[0]).toEqual(['Mauga', 'Winston']);
  });

  it('returns items in rows with the same id and the rest in Unranked when rowTemplateChanged runs', () => {
    const store = setup(fiveRowLink({S: [MAU], C: [WIN], F: [SIG]}));
    store.dispatch({type: 'rowTemplateChanged', template: tierTemplates['3rows']});
    expect(store.names()).toEqual(['S', 'A', 'B', '']);
    expect(store.contents()).toEqual([['Mauga'], [], [], ['Winston', 'Sigma']]);
    store.dispatch({type: 'rowTemplateChanged', template: tierTemplates['7rows']});
    expect(store.names()).toEqual(['SS', 'S', 'A', 'B', 'C', 'D', 'F', '']);
    // Template tiers are never changed by a switch.
    expect(tierTemplates['3rows'].every(tier => tier.items.length === 0)).toBe(true);
  });

  it('returns new state and leaves the input tiers unchanged when each action runs', () => {
    const store = setup(fiveRowLink({S: [MAU, WIN], '': [SIG]}));
    const snapshot = JSON.stringify(store.state.tiers);
    const tiers = store.state.tiers;
    for (const action of [
      {type: 'itemMoved', from: {tierId: 'tier-s', index: 0}, to: {tierId: 'uncategorized', index: 0}},
      {type: 'itemMoved', from: {tierId: 'tier-s', index: 0}, to: {tierId: 'tier-s', index: 1}},
      {type: 'tierMoved', from: 0, to: 5},
      {type: 'tierAdded'},
      {type: 'tierRemoved', tierId: 'tier-s'},
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
