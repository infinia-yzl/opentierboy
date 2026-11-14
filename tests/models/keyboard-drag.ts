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
}

export type KeyboardDragSnapshot = SnapshotFrom<typeof keyboardDragMachine>;
export type KeyboardDragEvent = EventFrom<typeof keyboardDragMachine>;

/** A row inside a sentence, as lib/dnd/labels.ts (tierPhrase) says it. */
const phrase = (row: KeyboardDragRow) => (row === 'Unranked' ? 'Unranked' : `tier ${row}`);
const place = (row: KeyboardDragRow) => `${phrase(row)}, position 1 of 1`;
const item = KEYBOARD_DRAG_ITEM;

const resting = (row: KeyboardDragRow, heard: string): KeyboardDragView => ({shownIn: row, linkIn: row, carried: false, heard});
const carrying = (from: KeyboardDragRow, over: KeyboardDragRow, heard: string): KeyboardDragView => ({shownIn: over, linkIn: from, carried: true, heard});

/** Each state of the machine, by its path, and what it shows (texts from lib/dnd/announcements.ts). */
const KEYBOARD_DRAG_VIEWS: Readonly<Record<string, KeyboardDragView>> = Object.fromEntries([
  ['resting.inUnranked.opened', resting('Unranked', '')],
  ...KEYBOARD_DRAG_ROWS.flatMap((row) => [
    [`resting.in${row}.dropped`, resting(row, `Dropped ${item} in ${place(row)}.`)],
    [`resting.in${row}.stayed`, resting(row, `Dropped ${item}. It stays in ${place(row)}.`)],
    [`resting.in${row}.cancelled`, resting(row, `Move cancelled. ${item} is back in ${place(row)}.`)],
    [`carrying.from${row}.pickedUp`, carrying(row, row, `Picked up ${item}, in ${place(row)}.`)],
    ...KEYBOARD_DRAG_ROWS.map((over) => [
      `carrying.from${row}.over${over}`,
      carrying(row, over, over === row ? `${item} is back in ${place(row)}.` : `${item} moves to ${place(over)}.`),
    ]),
  ]),
]);

/** The dotted path of a snapshot's state, such as 'carrying.fromS.overA'. */
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
 * rows, and at rest once focus came back to the tile after a drop or a cancel: where the machine
 * takes none of them, the page must ignore them. The list as opened has nothing focused.
 */
const onFocusedTile = ({snapshot}: When) => !snapshot.matches({resting: {inUnranked: 'opened'}});

export const keyboardDragModel = defineModel({
  id: 'keyboard-drag',
  machine: keyboardDragMachine,
  events: {
    PRESS_SPACE: {generate: constant, when: offered('PRESS_SPACE')},
    PRESS_ENTER: {generate: constant, when: offered('PRESS_ENTER')},
    PRESS_UP: {generate: constant, when: onFocusedTile},
    PRESS_DOWN: {generate: constant, when: onFocusedTile},
    PRESS_ESCAPE: {generate: constant, when: onFocusedTile},
  },
});
