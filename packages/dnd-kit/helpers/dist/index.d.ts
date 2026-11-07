import { UniqueIdentifier, Draggable, Droppable, DragDropManager, DragDropEventMap } from '@dnd-kit/abstract';

/**
 * Move an array item to a different position. Returns a new array with the item moved to the new position.
 */
declare function arrayMove<T extends any[]>(array: T, from: number, to: number): T;
/**
 * Swap two array items with each other. Returns a new array with the two items at `from` and `to` exchanged in place.
 */
declare function arraySwap<T extends any[]>(array: T, from: number, to: number): T;
type Items = UniqueIdentifier[] | {
    id: UniqueIdentifier;
}[];
declare function move<T extends Items | Record<UniqueIdentifier, Items>, U extends Draggable, V extends Droppable, W extends DragDropManager<U, V>>(items: T, event: DragDropEventMap<U, V, W>['dragover'] | DragDropEventMap<U, V, W>['dragend']): T;
declare function swap<T extends Items | Record<UniqueIdentifier, Items>, U extends Draggable, V extends Droppable, W extends DragDropManager<U, V>>(items: T, event: DragDropEventMap<U, V, W>['dragover'] | DragDropEventMap<U, V, W>['dragend']): T;

export { arrayMove, arraySwap, move, swap };
