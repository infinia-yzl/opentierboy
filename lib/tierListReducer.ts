import type Item from "@/models/Item";
import type Tier from "@/models/Tier";
import type {LabelPosition} from "@/models/Tier";
import type {ItemSet} from "@/models/ItemSet";
import type TierCortex from "@/lib/TierCortex";

/**
 * The tier list editor's state and every change to it, as a pure reducer (no React, no
 * router). contexts/TierContext.tsx runs it with useReducer and connects it to the address.
 *
 * The address is the save and the undo (product rule 2):
 * - Every change to the list (tiers, items, tier names, title) records a write: the new link.
 *   The provider pushes each write as a new history entry, in order, never merged.
 * - A change that leaves the link as it was writes nothing: an unchanged rename, a drop on
 *   the same place, a layout setting (label position, labels shown).
 * - Opening a link writes nothing (A1). Back, Forward and opening a link change the address;
 *   the provider then hands the list from that address to `addressChanged`, which never writes.
 */

/** A list to show, read from an address: a decoded link, or the template's starting list. */
export interface LoadedList {
  tiers: Tier[];
  title: string;
  /** True when the address held a link that decoded (false: a plain address or a damaged link). */
  decoded: boolean;
}

/**
 * The list an address holds: its link decoded, or the template's starting list when the
 * address has no link or the link does not decode. A link without a title shows the page title.
 */
export function loadList(tierCortex: TierCortex, address: string | null, itemSet: ItemSet | undefined, pageTitle: string): LoadedList {
  if (address) {
    const decoded = tierCortex.decodeTierStateFromURL(address);
    if (decoded) return {tiers: decoded.tiers, title: decoded.title || pageTitle, decoded: true};
  }
  return {tiers: tierCortex.getInitialTiers(undefined, itemSet), title: pageTitle, decoded: false};
}

/** A link the provider pushes as a new history entry. */
export interface LinkWrite {
  /** Increases with every write, so the provider pushes each write once. */
  id: number;
  link: string;
}

export interface TierListState {
  tiers: Tier[];
  /** The title on screen. Without a title in the link, the page title (the template's name). */
  title: string;
  labelPosition: LabelPosition;
  showLabels: boolean;
  /** The link of the list on screen: what `encode` writes for `title` and `tiers`. */
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
export type ListEncoder = (title: string, tiers: Tier[]) => string;

/** Writes waiting to show up in the address. Far more than ever pile up between two renders. */
const MAX_PENDING_WRITES = 50;

export function initialTierListState(loaded: LoadedList, address: string | null, encode: ListEncoder): TierListState {
  return {
    tiers: loaded.tiers,
    title: loaded.title,
    labelPosition: 'left',
    showLabels: true,
    link: encode(loaded.title, loaded.tiers),
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

export function createTierListReducer(encode: ListEncoder) {
  /** A change to the list: records a write when the link changes. */
  const edit = (state: TierListState, tiers: Tier[], title: string = state.title): TierListState => {
    const link = encode(title, tiers);
    if (link === state.link) return state;
    const write = {id: state.nextWriteId, link};
    return {
      ...state,
      tiers,
      title,
      link,
      writes: [...state.writes, write].slice(-MAX_PENDING_WRITES),
      nextWriteId: state.nextWriteId + 1,
    };
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
        const {tiers, title, decoded} = action.loaded;
        return {
          ...state,
          tiers,
          title,
          link: encode(title, tiers),
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
        return edit(state, moveTier(state.tiers, action.from, action.to));
      case 'tierRenamed':
        return edit(state, state.tiers.map((tier, index) => (index === action.index ? {...tier, name: action.name} : tier)));
      case 'itemDeleted':
        return edit(state, deleteItem(state.tiers, action.itemId));
      case 'itemRestored':
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
        return action.labelPosition === state.labelPosition ? state : {...state, labelPosition: action.labelPosition};
      case 'labelsToggled':
        return {...state, showLabels: !state.showLabels};
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

function reorder<T>(list: readonly T[], startIndex: number, endIndex: number): T[] {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

/** Moves an item within its tier or into another tier (a drop of drag and drop). */
function moveItem(tiers: Tier[], from: ItemPosition, to: ItemPosition): Tier[] {
  const sourceIndex = tiers.findIndex(tier => tier.id === from.tierId);
  const destinationIndex = tiers.findIndex(tier => tier.id === to.tierId);
  if (sourceIndex === -1 || destinationIndex === -1) return tiers;
  const source = tiers[sourceIndex];
  if (from.index < 0 || from.index >= source.items.length) return tiers;

  if (sourceIndex === destinationIndex) {
    const items = reorder(source.items, from.index, to.index);
    return tiers.map((tier, index) => (index === sourceIndex ? {...tier, items} : tier));
  }
  const sourceItems = [...source.items];
  const [moved] = sourceItems.splice(from.index, 1);
  const destinationItems = [...tiers[destinationIndex].items];
  destinationItems.splice(to.index, 0, moved);
  return tiers.map((tier, index) => {
    if (index === sourceIndex) return {...tier, items: sourceItems};
    if (index === destinationIndex) return {...tier, items: destinationItems};
    return tier;
  });
}

/**
 * Moves a row. Tier labels describe positions (product rule 6): the contents and the tier id
 * move, the names stay in place from top to bottom.
 */
function moveTier(tiers: Tier[], from: number, to: number): Tier[] {
  return reorder(tiers, from, to).map((tier, index) => ({...tier, name: tiers[index].name}));
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
 * Adds items at the end of the last tier (Unranked). An item is left out when the list
 * already holds an item with its id or its label.
 */
function addItems(tiers: Tier[], newItems: Item[]): Tier[] {
  if (tiers.length === 0) return tiers;
  const uniqueNewItems = newItems.filter(newItem =>
    !tiers.some(tier => tier.items.some(item => item.id === newItem.id || item.content === newItem.content))
  );
  const lastIndex = tiers.length - 1;
  return tiers.map((tier, index) => (index === lastIndex ? {...tier, items: [...tier.items, ...uniqueNewItems]} : tier));
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
