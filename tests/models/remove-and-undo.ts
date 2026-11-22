import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {removeAndUndoMachine} from '../machines/remove-and-undo';
import {always, defineModel, offered} from '../support/machines';

export type RemoveAndUndoSnapshot = SnapshotFrom<typeof removeAndUndoMachine>;
export type RemoveAndUndoEvent = EventFrom<typeof removeAndUndoMachine>;

export interface Rows {
  readonly S: readonly string[];
  readonly A: readonly string[];
  readonly Unranked: readonly string[];
}

export const OPENED_ROWS: Rows = {S: ['Mauga', 'Winston'], A: ['Sigma'], Unranked: ['Reinhardt']};

export const DELETED_ITEM = OPENED_ROWS.S[0];

type Removal = 'oneItemDeleted' | 'itemsReset' | 'allItemsRemoved';

const TOAST_OF: Readonly<Record<Removal, string>> = {
  oneItemDeleted: 'Item deleted',
  itemsReset: 'Items Reset',
  allItemsRemoved: 'All Items Deleted',
};

const ROWS_AFTER: Readonly<Record<Removal, Rows>> = {
  oneItemDeleted: {...OPENED_ROWS, S: OPENED_ROWS.S.slice(1)},
  itemsReset: {S: [], A: [], Unranked: [...OPENED_ROWS.S, ...OPENED_ROWS.A, ...OPENED_ROWS.Unranked].sort()},
  allItemsRemoved: {S: [], A: [], Unranked: []},
};

export interface RemoveAndUndoView {
  readonly rows: Rows;
  readonly asOpened: boolean;
  readonly dialog: boolean;
  readonly toastWithUndo: string | null;
  readonly newEntries: 0 | 1 | 2;
}

type ListValue = string | Record<string, string>;
type Value = {removal: string; list: ListValue};

function listPath(list: ListValue): string {
  if (typeof list === 'string') return list;
  const [group, version] = Object.entries(list)[0];
  return `${group}.${version}`;
}

const VERSION_ROWS = {asOpened: 'opened', afterRemoval: 'removed', removed: 'removed', restored: 'restored'} as const;

function removalOf(snapshot: RemoveAndUndoSnapshot): Removal | null {
  const {removal} = snapshot.value as Value;
  return removal in TOAST_OF ? removal as Removal : null;
}

export function removeAndUndoViewOf(snapshot: RemoveAndUndoSnapshot): RemoveAndUndoView {
  const path = listPath((snapshot.value as Value).list);
  const removal = removalOf(snapshot);
  const before = {rows: OPENED_ROWS, asOpened: true};
  if (path === 'opened' || path === 'confirming') {
    return {...before, dialog: path === 'confirming', toastWithUndo: null, newEntries: 0};
  }
  if (!removal) throw new RangeError(`No removal in the state ${path}`);
  const version = path === 'undoOffered' ? 'removed' : VERSION_ROWS[path.split('.').pop() as keyof typeof VERSION_ROWS];
  const shown = version === 'opened' ? before
    : version === 'removed' ? {rows: ROWS_AFTER[removal], asOpened: false}
      : {rows: OPENED_ROWS, asOpened: false};
  return {
    ...shown,
    dialog: false,
    toastWithUndo: path === 'undoOffered' ? TOAST_OF[removal] : null,
    newEntries: path.startsWith('undone.') ? 2 : 1,
  };
}

const constant = fc.constant({});

export const removeAndUndoModel = defineModel({
  id: 'remove-and-undo',
  machine: removeAndUndoMachine,
  events: {
    DELETE_ITEM: {generate: constant, when: offered('DELETE_ITEM')},
    CHOOSE_RESET: {generate: constant, when: offered('CHOOSE_RESET')},
    OPEN_REMOVE_ALL: {generate: constant, when: offered('OPEN_REMOVE_ALL')},
    CONFIRM_REMOVE_ALL: {generate: constant, when: offered('CONFIRM_REMOVE_ALL')},
    CANCEL_REMOVE_ALL: {generate: constant, when: offered('CANCEL_REMOVE_ALL')},
    CLICK_UNDO: {generate: constant, when: offered('CLICK_UNDO')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
    BROWSER_FORWARD: {generate: constant, when: always},
  },
});
