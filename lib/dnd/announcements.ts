import {parseDndId} from './ids';
import {itemLabel, tierPhrase} from './labels';
import {findItem} from './moves';
import type {ItemPosition, TierLike} from './model';

/**
 * What screen readers hear while someone drags with the keyboard (or a pointer). The texts
 * name rows by their labels ("row S", "Unranked", "Row 3") and items by their labels,
 * never by internal ids. Positions count from 1.
 *
 * `tiers` is always the list as it was when the drag started: the list itself changes only
 * on drop (one history entry per change, product rule 2), while the editor shows a preview
 * during the drag (lib/dnd/preview.ts).
 */

/** Read once when a draggable gets focus (aria-describedby). */
export const SCREEN_READER_INSTRUCTIONS =
  'To pick up an item, a row or the items of a row, press Space or Enter. Use the arrow keys to move it. ' +
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

/** The first letter in upper case, for a row phrase at the start of a sentence ("row S" → "Row S"). */
function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** True when `index` is a ranked row of the list (not Unranked, the last row, which never moves). */
function isRankedRow(tiers: readonly TierLike[], index: number | null | undefined): index is number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < tiers.length - 1;
}

/**
 * The announcement for a whole row moved by its grip: the row moves with its name and items
 * (owner decision, 2026-11-14). `tiers` is the list from the start of the drag, `preview` the
 * list as the drag shows it (for 'over', the row next to it). Positions count the ranked rows:
 * Unranked never moves.
 */
export function rowAnnouncement(
  phase: DragPhase,
  tiers: readonly TierLike[],
  from: number,
  to?: number | null,
  preview: readonly TierLike[] = tiers,
): string | undefined {
  if (!isRankedRow(tiers, from)) return undefined;
  const count = tiers.length - 1;
  const row = tierPhrase(tiers, from);
  const at = (index: number) => `position ${index + 1} of ${count}`;

  if (phase === 'start') return `Picked up ${row}, with its name and items. ${capitalised(at(from))}.`;
  if (phase === 'cancel') return `Move cancelled. ${capitalised(row)} is back at ${at(from)}.`;

  if (!isRankedRow(tiers, to)) return undefined;
  if (phase === 'over') {
    const next = to > 0 ? `, below ${tierPhrase(preview, to - 1)}` : count > 1 ? `, above ${tierPhrase(preview, 1)}` : '';
    return `${capitalised(row)}, ${at(to)}${next}.`;
  }
  return to === from ? `Dropped ${row}. It stays at ${at(from)}.` : `Dropped ${row} at ${at(to)}.`;
}

/** "the 3 items", "the 1 item": how a row's items are counted in a sentence. */
export function itemsCount(count: number): string {
  return `the ${count} item${count === 1 ? '' : 's'}`;
}

/**
 * The announcement for the items of a row moved by its stack. The labels stay in place
 * (product rule 6): the texts say where the items go, named by the label of the target position,
 * and whose items take their place. `tiers` is the list from the start of the drag.
 */
export function rowItemsAnnouncement(
  phase: DragPhase,
  tiers: readonly TierLike[],
  from: number,
  to?: number | null,
): string | undefined {
  if (!isRankedRow(tiers, from)) return undefined;
  const items = itemsCount(tiers[from].items.length);
  const start = tierPhrase(tiers, from);

  if (phase === 'start') return `Picked up ${items} of ${start}.`;
  if (phase === 'cancel') return `Move cancelled. ${capitalised(items)} stay in ${start}.`;

  if (!isRankedRow(tiers, to)) return undefined;
  const target = tierPhrase(tiers, to);
  if (phase === 'over') return to === from ? `${capitalised(items)}, back in ${start}.` : `${capitalised(items)}, over ${target}.`;
  if (to === from) return `Dropped. ${capitalised(items)} stay in ${start}.`;
  // The rows between move one place towards the start: one row when the two are neighbours.
  const shifted = Math.abs(to - from) === 1
    ? `${capitalised(target)}'s items are now in ${start}.`
    : `The items of ${tierPhrase(tiers, Math.min(from, to) + (to > from ? 1 : 0))} to ${tierPhrase(tiers, Math.max(from, to) - (to > from ? 0 : 1))} move ${to > from ? 'up' : 'down'} one row.`;
  return `Dropped ${items} in ${target}. ${shifted}`;
}

/**
 * The announcement for a drag by the dnd-kit id of what is dragged (an item, a row or a row's
 * stack), or
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
  if (parsed?.kind === 'row' || parsed?.kind === 'stack') {
    const from = tiers.findIndex(tier => tier.id === parsed.id);
    if (from < 0) return undefined;
    const found = preview.findIndex(tier => tier.id === parsed.id);
    const to = found < 0 ? null : found;
    return parsed.kind === 'row' ? rowAnnouncement(phase, tiers, from, to, preview) : rowItemsAnnouncement(phase, tiers, from, to);
  }
  return undefined;
}
