import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {keyboardDragMachine} from '../machines/keyboard-drag';
import {defineModel, offered, type When} from '../support/machines';

export const KEYBOARD_DRAG_ITEM = 'Mauga';
export const KEYBOARD_DRAG_ROWS = ['S', 'A', 'Unranked'] as const;
export type KeyboardDragRow = typeof KEYBOARD_DRAG_ROWS[number];

export interface KeyboardDragView {
  readonly shownIn: KeyboardDragRow;
  readonly linkIn: KeyboardDragRow;
  readonly carried: boolean;
  readonly heard: string;
  readonly order: readonly KeyboardDragRow[];
}

export type KeyboardDragSnapshot = SnapshotFrom<typeof keyboardDragMachine>;
export type KeyboardDragEvent = EventFrom<typeof keyboardDragMachine>;

const phrase = (row: KeyboardDragRow) => (row === 'Unranked' ? 'Unranked' : `row ${row}`);
const place = (row: KeyboardDragRow) => `${phrase(row)}, position 1 of 1`;
const item = KEYBOARD_DRAG_ITEM;

const ORDERS = {sFirst: ['S', 'A', 'Unranked'], aFirst: ['A', 'S', 'Unranked']} as const;

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

export function statePath(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${statePath(child)}`;
}

export function keyboardDragViewOf(snapshot: KeyboardDragSnapshot): KeyboardDragView {
  const view = KEYBOARD_DRAG_VIEWS[statePath(snapshot.value)];
  if (!view) throw new RangeError(`No view for the keyboard drag state ${statePath(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});
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
