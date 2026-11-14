import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {editorRowsMachine} from '../machines/editor-rows';
import {defineModel, offered, type When} from '../support/machines';

export type EditorRowsSnapshot = SnapshotFrom<typeof editorRowsMachine>;
export type EditorRowsEvent = EventFrom<typeof editorRowsMachine>;
type EditorRowsState = 'nineteen' | 'eighteen' | 'nineteenAdded' | 'three' | 'threeCleared' | 'twoCleared' | 'one' | 'twoAdded' | 'five' | 'seven';

/** A row of the list on screen: its accessible name and its items, in order. */
export interface EditorRow {
  readonly name: string;
  readonly items: readonly string[];
}

/** What one state of the editor rows machine shows. */
export interface EditorRowsView {
  /** Every row, top to bottom, Unranked last. */
  readonly rows: readonly EditorRow[];
  readonly canAdd: boolean;
  readonly canRemove: boolean;
}

/** The rows R6 to R18 of the list as opened, all empty. */
const MIDDLE_ROWS: readonly EditorRow[] = Array.from({length: 13}, (_, index) => ({name: `R${index + 6}`, items: []}));
const empty = (...names: string[]): EditorRow[] => names.map((name) => ({name, items: []}));
const unranked = (...items: string[]): EditorRow => ({name: 'Unranked', items});
const ranked = (rows: readonly EditorRow[], canAdd = true, canRemove = true): EditorRowsView => ({rows, canAdd, canRemove});

/** Each state and what it shows (lib/dnd/moves.ts, lib/tierListReducer.ts). */
const VIEWS: Readonly<Record<EditorRowsState, EditorRowsView>> = {
  nineteen: ranked([{name: 'S', items: ['Mauga']}, ...empty('A', 'B', 'C', 'F'), ...MIDDLE_ROWS, {name: 'R19', items: ['Winston']}, unranked('Sigma')], false),
  eighteen: ranked([...empty('A', 'B', 'C', 'F'), ...MIDDLE_ROWS, {name: 'R19', items: ['Winston']}, unranked('Sigma', 'Mauga')]),
  nineteenAdded: ranked([...empty('A', 'B', 'C', 'F'), ...MIDDLE_ROWS, {name: 'R19', items: ['Winston']}, ...empty('Row 19'), unranked('Sigma', 'Mauga')], false),
  three: ranked([{name: 'S', items: ['Mauga']}, ...empty('A', 'B'), unranked('Winston', 'Sigma')]),
  threeCleared: ranked([{name: 'S', items: ['Mauga']}, ...empty('Row 2', 'B'), unranked('Winston', 'Sigma')]),
  twoCleared: ranked([...empty('Row 1', 'B'), unranked('Winston', 'Sigma', 'Mauga')]),
  one: ranked([...empty('B'), unranked('Winston', 'Sigma', 'Mauga')], true, false),
  twoAdded: ranked([...empty('B', 'Row 2'), unranked('Winston', 'Sigma', 'Mauga')]),
  five: ranked([{name: 'S', items: ['Mauga']}, ...empty('A', 'B', 'C', 'F'), unranked('Winston', 'Sigma')]),
  seven: ranked([...empty('SS'), {name: 'S', items: ['Mauga']}, ...empty('A', 'B', 'C', 'D', 'F'), unranked('Winston', 'Sigma')]),
};

/** What the page shows in a state of the editor rows machine. */
export function editorRowsViewOf(snapshot: EditorRowsSnapshot): EditorRowsView {
  const view = VIEWS[snapshot.value as EditorRowsState];
  if (!view) throw new RangeError(`No view for the editor rows state ${String(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});

/** A row count is sent where the machine takes it, and where the list is that template already: there it must change nothing. */
const rowCount = (type: 'CHOOSE_3_ROWS' | 'CHOOSE_5_ROWS' | 'CHOOSE_7_ROWS', template: EditorRowsState) =>
  (args: When) => offered(type)(args) || args.snapshot.value === template;

/**
 * Add row and Remove a row are sent only where the machine takes them: where it does not, the
 * button or the menu item is off, which each state checks.
 */
export const editorRowsModel = defineModel({
  id: 'editor-rows',
  machine: editorRowsMachine,
  events: {
    ADD_ROW: {generate: constant, when: offered('ADD_ROW')},
    REMOVE_FIRST_ROW: {generate: constant, when: offered('REMOVE_FIRST_ROW')},
    CLEAR_SECOND_LABEL: {generate: constant, when: offered('CLEAR_SECOND_LABEL')},
    CHOOSE_3_ROWS: {generate: constant, when: rowCount('CHOOSE_3_ROWS', 'three')},
    CHOOSE_5_ROWS: {generate: constant, when: rowCount('CHOOSE_5_ROWS', 'five')},
    CHOOSE_7_ROWS: {generate: constant, when: rowCount('CHOOSE_7_ROWS', 'seven')},
  },
});
