import type Item from "@/models/Item";
import type Tier from "@/models/Tier";

/**
 * What screen readers hear during a drag (the live region of @hello-pangea/dnd). The library's
 * own messages name lists by their drop ids, which are internal ("items:tier-c"). These keep
 * its sentences but name rows and items as people see them, with the same rules as Phase 5e's
 * lib/dnd/labels.ts: a row is "tier S", "Unranked" or "Tier 3", an item is its label.
 * Positions count from 1.
 */

/** A row's accessible name: its label, "Unranked" for the unnamed last row, or "Tier <n>". */
export function tierLabel(tiers: readonly Tier[], index: number): string {
  const name = trimmed(tiers[index]?.name);
  if (name) return name;
  return index === tiers.length - 1 ? 'Unranked' : `Tier ${index + 1}`;
}

/**
 * A row inside a sentence: "tier S", "Unranked", "Tier 3". A label that already starts with
 * the word "tier" stays as it is.
 */
export function tierPhrase(tiers: readonly Tier[], index: number): string {
  const label = tierLabel(tiers, index);
  const name = trimmed(tiers[index]?.name);
  if (!name || /^tier\b/i.test(name)) return label;
  return `tier ${label}`;
}

/** An item's name: its label, or "Unnamed item" when the label is empty. */
export function itemLabel(item: Pick<Item, 'content'> | undefined): string {
  return trimmed(item?.content) || 'Unnamed item';
}

/** Where an item is: the id of its tier and its index in that tier. */
export interface ItemSpot {
  tierId: string;
  index: number;
}

/** A drag as the announcements need it: an item between rows, or a whole row. */
export type DragSubject =
  | {kind: 'item'; from: ItemSpot; to?: ItemSpot | null}
  | {kind: 'row'; from: number; to?: number | null};

/** The message when a drag starts. `tiers` is the list as it was when the drag started. */
export function dragStartMessage(tiers: readonly Tier[], drag: DragSubject): string {
  if (drag.kind === 'row') {
    return `You have lifted an item: the items of ${tierPhrase(tiers, drag.from)}, in row ${drag.from + 1} of ${tiers.length}. The tier labels stay in place.`;
  }
  const row = rowOf(tiers, drag.from.tierId);
  return `You have lifted an item: ${itemLabel(tiers[row]?.items[drag.from.index])}, in position ${drag.from.index + 1} in ${tierPhrase(tiers, row)}.`;
}

/** The message when the drop position changes during a drag. */
export function dragUpdateMessage(tiers: readonly Tier[], drag: DragSubject): string {
  if (drag.to === undefined || drag.to === null) return 'You are currently not dragging over a droppable area.';
  if (drag.kind === 'row') {
    if (drag.to === drag.from) return `The items of ${tierPhrase(tiers, drag.from)} are back in their row.`;
    return `You have moved the items of ${tierPhrase(tiers, drag.from)} to row ${drag.to + 1}, ${tierPhrase(tiers, drag.to)}.`;
  }
  const fromRow = rowOf(tiers, drag.from.tierId);
  const toRow = rowOf(tiers, drag.to.tierId);
  const name = itemLabel(tiers[fromRow]?.items[drag.from.index]);
  if (fromRow === toRow) {
    return `You have moved ${name} from position ${drag.from.index + 1} to position ${drag.to.index + 1} in ${tierPhrase(tiers, fromRow)}.`;
  }
  return `You have moved ${name} from position ${drag.from.index + 1} in ${tierPhrase(tiers, fromRow)} to position ${drag.to.index + 1} in ${tierPhrase(tiers, toRow)}.`;
}

/** The message when a drag ends: dropped, or cancelled (`cancelled`) or dropped outside. */
export function dragEndMessage(tiers: readonly Tier[], drag: DragSubject, cancelled: boolean): string {
  if (drag.kind === 'row') {
    const start = tierPhrase(tiers, drag.from);
    if (cancelled) return `Movement cancelled. The items of ${start} are back in their row.`;
    if (drag.to === undefined || drag.to === null || drag.to === drag.from) return `You have dropped the item. The items of ${start} stay in their row.`;
    return `You have dropped the item. The items of ${start} are now in ${tierPhrase(tiers, drag.to)}.`;
  }
  const fromRow = rowOf(tiers, drag.from.tierId);
  const name = itemLabel(tiers[fromRow]?.items[drag.from.index]);
  const start = `position ${drag.from.index + 1} in ${tierPhrase(tiers, fromRow)}`;
  if (cancelled) return `Movement cancelled. ${name} has returned to ${start}.`;
  if (drag.to === undefined || drag.to === null) return `${name} was dropped outside the tiers. It has returned to ${start}.`;
  const toRow = rowOf(tiers, drag.to.tierId);
  if (toRow === fromRow && drag.to.index === drag.from.index) return `You have dropped the item ${name}. It stays in ${start}.`;
  return `You have dropped the item ${name}. It has moved from ${start} to position ${drag.to.index + 1} in ${tierPhrase(tiers, toRow)}.`;
}

function rowOf(tiers: readonly Tier[], tierId: string): number {
  return tiers.findIndex(tier => tier.id === tierId);
}

/** Labels come from shared links, so a value that is not a string counts as empty. */
function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
