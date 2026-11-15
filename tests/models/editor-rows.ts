import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {editorRowsMachine} from '../machines/editor-rows';
import {defineModel, offered, type When} from '../support/machines';

export type EditorRowsSnapshot = SnapshotFrom<typeof editorRowsMachine>;
export type EditorRowsEvent = EventFrom<typeof editorRowsMachine>;
type EditorRowsState = 'nineteen' | 'eighteen' | 'nineteenAdded' | 'three' | 'threeCleared' | 'twoCleared' | 'one' | 'twoAdded' | 'five' | 'seven';

export interface EditorRow {
  readonly name: string;
  readonly items: readonly string[];
}

export interface EditorRowsView {
  readonly rows: readonly EditorRow[];
  readonly canAdd: boolean;
  readonly canRemove: boolean;
}

const MIDDLE_ROWS: readonly EditorRow[] = Array.from({length: 13}, (_, index) => ({name: `R${index + 6}`, items: []}));
const empty = (...names: string[]): EditorRow[] => names.map((name) => ({name, items: []}));
const unranked = (...items: string[]): EditorRow => ({name: 'Unranked', items});
const ranked = (rows: readonly EditorRow[], canAdd = true, canRemove = true): EditorRowsView => ({rows, canAdd, canRemove});

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

export function editorRowsViewOf(snapshot: EditorRowsSnapshot): EditorRowsView {
  const view = VIEWS[snapshot.value as EditorRowsState];
  if (!view) throw new RangeError(`No view for the editor rows state ${String(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});

const rowCount = (type: 'CHOOSE_3_ROWS' | 'CHOOSE_5_ROWS' | 'CHOOSE_7_ROWS', template: EditorRowsState) =>
  (args: When) => offered(type)(args) || args.snapshot.value === template;

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
