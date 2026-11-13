import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {removeAndUndoMachine} from '../machines/remove-and-undo';
import {always, defineModel, offered} from '../support/machines';

export type RemoveAndUndoSnapshot = SnapshotFrom<typeof removeAndUndoMachine>;
export type RemoveAndUndoEvent = EventFrom<typeof removeAndUndoMachine>;

/** The rows the walk checks, by label. */
export interface Rows {
  readonly S: readonly string[];
  readonly A: readonly string[];
  readonly Unranked: readonly string[];
}

/** The list every run opens: Delete removes the first item of row S. */
export const OPENED_ROWS: Rows = {S: ['Mauga', 'Winston'], A: ['Sigma'], Unranked: ['Reinhardt']};

/** The item that Delete removes: the first item of row S. */
export const DELETED_ITEM = OPENED_ROWS.S[0];

type Removal = 'oneItemDeleted' | 'itemsReset' | 'allItemsRemoved';

/** The toast of each removal, whose Undo puts the list back. */
const TOAST_OF: Readonly<Record<Removal, string>> = {
  oneItemDeleted: 'Item deleted',
  itemsReset: 'Items Reset',
  allItemsRemoved: 'All Items Deleted',
};

/** The rows after each removal. Reset puts every item in Unranked, sorted by label. */
const ROWS_AFTER: Readonly<Record<Removal, Rows>> = {
  oneItemDeleted: {...OPENED_ROWS, S: OPENED_ROWS.S.slice(1)},
  itemsReset: {S: [], A: [], Unranked: [...OPENED_ROWS.S, ...OPENED_ROWS.A, ...OPENED_ROWS.Unranked].sort()},
  allItemsRemoved: {S: [], A: [], Unranked: []},
};

/** What one state of the machine shows. */
export interface RemoveAndUndoView {
  /** The items in each row. */
  readonly rows: Rows;
  /**
   * False where the app puts an item at the wrong place (the known bug "renders the restored
   * item at its old position when the user clicks Undo after a delete", editor-items.spec.ts):
   * row S is then checked for its items in any order.
   */
  readonly orderOfSChecked: boolean;
  /** True on the list as opened, whose address is the link the run opened. */
  readonly asOpened: boolean;
  /** True while the dialog "Are you sure?" of Remove All shows. */
  readonly dialog: boolean;
  /** The toast that offers Undo, or null when none does. */
  readonly toastWithUndo: string | null;
  /** The toast of this run's removal, which no state without Undo shows. Null before a removal. */
  readonly removalToast: string | null;
}

type ListValue = string | Record<string, string>;
type Value = {removal: string; list: ListValue};

/** The dotted path of the list region's state, such as 'undone.restored'. */
function listPath(list: ListValue): string {
  if (typeof list === 'string') return list;
  const [group, version] = Object.entries(list)[0];
  return `${group}.${version}`;
}

/** The removal a snapshot made, or null before one. */
function removalOf(snapshot: RemoveAndUndoSnapshot): Removal | null {
  const {removal} = snapshot.value as Value;
  return removal in TOAST_OF ? removal as Removal : null;
}

/** What the page shows in a state of the remove-and-undo machine. */
export function removeAndUndoViewOf(snapshot: RemoveAndUndoSnapshot): RemoveAndUndoView {
  const path = listPath((snapshot.value as Value).list);
  const removal = removalOf(snapshot);
  const version = path.split('.').pop();
  const before = {rows: OPENED_ROWS, orderOfSChecked: true, asOpened: true};
  if (path === 'opened' || path === 'confirming') {
    return {...before, dialog: path === 'confirming', toastWithUndo: null, removalToast: null};
  }
  if (!removal) throw new RangeError(`No removal in the state ${path}`);
  const shown = version === 'asOpened' ? before
    : version === 'removed' ? {rows: ROWS_AFTER[removal], orderOfSChecked: true, asOpened: false}
      // Undo of a delete adds the item at the end of its row (itemRestored, lib/tierListReducer.ts).
      : {rows: OPENED_ROWS, orderOfSChecked: removal !== 'oneItemDeleted', asOpened: false};
  const toast = TOAST_OF[removal];
  return {...shown, dialog: false, toastWithUndo: path.startsWith('undoOffered.') ? toast : null, removalToast: toast};
}

/** True when Undo in this state changes the list, so it writes a new link (a new history entry). */
export function undoChangesList(snapshot: RemoveAndUndoSnapshot): boolean {
  return snapshot.matches({list: {undoOffered: 'removed'}});
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
    // The browser offers Forward everywhere. On the latest version, and with the dialog open, the
    // page must stay as it is.
    BROWSER_FORWARD: {generate: constant, when: always},
  },
});
