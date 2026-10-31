import type Item from "@/models/Item";
import type Tier from "@/models/Tier";
import type {LabelPosition} from "@/models/Tier";
import type {ItemSet} from "@/models/ItemSet";
import type {TierCortex} from "@/lib/TierCortex";
import type {ListLayout} from "@/lib/listLink";
import {addTier, moveItem, removeTier, reorderRows} from "@/lib/dnd/moves";

/**
 * The tier list editor's state and every change to it, as a pure reducer (no React, no
 * router). contexts/TierContext.tsx runs it with useReducer and connects it to the address.
 *
 * The address is the save and the undo (product rule 2):
 * - Every change to the list (tiers, items, tier names, title) records a write: the new link.
 *   The provider pushes each write as a new history entry, one at a time and in order, never
 *   merged: the next one when the previous one has reached the address.
 * - A change that leaves the link as it was writes nothing: an unchanged rename, a drop on
 *   the same place.
 * - The layout settings (label position, labels shown) travel in v3 links too. How a change
 *   to them reaches the address is LAYOUT_LINK_WRITE (A3): by default it replaces the current
 *   entry, so it adds no Back step, as before.
 * - Opening a link writes nothing (A1). Back, Forward and opening a link change the address;
 *   the provider then hands the list from that address to `addressChanged`, which never writes.
 *
 * Layout settings from a link apply only when the link is opened fresh: when the editor
 * starts with it (`initialTierListState`). That is the first load of the page, a reload, or
 * arriving at the editor from another page, also by Back or Forward from another page (each
 * of these starts a new editor). Back and Forward between versions of the list inside the
 * editor (`addressChanged`) keep the layout on screen, as before (owner, 2026-10-25).
 */

/**
 * How a change to the label position or label visibility writes the link (A3).
 * - 'replace': replace the current history entry. No Back step, as before v3; shared links
 *   carry the layout.
 * - 'push': a new history entry, like a change to the list. Back undoes the layout change.
 * - 'next-edit': write nothing now; the next change to the list writes the layout along.
 *
 * Owner's choice, 2026-10-25: (a) 'replace'. Everything a user experiences stays the same,
 * and shared links also carry the layout. Changing this line is all another choice needs.
 */
export type LayoutLinkWrite = 'replace' | 'push' | 'next-edit';
export const LAYOUT_LINK_WRITE: LayoutLinkWrite = 'replace';

/** A list to show, read from an address: a decoded link, or the template's starting list. */
export interface LoadedList {
  tiers: Tier[];
  title: string;
  /** True when the address held a link that decoded (false: a plain address or a damaged link). */
  decoded: boolean;
  /** The layout a v3 link stores. Applied only when the link is opened fresh. */
  layout?: ListLayout;
}

/**
 * The list an address holds: its link decoded, or the template's starting list when the
 * address has no link or the link does not decode. A link without a title shows the page title.
 */
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

/** A link the provider writes into the address: a new history entry, or in place of the current one. */
export interface LinkWrite {
  /** Increases with every write, so the provider writes each one once. */
  id: number;
  link: string;
  /** 'push' adds a history entry (every change to the list); 'replace' replaces the current one. */
  mode: 'push' | 'replace';
}

export interface TierListState {
  tiers: Tier[];
  /** The title on screen. Without a title in the link, the page title (the template's name). */
  title: string;
  labelPosition: LabelPosition;
  showLabels: boolean;
  /** The link of the list on screen: what `encode` writes for the title, tiers and layout. */
  link: string;
  /** The `state` parameter of the address as last seen; null when the address has none. */
  address: string | null;
  /** True when `address` holds the list on screen: it decoded, or it is a write of this editor. */
  addressHoldsList: boolean;
  /** Writes not seen in the address yet, oldest first. */
  writes: LinkWrite[];
  nextWriteId: number;
}

export interface ItemPosition {
  tierId: string;
  index: number;
}

export type TierListAction =
  | {type: 'addressChanged'; address: string | null; loaded: LoadedList | null}
  | {type: 'titleChanged'; title: string}
  | {type: 'itemMoved'; from: ItemPosition; to: ItemPosition}
  | {type: 'tierMoved'; from: number; to: number}
  /** Adds an empty row above Unranked (#182), labelled "Tier <n>", up to MAX_TIER_ROWS rows. */
  | {type: 'tierAdded'}
  /** Removes a ranked row (#182); its items go to the end of Unranked. */
  | {type: 'tierRemoved'; tierId: string}
  | {type: 'tierRenamed'; index: number; name: string}
  | {type: 'itemDeleted'; itemId: string}
  | {type: 'itemRestored'; item: Item; tierId: string}
  | {type: 'itemsAdded'; items: Item[]}
  | {type: 'itemsRemoved'; itemIds: string[]}
  | {type: 'rowTemplateChanged'; template: readonly Tier[]}
  | {type: 'rankingsReset'}
  | {type: 'allItemsRemoved'}
  | {type: 'tiersRestored'; tiers: Tier[]}
  | {type: 'labelPositionChanged'; labelPosition: LabelPosition}
  | {type: 'labelsToggled'};

/**
 * The `state` parameter as the store compares it. URLSearchParams reads a '+' in the address as
 * a space. A link never holds a space, and every decoder reads a space as '+', so putting the '+'
 * back changes nothing about the list, and the store recognises its own writes when they arrive.
 */
export function stateParam(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : value.replace(/ /g, '+');
}

/** Writes the link of a list (TierCortex: the current link format). */
export type ListEncoder = (title: string, tiers: Tier[], layout: ListLayout) => string;

const layoutOf = (state: Pick<TierListState, 'labelPosition' | 'showLabels'>): ListLayout =>
  ({labelPosition: state.labelPosition, showLabels: state.showLabels});

/** Writes waiting to show up in the address. Far more than ever pile up between two renders. */
const MAX_PENDING_WRITES = 50;

/**
 * The store when the editor starts: the link is opened fresh, so its layout settings apply
 * (a link without them, or no link, shows labels on the left).
 */
export function initialTierListState(loaded: LoadedList, address: string | null, encode: ListEncoder): TierListState {
  const layout: ListLayout = loaded.layout ?? {labelPosition: 'left', showLabels: true};
  return {
    tiers: loaded.tiers,
    title: loaded.title,
    labelPosition: layout.labelPosition,
    showLabels: layout.showLabels,
    link: encode(loaded.title, loaded.tiers, layout),
    address,
    addressHoldsList: loaded.decoded,
    writes: [],
    nextWriteId: 0,
  };
}

/**
 * True when a new address needs its list loaded. It does not when the address is a write of
 * this editor showing up, or already holds the list on screen.
 */
export function addressNeedsLoading(state: TierListState, address: string | null): boolean {
  if (address === state.address) return false;
  if (address === state.link) return false;
  return !state.writes.some(write => write.link === address);
}

type ListChanges = Partial<Pick<TierListState, 'tiers' | 'title' | 'labelPosition' | 'showLabels'>>;

export interface TierListReducerOptions {
  /** How layout settings write the link (A3). Defaults to LAYOUT_LINK_WRITE. */
  layoutWrite?: LayoutLinkWrite;
}

export function createTierListReducer(encode: ListEncoder, {layoutWrite = LAYOUT_LINK_WRITE}: TierListReducerOptions = {}) {
  /** A change: records a write when the link changes. */
  const change = (state: TierListState, changes: ListChanges, mode: LinkWrite['mode'] = 'push'): TierListState => {
    const next = {...state, ...changes};
    const link = encode(next.title, next.tiers, layoutOf(next));
    if (link === state.link) return state;
    if (link === state.address && state.writes.length === 0) {
      // The address already holds this link (for example a link without a title, after the
      // title is cleared). Writing it would not change the address, so the write would never
      // arrive and would hold up every later write.
      return {...next, link, addressHoldsList: true};
    }
    const write: LinkWrite = {id: state.nextWriteId, link, mode};
    return {
      ...next,
      link,
      writes: [...state.writes, write].slice(-MAX_PENDING_WRITES),
      nextWriteId: state.nextWriteId + 1,
    };
  };

  /** A change to the list: a new history entry. */
  const edit = (state: TierListState, tiers: Tier[], title: string = state.title): TierListState =>
    change(state, {tiers, title});

  /** A change to the layout settings, written as LAYOUT_LINK_WRITE says (A3). */
  const changeLayout = (state: TierListState, layout: Partial<ListLayout>): TierListState => {
    if (layoutWrite === 'next-edit') return {...state, ...layout};
    return change(state, layout, layoutWrite);
  };

  return function tierListReducer(state: TierListState, action: TierListAction): TierListState {
    switch (action.type) {
      case 'addressChanged': {
        const landed = state.writes.findIndex(write => write.link === action.address);
        if (landed !== -1) {
          // A write of this editor reached the address. Later writes are still on their way.
          return {...state, address: action.address, addressHoldsList: true, writes: state.writes.slice(landed + 1)};
        }
        if (action.loaded === null) {
          return {...state, address: action.address, addressHoldsList: state.addressHoldsList || action.address === state.link};
        }
        // Back and Forward inside the editor keep the layout on screen: a link's layout applies
        // only when it is opened fresh (initialTierListState).
        const {tiers, title, decoded} = action.loaded;
        return {
          ...state,
          tiers,
          title,
          link: encode(title, tiers, layoutOf(state)),
          address: action.address,
          addressHoldsList: decoded,
          writes: [],
        };
      }
      case 'titleChanged':
        return edit(state, state.tiers, action.title);
      case 'itemMoved':
        return edit(state, moveItem(state.tiers, action.from, action.to));
      case 'tierMoved':
        // Tier labels describe positions (product rule 6): the contents and the tier id move,
        // the names stay in place from top to bottom.
        return edit(state, reorderRows(state.tiers, action.from, action.to));
      case 'tierAdded':
        // The new row gets a visible label to click and rename: "Tier <its row number>".
        return edit(state, addTier(state.tiers, {name: `Tier ${state.tiers.length}`})?.tiers ?? state.tiers);
      case 'tierRemoved':
        return edit(state, removeTier(state.tiers, state.tiers.findIndex(tier => tier.id === action.tierId)));
      case 'tierRenamed':
        return edit(state, state.tiers.map((tier, index) => (index === action.index ? {...tier, name: action.name} : tier)));
      case 'itemDeleted':
        return edit(state, deleteItem(state.tiers, action.itemId));
      case 'itemRestored':
        // The list may hold the item again already (added back, or Back to a version with it).
        if (state.tiers.some(tier => tier.items.some(item => item.id === action.item.id))) return state;
        return edit(state, state.tiers.map(tier => (
          tier.id === action.tierId ? {...tier, items: [...tier.items, action.item]} : tier
        )));
      case 'itemsAdded':
        return edit(state, addItems(state.tiers, action.items));
      case 'itemsRemoved':
        return edit(state, state.tiers.map(tier => ({
          ...tier,
          items: tier.items.filter(item => !action.itemIds.includes(item.id)),
        })));
      case 'rowTemplateChanged':
        return edit(state, changeRowTemplate(state.tiers, action.template));
      case 'rankingsReset':
        return edit(state, resetRankings(state.tiers));
      case 'allItemsRemoved':
        return edit(state, state.tiers.map(tier => ({...tier, items: []})));
      case 'tiersRestored':
        return edit(state, action.tiers);
      case 'labelPositionChanged':
        return action.labelPosition === state.labelPosition ? state : changeLayout(state, {labelPosition: action.labelPosition});
      case 'labelsToggled':
        return changeLayout(state, {showLabels: !state.showLabels});
    }
  };
}

/**
 * The item that `deleteItem` removes, and the tier it was in: the last tier that holds it,
 * as the editor has always reported it.
 */
export function findItemToDelete(tiers: Tier[], itemId: string): {item: Item; tierId: string} | null {
  for (let index = tiers.length - 1; index >= 0; index--) {
    const item = tiers[index].items.find(candidate => candidate.id === itemId);
    if (item) return {item, tierId: tiers[index].id};
  }
  return null;
}

/** Removes the item from every tier that holds it (its first place in each). */
function deleteItem(tiers: Tier[], itemId: string): Tier[] {
  return tiers.map(tier => {
    const itemIndex = tier.items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return tier;
    return {...tier, items: tier.items.filter((_, index) => index !== itemIndex)};
  });
}

/**
 * The items that adding `newItems` really adds: those the list does not hold yet, by id or by
 * label. Toast Undo removes only these, so items that were in the list before stay.
 */
export function itemsToAdd(tiers: Tier[], newItems: Item[]): Item[] {
  if (tiers.length === 0) return [];
  return newItems.filter(newItem =>
    !tiers.some(tier => tier.items.some(item => item.id === newItem.id || item.content === newItem.content))
  );
}

/** Adds items at the end of the last tier (Unranked), leaving out items the list holds. */
function addItems(tiers: Tier[], newItems: Item[]): Tier[] {
  const added = itemsToAdd(tiers, newItems);
  if (added.length === 0) return tiers;
  const lastIndex = tiers.length - 1;
  return tiers.map((tier, index) => (index === lastIndex ? {...tier, items: [...tier.items, ...added]} : tier));
}

/**
 * Switches to another row template (3, 5 or 7 rows). Items stay in the tier with the same id,
 * or go to Unranked when the template has no such tier.
 */
function changeRowTemplate(tiers: Tier[], template: readonly Tier[]): Tier[] {
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

/** Puts every item back in Unranked, sorted by label. Adds an Unranked row if the list has none. */
function resetRankings(tiers: Tier[]): Tier[] {
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
