
export type DndIdKind = 'item' | 'row' | 'tier' | 'stack';

export const DND_TYPES = {item: 'item', row: 'row', stack: 'stack'} as const;

/** dnd-kit sortable group of the rows. Items use their tier's `tierItemsDndId`. */
export const ROWS_GROUP = 'rows';

/** Id of an item tile (a sortable). */
export function itemDndId(itemId: string): string {
  return `item:${itemId}`;
}

export function rowDndId(tierId: string): string {
  return `row:${tierId}`;
}

export function stackDndId(tierId: string): string {
  return `stack:${tierId}`;
}

/** Id of the area of a tier row that holds its items (a droppable and the items' group). */
export function tierItemsDndId(tierId: string): string {
  return `tier:${tierId}`;
}

/**
 * Reads an id made by the functions above. Everything after the first colon is the app's id,
 * so app ids may contain colons. Returns null for anything else.
 */
export function parseDndId(id: unknown): {kind: DndIdKind; id: string} | null {
  if (typeof id !== 'string') return null;
  const colon = id.indexOf(':');
  if (colon < 0) return null;
  const kind = id.slice(0, colon);
  if (kind !== 'item' && kind !== 'row' && kind !== 'tier' && kind !== 'stack') return null;
  return {kind, id: id.slice(colon + 1)};
}

/**
 * An item tile never changes its item (lib/dnd/react.tsx, DraggableTierItem keys each tile by
 * its item id). Throws a TypeError, a programmer error, when a tile first made for
 * `firstItemId` is rendered for `itemId`.
 */
export function assertSameTileItem(firstItemId: string, itemId: string): void {
  if (itemId !== firstItemId) {
    throw new TypeError(`An item tile cannot change its item (first "${firstItemId}", now "${itemId}"): render each tile with DraggableTierItem, which keys it by its item id.`);
  }
}
