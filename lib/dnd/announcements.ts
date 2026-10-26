import {parseDndId} from './ids';
import {itemLabel, tierPhrase} from './labels';
import {findItem} from './moves';
import type {ItemPosition, TierLike} from './model';

/**
 * What screen readers hear while someone drags with the keyboard (or a pointer). The texts
 * name rows by their labels ("tier S", "Unranked", "Tier 3") and items by their labels,
 * never by internal ids. Positions count from 1.
 *
 * `tiers` is always the list as it was when the drag started: the list itself changes only
 * on drop (one history entry per change, product rule 2), while the editor shows a preview
 * during the drag (lib/dnd/preview.ts).
 */

/** Read once when a draggable gets focus (aria-describedby). */
export const SCREEN_READER_INSTRUCTIONS =
  'To pick up an item or a row, press Space or Enter. Use the arrow keys to move it. ' +
  'Press Space or Enter again to drop it, or press Escape to cancel.';

/** The moments of a drag that get an announcement. */
export type DragPhase = 'start' | 'over' | 'drop' | 'cancel';

function positionText(tiers: readonly TierLike[], row: number, index: number, count: number): string {
  return `${tierPhrase(tiers, row)}, position ${index + 1} of ${count}`;
}

/**
 * The announcement for an item drag. `from` is where the item was when the drag started;
 * `to` is where it would land now (for 'over' and 'drop'). Returns undefined when the input
 * does not fit the list. Then nothing is announced, so no id ever reaches a screen reader.
 */
export function itemAnnouncement(
  phase: DragPhase,
  tiers: readonly TierLike[],
  itemId: string,
  from: ItemPosition,
  to?: ItemPosition | null,
): string | undefined {
  const fromRow = tiers.findIndex(tier => tier.id === from.tierId);
  const item = tiers[fromRow]?.items[from.index];
  if (!item || item.id !== itemId) return undefined;
  const name = itemLabel(item);
  const start = positionText(tiers, fromRow, from.index, tiers[fromRow].items.length);

  if (phase === 'start') return `Picked up ${name}, in ${start}.`;
  if (phase === 'cancel') return `Move cancelled. ${name} is back in ${start}.`;

  if (!to) return undefined;
  const toRow = tiers.findIndex(tier => tier.id === to.tierId);
  if (toRow < 0) return undefined;
  const count = tiers[toRow].items.length + (toRow === fromRow ? 0 : 1);
  if (!Number.isInteger(to.index) || to.index < 0 || to.index >= count) return undefined;
  const unchanged = toRow === fromRow && to.index === from.index;
  const target = positionText(tiers, toRow, to.index, count);

  if (phase === 'over') return unchanged ? `${name} is back in ${start}.` : `${name} moves to ${target}.`;
  return unchanged ? `Dropped ${name}. It stays in ${start}.` : `Dropped ${name} in ${target}.`;
}

/**
 * The announcement for a row drag (by its handle). Labels stay in place (product rule 6), so
 * the texts say where the row's items go, named by the label of the target position.
 */
export function rowAnnouncement(
  phase: DragPhase,
  tiers: readonly TierLike[],
  from: number,
  to?: number | null,
): string | undefined {
  const count = tiers.length;
  if (!Number.isInteger(from) || from < 0 || from >= count) return undefined;
  const start = tierPhrase(tiers, from);

  if (phase === 'start') return `Picked up the items of ${start}, row ${from + 1} of ${count}. The tier labels stay in place.`;
  if (phase === 'cancel') return `Move cancelled. The items stay in ${start}.`;

  if (to === undefined || to === null || !Number.isInteger(to) || to < 0 || to >= count) return undefined;
  const target = tierPhrase(tiers, to);
  if (phase === 'over') {
    return to === from ? `The items of ${start} stay in place.` : `The items of ${start} move to ${target}, row ${to + 1} of ${count}.`;
  }
  return to === from ? `Dropped. The items stay in ${start}.` : `Dropped. The items of ${start} are now in ${target}.`;
}

/**
 * The announcement for a drag by the dnd-kit id of what is dragged (an item or a row), or
 * undefined. `tiers` is the list from the start of the drag; `preview` is the list as the
 * drag shows it now (lib/dnd/preview.ts), so 'over' and 'drop' name the position after the
 * move, as the screen shows it.
 */
export function previewAnnouncement(
  phase: DragPhase,
  tiers: readonly TierLike[],
  preview: readonly TierLike[],
  dndId: unknown,
): string | undefined {
  const parsed = parseDndId(dndId);
  if (parsed?.kind === 'item') {
    const from = findItem(tiers, parsed.id);
    if (!from) return undefined;
    return itemAnnouncement(phase, tiers, parsed.id, from, findItem(preview, parsed.id));
  }
  if (parsed?.kind === 'row') {
    const from = tiers.findIndex(tier => tier.id === parsed.id);
    if (from < 0) return undefined;
    const to = preview.findIndex(tier => tier.id === parsed.id);
    return rowAnnouncement(phase, tiers, from, to < 0 ? null : to);
  }
  return undefined;
}
