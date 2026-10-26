import {findItem, moveItem} from './moves';
import type {ItemLike, ItemMove, RowMove, TierLike} from './model';

/**
 * The list as it shows during a drag (the preview). The list itself changes only on drop:
 * one history entry per change (product rule 2). During the drag the editor shows a preview,
 * a copy of the list that these functions update on every event, and on drop the editor turns
 * the difference between the list and the preview into one move.
 *
 * Pure functions. They return the input array itself when nothing changes, so the caller can
 * skip a render (and the screen reader skips an announcement).
 */

/** What the pointer is over during an item drag. */
export type ItemOver =
  /** Another item. `after` is true when the pointer is past the item's centre (to its right). */
  | {kind: 'item'; itemId: string; after: boolean}
  /** The free space of a row's item area (also an empty row). */
  | {kind: 'tier'; tierId: string};

/**
 * The preview after the dragged item moves over something:
 * - over another item: it goes just before that item, or just after it when `after` is true
 *   (in its own row as well as in another one);
 * - over the free space of another row: it goes to the end of that row;
 * - over the free space of its own row, or over itself: nothing changes.
 *
 * The place depends only on where the pointer is, never on the way it came. So with tiles of
 * different widths the preview settles: once the item has moved, the pointer is over the item
 * itself or over the same half of the same tile, and nothing changes any more.
 */
export function previewItemOver<I extends ItemLike, T extends TierLike<I>>(preview: T[], itemId: string, over: ItemOver): T[] {
  const from = findItem(preview, itemId);
  if (!from) return preview;
  if (over.kind === 'tier') {
    if (over.tierId === from.tierId) return preview;
    const target = preview.find(tier => tier.id === over.tierId);
    return target ? moveItem(preview, from, {tierId: target.id, index: target.items.length}) : preview;
  }
  if (over.itemId === itemId) return preview;
  const to = findItem(preview, over.itemId);
  if (!to) return preview;
  // In its own row, the target's index counts the row without the dragged item.
  const index = to.tierId === from.tierId && to.index > from.index ? to.index - 1 : to.index;
  return moveItem(preview, from, {tierId: to.tierId, index: index + (over.after ? 1 : 0)});
}

/**
 * The preview after a dragged row moves over another row: it takes that row's place, with
 * its label. The labels go back to their positions on drop (rowMoveFromPreview, then
 * reorderRows), as with the editor's drag and drop before.
 */
export function previewRowOver<T extends TierLike>(preview: T[], tierId: string, overTierId: string): T[] {
  const from = preview.findIndex(tier => tier.id === tierId);
  const to = preview.findIndex(tier => tier.id === overTierId);
  return moveRowInPreview(preview, from, to);
}

/** The preview with the row at `from` moved to `to`, label included. Unknown indexes change nothing. */
export function moveRowInPreview<T extends TierLike>(preview: T[], from: number, to: number): T[] {
  const valid = (index: number) => Number.isInteger(index) && index >= 0 && index < preview.length;
  if (!valid(from) || !valid(to) || from === to) return preview;
  const rows = preview.slice();
  const [row] = rows.splice(from, 1);
  rows.splice(to, 0, row);
  return rows;
}

/**
 * The item move from the list to the preview: where the item is in the list, and where the
 * preview put it. Null when it ends where it started, or when either list lacks it.
 */
export function itemMoveFromPreview(tiers: readonly TierLike[], preview: readonly TierLike[], itemId: string): ItemMove | null {
  const from = findItem(tiers, itemId);
  const to = findItem(preview, itemId);
  if (!from || !to || (from.tierId === to.tierId && from.index === to.index)) return null;
  return {itemId, from, to};
}

/** The row move from the list to the preview, by row index. Null when the row ends where it started. */
export function rowMoveFromPreview(tiers: readonly TierLike[], preview: readonly TierLike[], tierId: string): RowMove | null {
  const from = tiers.findIndex(tier => tier.id === tierId);
  const to = preview.findIndex(tier => tier.id === tierId);
  if (from < 0 || to < 0 || from === to) return null;
  return {from, to};
}
