import LZString from 'lz-string';
import {describe, expect, it, vi} from 'vitest';
import {createTierCortex} from '@/lib/TierCortex';
import {type ListLayout} from '@/lib/listLink';
import {decodeState} from '@/lib/state';
import type Tier from '@/models/Tier';
import {tierTemplates} from '@/models/Tier';
import type {ItemSet} from '@/models/ItemSet';
import {
  createListStore,
  DEFAULT_LAYOUT,
  findItemToDelete,
  itemsToAdd,
  LAYOUT_LINK_WRITE,
  type LayoutLinkWrite,
  type ListChange,
  listChanges,
  loadList,
  stateParam,
} from '@/lib/tierList';
import {MAX_TIER_ROWS} from '@/lib/dnd/moves';
import {itemDndId, rowDndId, tierItemsDndId} from '@/lib/dnd/ids';
import sharedLinks from '../../fixtures/shared-links.json';

const lz = (value: unknown) => LZString.compressToEncodedURIComponent(JSON.stringify(value));
const decoded = (link: string) => decodeState(link)!;

const TANKS: ItemSet = {
  packageName: 'image-overwatch', packageDisplayName: 'OVERWATCH', tagName: 'tank', tagTitle: 'Tank',
  images: ['mau.webp', 'win.webp', 'sig.webp'],
};
const PAGE_TITLE = 'OVERWATCH - Tank';
const MAU = 'image-overwatch-mau.webp';
const WIN = 'image-overwatch-win.webp';
const SIG = 'image-overwatch-sig.webp';

function fiveRowLink(rows: Partial<Record<'S' | 'A' | 'B' | 'C' | 'F' | '', string[]>>, title?: string) {
  const ids = ['tier-s', 'tier-a', 'tier-b', 'tier-c', 'tier-f', 'uncategorized'];
  const names = ['S', 'A', 'B', 'C', 'F', ''] as const;
  const state = {tiers: names.map((name, index) => ({i: ids[index], n: name, t: (rows[name] ?? []).map(i => ({i}))})), ...(title ? {title} : {})};
  return lz(state);
}

function fiveRowV3Link(rows: Partial<Record<'S' | 'A' | 'B' | 'C' | 'F' | '', string[]>>, title = '', layout?: ListLayout) {
  const cortex = createTierCortex();
  return cortex.encodeListForURL(title, cortex.decodeTierStateFromURL(fiveRowLink(rows))!.tiers, layout);
}

function setup(address: string | null, cortex = createTierCortex(), layoutWrite: LayoutLinkWrite = LAYOUT_LINK_WRITE) {
  const load = vi.fn((to: string | null) => loadList(cortex, to, TANKS, PAGE_TITLE));
  const encode = vi.fn((title: string, tiers: Tier[], layout: ListLayout) => cortex.encodeListForURL(title, tiers, layout));
  const store = createListStore(load, encode);
  let at = address;
  let layout = store.read(address).layout ?? DEFAULT_LAYOUT;
  const writes: {link: string; mode: string}[] = [];
  const page = {
    store, load, encode, writes,
    get address() {
      return at;
    },
    get list() {
      return store.read(at);
    },
    get layout() {
      return layout;
    },
    edit(change: ListChange) {
      const written = store.edit(at, change, layout);
      if (written) {
        writes.push({link: written.link, mode: written.mode});
        at = written.link;
      }
      return written;
    },
    changeLayout(changes: Partial<ListLayout>) {
      const next = {...layout, ...changes};
      if (next.labelPosition === layout.labelPosition && next.showLabels === layout.showLabels) return;
      layout = next;
      const written = store.relayout(at, next, layoutWrite);
      if (written) {
        writes.push({link: written.link, mode: written.mode});
        at = written.link;
      }
    },
    visit(to: string | null) {
      at = to;
    },
    names: () => store.read(at).tiers.map(tier => tier.name),
    contents: () => store.read(at).tiers.map(tier => tier.items.map(item => item.content)),
    links: () => writes.map(write => write.link),
    modes: () => writes.map(write => write.mode),
  };
  return page;
}

describe('createListStore with opened links (A1)', () => {
  const v0 = sharedLinks.find(link => link.format === 'v0')!;
  const v1 = sharedLinks.find(link => link.format === 'v1')!;
  const v2Titled = sharedLinks.find(link => link.id === 'link-002')!;

  for (const [name, link] of [['a v0 link', v0.state], ['a titled v1 link', v1.state], ['a titled v2 link', v2Titled.state],
    ['an untitled v2 link', fiveRowLink({S: [MAU]})], ['a plain template address', null], ['a damaged link', 'not-a-link'],
    ['a v3 link', fiveRowV3Link({S: [MAU]}, 'Titled', {labelPosition: 'top', showLabels: false})],
    ['an untitled v3 link', fiveRowV3Link({S: [MAU]})]] as const) {
    it(`returns the same list without decoding again when it reads ${name} twice`, () => {
      const page = setup(link);
      const first = page.list;
      expect(page.list).toBe(first);
      expect(page.load).toHaveBeenCalledTimes(1);
      expect(page.encode).not.toHaveBeenCalled();
    });
  }

  it('returns decoded true only when the address has a decodable link (the long-link warning)', () => {
    expect(setup(fiveRowLink({S: [MAU]})).list.decoded).toBe(true);
    expect(setup(null).list.decoded).toBe(false);
    expect(setup('not-a-link').list.decoded).toBe(false);
  });

  it('writes the new id on the next edit when it opens a titled link with an aliased id (A30)', () => {
    const cortex = createTierCortex({aliases: {'image-overwatch-old-mauga.webp': MAU}});
    const page = setup(fiveRowLink({S: ['image-overwatch-old-mauga.webp']}, 'Renamed'), cortex);
    expect(page.contents()[0]).toEqual(['Mauga']);
    page.edit(listChanges.renameTier(1, 'Also good'));
    expect(page.writes).toHaveLength(1);
    expect(decoded(page.links()[0]).tiers[0].items).toEqual([{id: MAU}]);
  });

  it('returns the same link from a second encode when a shared link is opened, encoded and reopened', () => {
    const cortex = createTierCortex();
    for (const link of sharedLinks) {
      const opened = cortex.decodeTierStateFromURL(link.state)!;
      const written = cortex.encodeListForURL(opened.title ?? '', opened.tiers, opened.layout);
      const reopened = cortex.decodeTierStateFromURL(written)!;
      expect(cortex.encodeListForURL(reopened.title ?? '', reopened.tiers, reopened.layout), link.id).toBe(written);
    }
  });

  it('returns the link with + from stateParam when the address reads + as spaces', () => {
    expect(stateParam('3.ab cd')).toBe('3.ab+cd');
    expect(stateParam(null)).toBeNull();
  });
});

describe('createListStore writes', () => {
  it('writes one push per change, in order, when three changes run', () => {
    const page = setup(fiveRowLink({'': [MAU, WIN, SIG]}));
    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 0}, {tierId: 'tier-s', index: 0}));
    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 0}, {tierId: 'tier-a', index: 0}));
    page.edit(listChanges.setTitle('My picks'));

    expect(page.modes()).toEqual(['push', 'push', 'push']);
    const [first, second, third] = page.links().map(decoded);
    expect(first.tiers[0].items).toEqual([{id: MAU}]);
    expect(second.tiers[1].items).toEqual([{id: WIN}]);
    expect(third.title).toBe('My picks');
  });

  it('returns the written list without decoding or encoding again when the address is an own write', () => {
    const page = setup(fiveRowLink({'': [MAU, WIN]}));
    page.list;
    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 0}, {tierId: 'tier-s', index: 0}));
    const loads = page.load.mock.calls.length;
    const encodes = page.encode.mock.calls.length;
    const written = page.list;
    expect(page.list).toBe(written);
    expect(page.store.link(written, page.layout)).toBe(page.address);
    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 0}, {tierId: 'tier-a', index: 0}));
    expect(page.load.mock.calls.length).toBe(loads);
    expect(page.encode.mock.calls.length).toBe(encodes + 1);
  });

  it('returns the cached lists without decoding when the address goes Back and Forward', () => {
    const start = fiveRowLink({'': [MAU, WIN]});
    const page = setup(start);
    const opened = page.list;
    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 0}, {tierId: 'tier-s', index: 0}));
    const edited = page.address;
    const loads = page.load.mock.calls.length;
    page.visit(start);
    expect(page.list).toBe(opened);
    page.visit(edited);
    expect(page.contents()[0]).toEqual(['Mauga']);
    expect(page.load.mock.calls.length).toBe(loads);
  });

  it('returns the list of the address again when the address left the cache', () => {
    const cortex = createTierCortex();
    const load = vi.fn((to: string | null) => loadList(cortex, to, TANKS, PAGE_TITLE));
    const store = createListStore(load, (title, tiers, layout) => cortex.encodeListForURL(title, tiers, layout), 2);
    const links = [fiveRowLink({S: [MAU]}), fiveRowLink({A: [MAU]}), fiveRowLink({B: [MAU]})];
    for (const link of links) store.read(link);
    expect(store.read(links[0]).tiers[0].items.map(item => item.id)).toEqual([MAU]);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('writes the page title into the link when a list without a title changes', () => {
    const page = setup(null);
    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 0}, {tierId: 'tier-s', index: 0}));
    expect(decoded(page.links()[0]).title).toBe(PAGE_TITLE);
  });

  it('writes the page title into the link when the title changes back to the page title', () => {
    const page = setup(fiveRowLink({S: [MAU]}, 'Custom'));
    page.edit(listChanges.setTitle(PAGE_TITLE));
    expect(decoded(page.links()[0]).title).toBe(PAGE_TITLE);
  });

  it('writes no link when a change leaves the link as it was', () => {
    for (const address of [fiveRowLink({S: [MAU, WIN]}), null]) {
      const page = setup(address);
      const before = page.list;
      page.edit(listChanges.renameTier(0, 'S'));
      page.edit(listChanges.moveItem({tierId: 'tier-s', index: 1}, {tierId: 'tier-s', index: 1}));
      page.edit(listChanges.setTitle(PAGE_TITLE));
      page.edit(listChanges.removeItems(['missing']));
      expect(page.writes).toEqual([]);
      expect(page.list).toBe(before);
    }
  });

  it('writes the change to the newest list when two changes run before the address is read again', () => {
    const page = setup(fiveRowLink({'': [MAU, WIN]}));
    page.edit(listChanges.addItems([{id: 'k3j9x0a1b', content: 'My cat'}]));
    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 2}, {tierId: 'tier-s', index: 0}));
    expect(page.contents()).toEqual([['My cat'], [], [], [], [], ['Mauga', 'Winston']]);
  });
});

describe('createListStore with short legacy upload ids (A42)', () => {
  it('returns one id legacy-ab3c9 when the address moves between v2 and v3 versions, so Undo adds nothing', () => {
    const names = ['S', 'A', 'B', 'C', 'F', ''];
    const ids = ['tier-s', 'tier-a', 'tier-b', 'tier-c', 'tier-f', 'uncategorized'];
    const v2 = lz({tiers: names.map((name, index) => ({i: ids[index], n: name,
      t: name === 'S' ? [{i: 'ab3c9', c: 'My cat'}] : name === '' ? [{i: MAU}] : []}))});
    const page = setup(v2);
    expect(page.list.tiers[0].items.map(item => item.id)).toEqual(['legacy-ab3c9']);

    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 0}, {tierId: 'tier-a', index: 0}));
    const edited = page.address;
    const deleted = findItemToDelete(page.list.tiers, 'legacy-ab3c9')!;
    page.edit(listChanges.deleteItem('legacy-ab3c9'));

    page.visit(edited);
    expect(page.list.tiers[0].items.map(item => item.id)).toEqual(['legacy-ab3c9']);
    page.visit(v2);
    expect(page.list.tiers[0].items.map(item => item.id)).toEqual(['legacy-ab3c9']);
    const before = page.list;
    page.edit(listChanges.restoreItem(deleted.item, deleted.tierId, deleted.index));
    expect(page.list).toBe(before);
    expect(page.contents()[0]).toEqual(['My cat']);
  });
});

describe('createListStore layout settings (A3)', () => {
  it('returns replace from LAYOUT_LINK_WRITE when read (owner decision, 2026-10-25)', () => {
    expect(LAYOUT_LINK_WRITE).toBe('replace');
  });

  it('writes a replace link with the layout when the label position or label visibility changes', () => {
    for (const address of [null, fiveRowLink({S: [MAU]}), fiveRowV3Link({S: [MAU]}, 'Titled')]) {
      const page = setup(address);
      page.changeLayout({labelPosition: 'top'});
      page.changeLayout({showLabels: false});
      expect(page.layout).toEqual({labelPosition: 'top', showLabels: false});
      expect(page.modes()).toEqual(['replace', 'replace']);
      expect(decoded(page.links()[1])).toMatchObject({labelPosition: 'top', showLabels: false});
      page.changeLayout({labelPosition: 'top'});
      expect(page.writes).toHaveLength(2);
    }
  });

  it('writes push links with the layout on screen when the list changes after a layout change', () => {
    const page = setup(fiveRowLink({'': [MAU, WIN]}));
    page.changeLayout({labelPosition: 'right'});
    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 0}, {tierId: 'tier-s', index: 0}));
    page.edit(listChanges.changeRowTemplate(tierTemplates['7rows']));
    expect(page.modes()).toEqual(['replace', 'push', 'push']);
    expect(decoded(page.links()[2])).toMatchObject({rowTemplate: '7rows', labelPosition: 'right'});
  });

  it('writes a push link when the layout changes and the layout write is push', () => {
    const page = setup(fiveRowLink({S: [MAU]}), createTierCortex(), 'push');
    page.changeLayout({showLabels: false});
    expect(page.modes()).toEqual(['push']);
    expect(decoded(page.links()[0]).showLabels).toBe(false);
  });

  it('writes no link until the next list change when the layout changes and the layout write is next-edit', () => {
    const page = setup(fiveRowLink({'': [MAU]}), createTierCortex(), 'next-edit');
    page.changeLayout({labelPosition: 'top'});
    expect(page.writes).toEqual([]);
    expect(page.layout.labelPosition).toBe('top');
    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 0}, {tierId: 'tier-s', index: 0}));
    expect(page.modes()).toEqual(['push']);
    expect(decoded(page.links()[0]).labelPosition).toBe('top');
  });

  it('returns the v3 link layout when it opens, and no layout when a legacy link or a template opens', () => {
    expect(setup(fiveRowV3Link({S: [MAU]}, '', {labelPosition: 'top', showLabels: false})).layout).toEqual({labelPosition: 'top', showLabels: false});
    for (const address of [null, fiveRowLink({S: [MAU]}), 'not-a-link']) {
      expect(setup(address).layout).toEqual(DEFAULT_LAYOUT);
    }
  });

  it('returns the layout on screen, writing no link, when the address goes Back and Forward (owner, 2026-10-25)', () => {
    const start = fiveRowV3Link({'': [MAU, WIN]});
    const page = setup(start);
    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 0}, {tierId: 'tier-s', index: 0}));
    const mauga = page.address;
    page.edit(listChanges.moveItem({tierId: 'uncategorized', index: 0}, {tierId: 'tier-a', index: 0}));
    page.changeLayout({labelPosition: 'top'});
    const winstonOnTop = page.address!;
    expect(decoded(winstonOnTop).labelPosition).toBe('top');
    const writes = page.writes.length;

    page.visit(mauga);
    expect(page.contents()).toEqual([['Mauga'], [], [], [], [], ['Winston']]);
    expect(page.layout.labelPosition).toBe('top');
    page.visit(winstonOnTop);
    page.visit(start);
    expect(page.layout.labelPosition).toBe('top');
    expect(page.writes).toHaveLength(writes);
  });
});

describe('listChanges', () => {
  it('returns the row contents moved and the names in place when moveTier runs', () => {
    const page = setup(fiveRowLink({S: [MAU], A: [WIN]}));
    page.edit(listChanges.moveTier(0, 1));
    expect(page.names()).toEqual(['S', 'A', 'B', 'C', 'F', '']);
    expect(page.contents().slice(0, 2)).toEqual([['Winston'], ['Mauga']]);
    expect(page.list.tiers.map(tier => tier.id).slice(0, 2)).toEqual(['tier-a', 'tier-s']);
  });

  it('writes one link with the whole row, name and items, at its new place when moveRow runs', () => {
    const page = setup(fiveRowLink({S: [MAU], A: [WIN]}));
    page.edit(listChanges.moveRow(0, 2));
    expect(page.names()).toEqual(['A', 'B', 'S', 'C', 'F', '']);
    expect(page.contents().slice(0, 3)).toEqual([['Winston'], [], ['Mauga']]);
    expect(page.writes).toHaveLength(1);
    const linked = decoded(page.links()[0]).tiers;
    expect(linked.map(tier => tier.name)).toEqual(['A', 'B', 'S', 'C', 'F', '']);
    expect(linked.map(tier => tier.items.map(item => item.id))).toEqual(page.list.tiers.map(tier => tier.items.map(item => item.id)));
  });

  it('writes no link when moveRow runs onto Unranked, from Unranked, or to the same place', () => {
    const page = setup(fiveRowLink({S: [MAU]}));
    page.edit(listChanges.moveRow(0, 5));
    page.edit(listChanges.moveRow(5, 0));
    page.edit(listChanges.moveRow(2, 2));
    expect(page.names()).toEqual(['S', 'A', 'B', 'C', 'F', '']);
    expect(page.writes).toHaveLength(0);
  });

  it('writes one link with an empty row without a name above Unranked when addTier runs', () => {
    const page = setup(fiveRowLink({S: [MAU], '': [WIN]}));
    page.edit(listChanges.addTier());
    expect(page.names()).toEqual(['S', 'A', 'B', 'C', 'F', '', '']);
    expect(page.contents()).toEqual([['Mauga'], [], [], [], [], [], ['Winston']]);
    expect(page.list.tiers[5].id).toBe('tier-1');
    expect(page.writes).toHaveLength(1);
    expect(decoded(page.links()[0]).tiers.map(tier => tier.id).slice(5)).toEqual(['tier-1', 'uncategorized']);
  });

  it('writes no link when addTier runs at MAX_TIER_ROWS rows', () => {
    const page = setup(fiveRowLink({}));
    while (page.list.tiers.length < MAX_TIER_ROWS) page.edit(listChanges.addTier());
    const writes = page.writes.length;
    page.edit(listChanges.addTier());
    expect(page.list.tiers).toHaveLength(MAX_TIER_ROWS);
    expect(page.writes).toHaveLength(writes);
  });

  it('writes one link with the items at the end of Unranked when removeTier runs', () => {
    const page = setup(fiveRowLink({S: [MAU], B: [WIN, SIG]}));
    page.edit(listChanges.removeTier('tier-b'));
    expect(page.names()).toEqual(['S', 'A', 'C', 'F', '']);
    expect(page.contents()).toEqual([['Mauga'], [], [], [], ['Winston', 'Sigma']]);
    expect(page.writes).toHaveLength(1);
  });

  it('writes no link when removeTier targets Unranked, an unknown row or the last ranked row', () => {
    const page = setup(fiveRowLink({S: [MAU]}));
    page.edit(listChanges.removeTier('uncategorized'));
    page.edit(listChanges.removeTier('nope'));
    expect(page.writes).toHaveLength(0);
    for (const tierId of ['tier-a', 'tier-b', 'tier-c', 'tier-f', 'tier-s']) page.edit(listChanges.removeTier(tierId));
    expect(page.names()).toEqual(['S', '']);
    expect(page.contents()).toEqual([['Mauga'], []]);
    expect(page.writes).toHaveLength(4);
  });

  it('writes a new link with the ranking back when restoreTiers runs after resetRankings (toast Undo)', () => {
    const page = setup(fiveRowLink({S: [MAU], A: [WIN], '': [SIG]}));
    const before = page.list.tiers;
    page.edit(listChanges.resetRankings());
    expect(page.contents()).toEqual([[], [], [], [], [], ['Mauga', 'Sigma', 'Winston']]);
    page.edit(listChanges.restoreTiers(before));
    expect(page.contents()).toEqual([['Mauga'], ['Winston'], [], [], [], ['Sigma']]);
    expect(page.writes).toHaveLength(2);
  });

  it('writes a new link with the items back when restoreTiers runs after removeAllItems (toast Undo)', () => {
    const page = setup(fiveRowLink({S: [MAU]}));
    const before = page.list.tiers;
    page.edit(listChanges.removeAllItems());
    expect(page.contents().flat()).toEqual([]);
    page.edit(listChanges.restoreTiers(before));
    expect(page.contents()[0]).toEqual(['Mauga']);
    expect(page.writes).toHaveLength(2);
  });

  it('returns an Unranked row with every item when resetRankings runs on a list without one', () => {
    const page = setup(lz({tiers: [{i: 'tier-s', n: 'S', t: [{i: WIN}, {i: MAU}]}]}));
    page.edit(listChanges.resetRankings());
    expect(page.list.tiers).toEqual([
      {id: 'tier-s', name: 'S', items: []},
      {id: 'uncategorized', name: '', items: [expect.objectContaining({id: MAU}), expect.objectContaining({id: WIN})]},
    ]);
  });

  it('returns the item at its old place in its tier when restoreItem runs after deleteItem', () => {
    const page = setup(fiveRowLink({S: [MAU, WIN]}));
    const deleted = findItemToDelete(page.list.tiers, MAU)!;
    expect(deleted).toMatchObject({tierId: 'tier-s', index: 0});
    page.edit(listChanges.deleteItem(MAU));
    expect(page.contents()[0]).toEqual(['Winston']);
    page.edit(listChanges.restoreItem(deleted.item, deleted.tierId, deleted.index));
    expect(page.contents()[0]).toEqual(['Mauga', 'Winston']);
  });

  it('returns the item at the end of its tier when restoreItem runs and the tier has fewer items than its old place', () => {
    const page = setup(fiveRowLink({S: [MAU, WIN]}));
    const deleted = findItemToDelete(page.list.tiers, WIN)!;
    expect(deleted.index).toBe(1);
    page.edit(listChanges.deleteItem(WIN));
    page.edit(listChanges.deleteItem(MAU));
    page.edit(listChanges.restoreItem(deleted.item, deleted.tierId, deleted.index));
    expect(page.contents()[0]).toEqual(['Winston']);
  });

  it('returns only items with a new id and label when addItems runs, and removeItems removes only those', () => {
    const cortex = createTierCortex();
    const page = setup(fiveRowLink({S: [MAU]}), cortex);
    const newItems = [...cortex.resolveItemsFromPackage('image-overwatch', ['mau.webp', 'win.webp']), {id: 'k3j9x0a1b', content: 'Mauga'}];
    const added = itemsToAdd(page.list.tiers, newItems);
    expect(added.map(item => item.content)).toEqual(['Winston']);
    page.edit(listChanges.addItems(newItems));
    expect(page.contents()).toEqual([['Mauga'], [], [], [], [], ['Winston']]);
    page.edit(listChanges.removeItems(added.map(item => item.id)));
    expect(page.contents()).toEqual([['Mauga'], [], [], [], [], []]);
  });

  it('writes no link when addItems gets only items already in the list', () => {
    const cortex = createTierCortex();
    const page = setup(fiveRowLink({S: [MAU]}), cortex);
    const before = page.list;
    page.edit(listChanges.addItems(cortex.resolveItemsFromPackage('image-overwatch', ['mau.webp'])));
    expect(page.list).toBe(before);
    expect(page.writes).toEqual([]);
  });

  it('writes no link when restoreItem runs and the item is in the list again', () => {
    const start = fiveRowLink({S: [MAU, WIN]});
    const page = setup(start);
    const deleted = findItemToDelete(page.list.tiers, MAU)!;
    page.edit(listChanges.deleteItem(MAU));
    page.visit(start);
    const before = page.list;
    page.edit(listChanges.restoreItem(deleted.item, deleted.tierId, deleted.index));
    expect(page.list).toBe(before);
    expect(page.contents()[0]).toEqual(['Mauga', 'Winston']);
  });

  it('returns items in rows with the same id and the rest in Unranked when changeRowTemplate runs', () => {
    const page = setup(fiveRowLink({S: [MAU], C: [WIN], F: [SIG]}));
    page.edit(listChanges.changeRowTemplate(tierTemplates['3rows']));
    expect(page.names()).toEqual(['S', 'A', 'B', '']);
    expect(page.contents()).toEqual([['Mauga'], [], [], ['Winston', 'Sigma']]);
    page.edit(listChanges.changeRowTemplate(tierTemplates['7rows']));
    expect(page.names()).toEqual(['SS', 'S', 'A', 'B', 'C', 'D', 'F', '']);
    expect(tierTemplates['3rows'].every(tier => tier.items.length === 0)).toBe(true);
  });

  it('returns new tiers and leaves the input tiers unchanged when each change runs', () => {
    const page = setup(fiveRowLink({S: [MAU, WIN], '': [SIG]}));
    const list = page.list;
    const snapshot = JSON.stringify(list.tiers);
    for (const change of [
      listChanges.moveItem({tierId: 'tier-s', index: 0}, {tierId: 'uncategorized', index: 0}),
      listChanges.moveItem({tierId: 'tier-s', index: 0}, {tierId: 'tier-s', index: 1}),
      listChanges.moveTier(0, 5),
      listChanges.addTier(),
      listChanges.removeTier('tier-s'),
      listChanges.renameTier(0, 'Top'),
      listChanges.deleteItem(WIN),
      listChanges.addItems([{id: 'new-one', content: 'New'}]),
      listChanges.removeItems([MAU]),
      listChanges.resetRankings(),
      listChanges.removeAllItems(),
      listChanges.changeRowTemplate(tierTemplates['3rows']),
    ]) {
      change(list);
    }
    expect(page.list).toBe(list);
    expect(JSON.stringify(list.tiers)).toBe(snapshot);
  });
});

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

const REPEATED_ID_LINKS: [string, string][] = [
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

describe('findItemToDelete', () => {
  it('returns null when the list lacks the id', () => {
    const page = setup(fiveRowLink({S: [MAU, WIN]}));
    expect(findItemToDelete(page.list.tiers, 'missing')).toBeNull();
  });
});

describe('loadList and listChanges with repeated ids (A32, A38)', () => {
  for (const [name, link] of REPEATED_ID_LINKS) {
    it(`returns unique tier and item ids when the link is ${name}`, () => {
      const tiers = setup(link).list.tiers;
      expect(tiers.length).toBeGreaterThan(1);
      expectUniqueIds(tiers);
    });
  }

  it('returns unique tier and item ids when a template opens without a link', () => {
    expectUniqueIds(setup(null).list.tiers);
  });

  it('returns unique tier and item ids after each change when rows and items are added, moved and removed', () => {
    const page = setup(REPEATED_ID_LINKS[0][1]);
    const changes = [
      listChanges.addTier(),
      listChanges.addTier(),
      listChanges.addItems([{id: MAU, content: 'Mauga'}, {id: 'k3j9x0a1b', content: 'my cat'}]),
      listChanges.moveTier(0, 2),
      listChanges.removeTier(page.list.tiers[1].id),
      listChanges.addTier(),
      listChanges.moveItem({tierId: page.list.tiers[0].id, index: 0}, {tierId: 'uncategorized', index: 0}),
    ];
    for (const change of changes) {
      page.edit(change);
      expectUniqueIds(page.list.tiers);
    }
  });
});
