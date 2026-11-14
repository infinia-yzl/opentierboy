import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {keyboardDragMachine} from '../machines/keyboard-drag';
import {defineModel, offered, type When} from '../support/machines';

/** The one tile of every run, and the rows of the list, top to bottom, by their accessible names. */
export const KEYBOARD_DRAG_ITEM = 'Mauga';
export const KEYBOARD_DRAG_ROWS = ['S', 'A', 'Unranked'] as const;
export type KeyboardDragRow = typeof KEYBOARD_DRAG_ROWS[number];

/** What one state of the keyboard drag machine shows. */
export interface KeyboardDragView {
  /** The row whose tiles hold Mauga on screen: where it rests, or, while carried, where it would land. */
  readonly shownIn: KeyboardDragRow;
  /** The row that holds Mauga in the link (the address bar). It changes only on a drop that moves it. */
  readonly linkIn: KeyboardDragRow;
  /** True while Mauga is picked up. */
  readonly carried: boolean;
  /** The text of the drag announcer (the live region screen readers read). */
  readonly heard: string;
  /** The rows from top to bottom, by label: row S moves whole by its grip. */
  readonly order: readonly KeyboardDragRow[];
}

export type KeyboardDragSnapshot = SnapshotFrom<typeof keyboardDragMachine>;
export type KeyboardDragEvent = EventFrom<typeof keyboardDragMachine>;

/** A row inside a sentence, as lib/dnd/labels.ts (tierPhrase) says it. */
const phrase = (row: KeyboardDragRow) => (row === 'Unranked' ? 'Unranked' : `row ${row}`);
const place = (row: KeyboardDragRow) => `${phrase(row)}, position 1 of 1`;
const item = KEYBOARD_DRAG_ITEM;

/** The two orders of the rows: the machine's top-level states. */
const ORDERS = {sFirst: ['S', 'A', 'Unranked'], aFirst: ['A', 'S', 'Unranked']} as const;

/** Each state of the machine, by its path, and what it shows (texts from lib/dnd/announcements.ts). */
const KEYBOARD_DRAG_VIEWS: Readonly<Record<string, KeyboardDragView>> = Object.fromEntries(
  Object.entries(ORDERS).flatMap(([key, order]) => {
    const resting = (row: KeyboardDragRow, heard: string): KeyboardDragView => ({shownIn: row, linkIn: row, carried: false, heard, order});
    const carrying = (from: KeyboardDragRow, over: KeyboardDragRow, heard: string): KeyboardDragView => ({shownIn: over, linkIn: from, carried: true, heard, order});
    return [
      [`${key}.resting.inUnranked.opened`, resting('Unranked', '')],
      ...KEYBOARD_DRAG_ROWS.flatMap((row) => [
        [`${key}.resting.in${row}.dropped`, resting(row, `Dropped ${item} in ${place(row)}.`)],
        [`${key}.resting.in${row}.stayed`, resting(row, `Dropped ${item}. It stays in ${place(row)}.`)],
        [`${key}.resting.in${row}.cancelled`, resting(row, `Move cancelled. ${item} is back in ${place(row)}.`)],
        [`${key}.resting.in${row}.rowDown`, resting(row, 'Dropped row S at position 2 of 2.')],
        [`${key}.resting.in${row}.rowUp`, resting(row, 'Dropped row S at position 1 of 2.')],
        [`${key}.carrying.from${row}.pickedUp`, carrying(row, row, `Picked up ${item}, in ${place(row)}.`)],
        ...KEYBOARD_DRAG_ROWS.map((over) => [
          `${key}.carrying.from${row}.over${over}`,
          carrying(row, over, over === row ? `${item} is back in ${place(row)}.` : `${item} moves to ${place(over)}.`),
        ]),
      ]),
    ];
  }),
);

/** The dotted path of a snapshot's state, such as 'sFirst.carrying.fromS.overA'. */
export function statePath(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${statePath(child)}`;
}

/** What the page shows in a state of the keyboard drag machine. */
export function keyboardDragViewOf(snapshot: KeyboardDragSnapshot): KeyboardDragView {
  const view = KEYBOARD_DRAG_VIEWS[statePath(snapshot.value)];
  if (!view) throw new RangeError(`No view for the keyboard drag state ${statePath(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});
/**
 * Up, Down and Escape are sent while Mauga is picked up, also Up and Down at the top and bottom
 * rows, and at rest once focus came back to the tile after a drop, a cancel or a row move: where
 * the machine takes none of them, the page must ignore them. The list as opened has nothing
 * focused. Row S moves by its grip only at rest, down while it is first and up while it is second.
 */
const onFocusedTile = ({snapshot}: When) => !snapshot.matches({sFirst: {resting: {inUnranked: 'opened'}}});

export const keyboardDragModel = defineModel({
  id: 'keyboard-drag',
  machine: keyboardDragMachine,
  events: {
    PRESS_SPACE: {generate: constant, when: offered('PRESS_SPACE')},
    PRESS_ENTER: {generate: constant, when: offered('PRESS_ENTER')},
    PRESS_UP: {generate: constant, when: onFocusedTile},
    PRESS_DOWN: {generate: constant, when: onFocusedTile},
    PRESS_ESCAPE: {generate: constant, when: onFocusedTile},
    MOVE_ROW_S_DOWN: {generate: constant, when: offered('MOVE_ROW_S_DOWN')},
    MOVE_ROW_S_UP: {generate: constant, when: offered('MOVE_ROW_S_UP')},
  },
});
