/**
 * Shared types of the drag and drop adapter (lib/dnd). Pure types: no React, no DOM, no
 * dnd-kit. See docs/reference/drag-and-drop.md for how the pieces fit together.
 */

/** The smallest shape of an item that the adapter needs. models/Item fits it. */
export interface ItemLike {
  id: string;
  content: string;
}

/** The smallest shape of a tier row that the adapter needs. models/Tier fits it. */
export interface TierLike<I extends ItemLike = ItemLike> {
  id: string;
  name: string;
  items: I[];
}

/**
 * Where an item sits: the id of its tier row and its index in that row (0-based).
 * The last row is the Unranked row. It is a tier like any other here.
 */
export interface ItemPosition {
  tierId: string;
  index: number;
}

/**
 * One item move. `to.index` is the item's index in the target row after the move, as with
 * @hello-pangea/dnd's `destination.index`: for a move inside one row it counts the row
 * without the moved item.
 */
export interface ItemMove {
  itemId: string;
  from: ItemPosition;
  to: ItemPosition;
}

/** One row move, by row index (0 is the top row). The labels stay in place. */
export interface RowMove {
  from: number;
  to: number;
}

/** An arrow key direction. */
export type Direction = 'up' | 'down' | 'left' | 'right';
