import type Tier from '@/models/Tier';
import type {ItemLike, ItemPosition, TierLike} from './model';

/**
 * List changes made by dragging: moving items between and inside rows, reordering rows, and
 * adding or removing rows (#182). Pure functions. They never change their input. They return
 * the input array itself when nothing changes (a drop where the drag started, or input that
 * does not fit the list), so the caller can skip the history entry:
 *
 *   const next = moveItem(tiers, from, to);
 *   if (next !== tiers) onTiersUpdate(next); // router.push: one Back step per real change
 *
 * Rows and items that do not change keep their object identity, so memoised rows do not
 * re-render.
 */

/** The most rows a list may have, Unranked included. Owner decision; must not exceed the row cap of the link decoder. */
export const MAX_TIER_ROWS = 20;

/** The fewest ranked rows (rows above Unranked) a list keeps when rows are removed. */
export const MIN_RANKED_ROWS = 1;

function isIndex(value: number, length: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < length;
}

/** Where an item is, or null. With duplicate ids (old links can hold them) the first wins. */
export function findItem(tiers: readonly TierLike[], itemId: string): ItemPosition | null {
  for (const tier of tiers) {
    const index = tier.items.findIndex(item => item.id === itemId);
    if (index >= 0) return {tierId: tier.id, index};
  }
  return null;
}

/**
 * Moves one item. `to.index` is the item's index after the move (see ItemMove). Inside one
 * row it must be a valid index of that row; into another row it may also be the row's length
 * (the end). Unknown rows or indexes leave the list unchanged.
 */
export function moveItem<I extends ItemLike, T extends TierLike<I>>(tiers: T[], from: ItemPosition, to: ItemPosition): T[] {
  const fromRow = tiers.findIndex(tier => tier.id === from.tierId);
  const toRow = tiers.findIndex(tier => tier.id === to.tierId);
  if (fromRow < 0 || toRow < 0) return tiers;
  const source = tiers[fromRow];
  if (!isIndex(from.index, source.items.length)) return tiers;

  if (fromRow === toRow) {
    if (!isIndex(to.index, source.items.length) || to.index === from.index) return tiers;
    const items = source.items.slice();
    const [moved] = items.splice(from.index, 1);
    items.splice(to.index, 0, moved);
    return tiers.map((tier, row) => (row === fromRow ? {...tier, items} : tier));
  }

  const target = tiers[toRow];
  if (!isIndex(to.index, target.items.length + 1)) return tiers;
  const sourceItems = source.items.slice();
  const [moved] = sourceItems.splice(from.index, 1);
  const targetItems = target.items.slice();
  targetItems.splice(to.index, 0, moved);
  return tiers.map((tier, row) => {
    if (row === fromRow) return {...tier, items: sourceItems};
    if (row === toRow) return {...tier, items: targetItems};
    return tier;
  });
}

/**
 * Moves a whole row from one position to another. Tier labels describe positions (product
 * rule 6): the contents move (items, id and every other field), and each position keeps its
 * label. This is the editor's behaviour today, Unranked row included.
 */
export function reorderRows<T extends TierLike>(tiers: T[], from: number, to: number): T[] {
  if (!isIndex(from, tiers.length) || !isIndex(to, tiers.length) || from === to) return tiers;
  const moved = tiers.slice();
  const [row] = moved.splice(from, 1);
  moved.splice(to, 0, row);
  return moved.map((tier, index) => (tier.name === tiers[index].name ? tier : {...tier, name: tiers[index].name}));
}

/** A tier id that no row uses: tier-1, tier-2... (the row template ids use letters). */
export function newTierId(tiers: readonly TierLike[]): string {
  const used = new Set(tiers.map(tier => tier.id));
  let n = 1;
  while (used.has(`tier-${n}`)) n++;
  return `tier-${n}`;
}

export interface AddTierOptions {
  /** Label of the new row. Default: empty, so the row reads "Tier <n>". */
  name?: string;
  /** Position of the new row. Default: just above Unranked. Unranked always stays last. */
  index?: number;
  /** Row limit, Unranked included. Default: MAX_TIER_ROWS. */
  maxRows?: number;
}

export function canAddTier(tiers: readonly TierLike[], maxRows = MAX_TIER_ROWS): boolean {
  return tiers.length >= 1 && tiers.length < maxRows;
}

/**
 * Adds an empty row (#182) above Unranked, or at `index` (moved up to keep Unranked last).
 * The new row gets a fresh id and the Unranked row's label position. Returns the new list
 * and the new row's id (for focusing its label), or null when the list is full.
 */
export function addTier(tiers: Tier[], options: AddTierOptions = {}): {tiers: Tier[]; id: string} | null {
  if (!canAddTier(tiers, options.maxRows)) return null;
  const last = tiers.length - 1;
  const wanted = options.index !== undefined && Number.isFinite(options.index) ? Math.trunc(options.index) : last;
  const index = Math.min(Math.max(wanted, 0), last);
  const id = newTierId(tiers);
  const {labelPosition} = tiers[last];
  const tier: Tier = {id, name: options.name ?? '', items: [], ...(labelPosition && {labelPosition})};
  return {tiers: [...tiers.slice(0, index), tier, ...tiers.slice(index)], id};
}

export function canRemoveTier(tiers: readonly TierLike[], index: number): boolean {
  const rankedRows = tiers.length - 1;
  return isIndex(index, rankedRows) && rankedRows > MIN_RANKED_ROWS;
}

/**
 * Removes a ranked row (#182). Its items go to the end of Unranked, so nothing is lost. The
 * Unranked row cannot be removed, and at least MIN_RANKED_ROWS ranked rows stay. Returns the
 * input itself when the row cannot be removed.
 */
export function removeTier<I extends ItemLike, T extends TierLike<I>>(tiers: T[], index: number): T[] {
  if (!canRemoveTier(tiers, index)) return tiers;
  const last = tiers.length - 1;
  const unranked = tiers[last];
  return [
    ...tiers.slice(0, index),
    ...tiers.slice(index + 1, last),
    {...unranked, items: [...unranked.items, ...tiers[index].items]},
  ];
}
