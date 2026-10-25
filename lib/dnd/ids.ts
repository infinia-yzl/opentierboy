/**
 * Ids that the adapter gives dnd-kit. dnd-kit keeps draggables and droppables by id, and one
 * tier needs two of them (the row, which is sortable, and the area that holds its items), so
 * every id gets a prefix: `item:<item id>`, `row:<tier id>`, `tier:<tier id>`. The prefix
 * also keeps an item id from ever clashing with a tier id.
 */

export type DndIdKind = 'item' | 'row' | 'tier';

/** dnd-kit `type` values: items and rows never accept each other. */
export const DND_TYPES = {item: 'item', row: 'row'} as const;

/** dnd-kit sortable group of the rows. Items use their tier's `tierItemsDndId`. */
export const ROWS_GROUP = 'rows';

/** Id of an item tile (a sortable). */
export function itemDndId(itemId: string): string {
  return `item:${itemId}`;
}

/** Id of a tier row (a sortable, moved by its handle). */
export function rowDndId(tierId: string): string {
  return `row:${tierId}`;
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
  if (kind !== 'item' && kind !== 'row' && kind !== 'tier') return null;
  return {kind, id: id.slice(colon + 1)};
}
