import type Item from "@/models/Item";
import type Tier from "@/models/Tier";
import type {ItemSet} from "@/models/ItemSet";
import type {TierCortex} from "@/lib/TierCortex";
import type {ListLayout} from "@/lib/listLink";
import type {ItemPosition} from "@/lib/dnd/model";
import {addTier, moveItem, moveRow, removeTier, reorderRows} from "@/lib/dnd/moves";

export interface LoadedList {
  tiers: Tier[];
  title: string;
  decoded: boolean;
  layout?: ListLayout;
}

export type ListEncoder = (title: string, tiers: Tier[], layout: ListLayout) => string;

export const DEFAULT_LAYOUT: ListLayout = {labelPosition: 'left', showLabels: true};

export function loadList(tierCortex: TierCortex, address: string | null, itemSet: ItemSet | undefined, pageTitle: string): LoadedList {
  if (address) {
    const decoded = tierCortex.decodeTierStateFromURL(address);
    if (decoded) {
      const list: LoadedList = {tiers: decoded.tiers, title: decoded.title || pageTitle, decoded: true};
      if (decoded.layout) list.layout = decoded.layout;
      return list;
    }
  }
  return {tiers: tierCortex.getInitialTiers(undefined, itemSet), title: pageTitle, decoded: false};
}

export function stateParam(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : value.replace(/ /g, '+');
}

export type LayoutLinkWrite = 'replace' | 'push' | 'next-edit';
export const LAYOUT_LINK_WRITE: LayoutLinkWrite = 'replace';

export type ListChange = (list: LoadedList) => Partial<Pick<LoadedList, 'tiers' | 'title'>>;

export interface ListWrite {
  link: string;
  list: LoadedList;
  mode: 'push' | 'replace';
}

export interface ListStore {
  read: (address: string | null) => LoadedList;
  link: (list: LoadedList, layout: ListLayout) => string;
  edit: (address: string | null, change: ListChange, layout: ListLayout) => ListWrite | null;
  relayout: (address: string | null, layout: ListLayout, mode?: LayoutLinkWrite) => ListWrite | null;
}

const layoutKey = (layout: ListLayout) => `${layout.labelPosition}:${layout.showLabels}`;

export function createListStore(load: (address: string | null) => LoadedList, encode: ListEncoder, size = 64): ListStore {
  const lists = new Map<string | null, LoadedList>();
  const links = new WeakMap<LoadedList, {layout: string; link: string}>();

  const keep = (address: string | null, list: LoadedList) => {
    lists.delete(address);
    lists.set(address, list);
    if (lists.size > size) lists.delete(lists.keys().next().value as string | null);
  };

  const read = (address: string | null) => {
    const cached = lists.get(address);
    if (cached) {
      keep(address, cached);
      return cached;
    }
    const list = load(address);
    keep(address, list);
    return list;
  };

  const linkOf = (list: LoadedList, layout: ListLayout) => {
    const key = layoutKey(layout);
    const known = links.get(list);
    if (known && known.layout === key) return known.link;
    const link = encode(list.title, list.tiers, layout);
    links.set(list, {layout: key, link});
    return link;
  };

  const write = (from: LoadedList, next: LoadedList, layout: ListLayout): ListWrite | null => {
    const link = encode(next.title, next.tiers, layout);
    if (link === linkOf(from, layout)) return null;
    const list: LoadedList = {tiers: next.tiers, title: next.title, decoded: true, layout};
    links.set(list, {layout: layoutKey(layout), link});
    keep(link, list);
    return {link, list, mode: 'push'};
  };

  return {
    read,
    link: linkOf,
    edit(address, change, layout) {
      const current = read(address);
      const next = {...current, ...change(current)};
      if (next.tiers === current.tiers && next.title === current.title) return null;
      return write(current, next, layout);
    },
    relayout(address, layout, mode = LAYOUT_LINK_WRITE) {
      if (mode === 'next-edit') return null;
      const current = read(address);
      const link = linkOf(current, layout);
      if (link === address) return null;
      const list: LoadedList = {...current, decoded: true, layout};
      links.set(list, {layout: layoutKey(layout), link});
      keep(link, list);
      return {link, list, mode};
    },
  };
}

export function renameTier(tiers: Tier[], index: number, name: string): Tier[] {
  return tiers.map((tier, at) => (at === index ? {...tier, name} : tier));
}

export function restoreItem(tiers: Tier[], item: Item, tierId: string, index: number): Tier[] {
  if (tiers.some(tier => tier.items.some(candidate => candidate.id === item.id))) return tiers;
  return tiers.map(tier => {
    if (tier.id !== tierId) return tier;
    const at = Math.min(index, tier.items.length);
    return {...tier, items: [...tier.items.slice(0, at), item, ...tier.items.slice(at)]};
  });
}

export function removeItems(tiers: Tier[], itemIds: string[]): Tier[] {
  const removed = new Set(itemIds);
  return tiers.map(tier => (tier.items.some(item => removed.has(item.id)) ? {...tier, items: tier.items.filter(item => !removed.has(item.id))} : tier));
}

export function removeAllItems(tiers: Tier[]): Tier[] {
  return tiers.map(tier => (tier.items.length === 0 ? tier : {...tier, items: []}));
}

export function findItemToDelete(tiers: Tier[], itemId: string): {item: Item; tierId: string; index: number} | null {
  for (let tierIndex = tiers.length - 1; tierIndex >= 0; tierIndex--) {
    const index = tiers[tierIndex].items.findIndex(candidate => candidate.id === itemId);
    if (index !== -1) return {item: tiers[tierIndex].items[index], tierId: tiers[tierIndex].id, index};
  }
  return null;
}

export function deleteItem(tiers: Tier[], itemId: string): Tier[] {
  return tiers.map(tier => {
    const itemIndex = tier.items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return tier;
    return {...tier, items: tier.items.filter((_, index) => index !== itemIndex)};
  });
}

export function itemsToAdd(tiers: Tier[], newItems: Item[]): Item[] {
  if (tiers.length === 0) return [];
  return newItems.filter(newItem =>
    !tiers.some(tier => tier.items.some(item => item.id === newItem.id || item.content === newItem.content))
  );
}

export function addItems(tiers: Tier[], newItems: Item[]): Tier[] {
  const added = itemsToAdd(tiers, newItems);
  if (added.length === 0) return tiers;
  const lastIndex = tiers.length - 1;
  return tiers.map((tier, index) => (index === lastIndex ? {...tier, items: [...tier.items, ...added]} : tier));
}

export function changeRowTemplate(tiers: Tier[], template: readonly Tier[]): Tier[] {
  const allItems = new Map(tiers.flatMap(tier => tier.items.map(item => [item.id, {item, tierId: tier.id}] as const)));
  const newTiers: Tier[] = template.map(templateTier => ({...templateTier, items: [] as Item[]}));
  allItems.forEach(({item, tierId}) => {
    const target = newTiers.find(tier => tier.id === tierId) ?? newTiers.find(tier => tier.id === UNRANKED_TIER_ID);
    if (target) {
      target.items.push(item);
    } else {
      newTiers.push({id: UNRANKED_TIER_ID, name: '', items: [item]});
    }
  });
  return newTiers;
}

export function resetRankings(tiers: Tier[]): Tier[] {
  const allItems = tiers.flatMap(tier => tier.items).sort((a, b) => a.content.localeCompare(b.content));
  const resetTiers: Tier[] = tiers.map(tier => ({...tier, items: []}));
  const last = resetTiers[resetTiers.length - 1];
  if (last && last.id === UNRANKED_TIER_ID) {
    resetTiers[resetTiers.length - 1] = {...last, items: allItems};
  } else {
    resetTiers.push({id: UNRANKED_TIER_ID, name: '', items: allItems});
  }
  return resetTiers;
}

const UNRANKED_TIER_ID = 'uncategorized';

export const listChanges = {
  setTitle: (title: string): ListChange => () => ({title}),
  moveItem: (from: ItemPosition, to: ItemPosition): ListChange => ({tiers}) => ({tiers: moveItem(tiers, from, to)}),
  moveTier: (from: number, to: number): ListChange => ({tiers}) => ({tiers: reorderRows(tiers, from, to)}),
  moveRow: (from: number, to: number): ListChange => ({tiers}) => ({tiers: moveRow(tiers, from, to)}),
  addTier: (): ListChange => ({tiers}) => ({tiers: addTier(tiers)?.tiers ?? tiers}),
  removeTier: (tierId: string): ListChange => ({tiers}) => ({tiers: removeTier(tiers, tiers.findIndex((tier) => tier.id === tierId))}),
  renameTier: (index: number, name: string): ListChange => ({tiers}) => ({tiers: renameTier(tiers, index, name)}),
  deleteItem: (itemId: string): ListChange => ({tiers}) => ({tiers: deleteItem(tiers, itemId)}),
  restoreItem: (item: Item, tierId: string, index: number): ListChange => ({tiers}) => ({tiers: restoreItem(tiers, item, tierId, index)}),
  addItems: (items: Item[]): ListChange => ({tiers}) => ({tiers: addItems(tiers, items)}),
  removeItems: (itemIds: string[]): ListChange => ({tiers}) => ({tiers: removeItems(tiers, itemIds)}),
  resetRankings: (): ListChange => ({tiers}) => ({tiers: resetRankings(tiers)}),
  removeAllItems: (): ListChange => ({tiers}) => ({tiers: removeAllItems(tiers)}),
  restoreTiers: (tiers: Tier[]): ListChange => () => ({tiers}),
  changeRowTemplate: (template: readonly Tier[]): ListChange => ({tiers}) => ({tiers: changeRowTemplate(tiers, template)}),
};
