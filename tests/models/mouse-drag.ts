import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {mouseDragMachine} from '../machines/mouse-drag';
import {always, defineModel, offered, type When} from '../support/machines';

/** The tile every drag moves, the tile that moves only with its row, and the rows top to bottom. */
export const MOUSE_DRAG_ITEM = 'Mauga';
export const MOUSE_DRAG_OTHER_ITEM = 'Winston';
export const MOUSE_DRAG_ROWS = ['S', 'A', 'Unranked'] as const;
export type MouseDragRow = typeof MOUSE_DRAG_ROWS[number];

/**
 * What one state of the mouse drag machine shows: the rows from top to bottom, by label, and the
 * tiles of each row, in order, on screen and in the link.
 */
export interface MouseDragView {
  readonly order: readonly MouseDragRow[];
  readonly items: Readonly<Record<MouseDragRow, readonly string[]>>;
}

export type MouseDragSnapshot = SnapshotFrom<typeof mouseDragMachine>;
export type MouseDragEvent = EventFrom<typeof mouseDragMachine>;

const M = MOUSE_DRAG_ITEM;
const W = MOUSE_DRAG_OTHER_ITEM;
const rows = (S: string[], A: string[], Unranked: string[]) => ({S, A, Unranked});

/** Each state of the tiles region, by its path, and the tiles of each row. */
const MOUSE_DRAG_TILES: Readonly<Record<string, MouseDragView['items']>> = {
  'winstonInS.maugaInUnranked': rows([W], [], [M]),
  'winstonInS.maugaInA': rows([W], [M], []),
  'winstonInS.maugaFirst': rows([M, W], [], []),
  'winstonInS.maugaLast': rows([W, M], [], []),
  'winstonInA.maugaInUnranked': rows([], [W], [M]),
  'winstonInA.maugaInS': rows([M], [W], []),
  'winstonInA.maugaFirst': rows([], [M, W], []),
  'winstonInA.maugaLast': rows([], [W, M], []),
};

/** Each state of the order region and the rows it shows, top to bottom. */
const MOUSE_DRAG_ORDERS: Readonly<Record<string, readonly MouseDragRow[]>> = {
  sFirst: ['S', 'A', 'Unranked'],
  aFirst: ['A', 'S', 'Unranked'],
};

/** The dotted path of a state value, such as 'winstonInA.maugaFirst'. */
export function statePath(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${statePath(child)}`;
}

/** What the page shows in a state of the mouse drag machine (two regions: tiles and order). */
export function mouseDragViewOf(snapshot: MouseDragSnapshot): MouseDragView {
  const {tiles, order} = snapshot.value as {tiles: unknown; order: unknown};
  const items = MOUSE_DRAG_TILES[statePath(tiles)];
  const rowOrder = MOUSE_DRAG_ORDERS[statePath(order)];
  if (!items || !rowOrder) throw new RangeError(`No view for the mouse drag state ${JSON.stringify(snapshot.value)}`);
  return {order: rowOrder, items};
}

const constant = fc.constant({});

/** Sent where the machine takes it, and wherever else the pointer does not cross Winston on its way (see below). */
const freeSpaceDrag = (type: MouseDragEvent['type']) => ({snapshot}: When) => snapshot.can({type})
  || !(snapshot.matches({tiles: {winstonInS: 'maugaFirst'}}) || snapshot.matches({tiles: {winstonInA: 'maugaFirst'}}));

/**
 * Drags of Mauga are sent in every state: where the machine takes none (Mauga dropped on the free
 * space of its own row, just before Winston while it is already before him, on itself, or released
 * outside the rows), the page must change nothing. One exception: while Mauga is first in Winston's
 * row, a drag to the free space of that row crosses Winston on the way, and where Mauga lands
 * depends on the pointer's path (lib/dnd/preview.ts keeps the last place over the own row's free
 * space), so that drag is not sent there. A row's stack is dragged only where the row has items:
 * an empty row's stack is off. Both stack drags and both grip drags always change the list here,
 * because Winston keeps the two rows different and the rows have different labels.
 */
export const mouseDragModel = defineModel({
  id: 'mouse-drag',
  machine: mouseDragMachine,
  events: {
    DRAG_MAUGA_TO_S: {generate: constant, when: freeSpaceDrag('DRAG_MAUGA_TO_S')},
    DRAG_MAUGA_TO_A: {generate: constant, when: freeSpaceDrag('DRAG_MAUGA_TO_A')},
    DRAG_MAUGA_TO_UNRANKED: {generate: constant, when: freeSpaceDrag('DRAG_MAUGA_TO_UNRANKED')},
    DROP_MAUGA_BEFORE_WINSTON: {generate: constant, when: always},
    DROP_MAUGA_AFTER_WINSTON: {generate: constant, when: always},
    DROP_MAUGA_IN_PLACE: {generate: constant, when: always},
    RELEASE_MAUGA_OUTSIDE_ROWS: {generate: constant, when: always},
    DRAG_ITEMS_OF_S_ONTO_A: {generate: constant, when: offered('DRAG_ITEMS_OF_S_ONTO_A')},
    DRAG_ITEMS_OF_A_ONTO_S: {generate: constant, when: offered('DRAG_ITEMS_OF_A_ONTO_S')},
    DRAG_ROW_S_ONTO_A: {generate: constant, when: offered('DRAG_ROW_S_ONTO_A')},
    DRAG_ROW_A_ONTO_S: {generate: constant, when: offered('DRAG_ROW_A_ONTO_S')},
  },
});
