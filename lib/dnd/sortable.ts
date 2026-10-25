import {parseDndId} from './ids';
import type {ItemMove, RowMove} from './model';

/**
 * What the adapter reads from a dnd-kit sortable at the end of a drag (the `source` of the
 * drag operation). dnd-kit moves the element in the page while it is dragged (optimistic
 * sorting) and keeps the start in `initialIndex`/`initialGroup` and the drop position in
 * `index`/`group`. Typed here by shape, so this file needs no dnd-kit import.
 */
export interface SortableSnapshot {
  id: unknown;
  index: number;
  group?: unknown;
  initialIndex: number;
  initialGroup?: unknown;
}

/** Reads the sortable fields of a dnd-kit draggable, or null when it is not a sortable. */
export function toSortableSnapshot(source: unknown): SortableSnapshot | null {
  if (typeof source !== 'object' || source === null) return null;
  const {id, index, group, initialIndex, initialGroup} = source as Record<string, unknown>;
  if (typeof index !== 'number' || typeof initialIndex !== 'number') return null;
  return {id, index, group, initialIndex, initialGroup};
}

/**
 * The item move that a finished item drag describes, or null when the item ends where it
 * started or the snapshot is not an item of a tier (ids from lib/dnd/ids.ts).
 */
export function itemMoveFromSortable(source: SortableSnapshot): ItemMove | null {
  const item = parseDndId(source.id);
  const from = parseDndId(source.initialGroup);
  const to = parseDndId(source.group);
  if (item?.kind !== 'item' || from?.kind !== 'tier' || to?.kind !== 'tier') return null;
  if (!Number.isInteger(source.initialIndex) || !Number.isInteger(source.index)) return null;
  if (from.id === to.id && source.initialIndex === source.index) return null;
  return {
    itemId: item.id,
    from: {tierId: from.id, index: source.initialIndex},
    to: {tierId: to.id, index: source.index},
  };
}

/** The row move that a finished row drag describes, or null when the row ends where it started. */
export function rowMoveFromSortable(source: SortableSnapshot): RowMove | null {
  if (parseDndId(source.id)?.kind !== 'row') return null;
  if (!Number.isInteger(source.initialIndex) || !Number.isInteger(source.index)) return null;
  if (source.initialIndex === source.index) return null;
  return {from: source.initialIndex, to: source.index};
}
