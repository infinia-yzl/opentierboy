import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {snapshotFilesMachine} from '../machines/snapshot-files';
import {defineModel, offered, type When} from '../support/machines';

export type SnapshotFilesSnapshot = SnapshotFrom<typeof snapshotFilesMachine>;
export type SnapshotFilesEvent = EventFrom<typeof snapshotFilesMachine>;

/** The list on screen in a state of the snapshot files machine, or null on the landing page. */
export type ListOnScreen = 'ownList' | 'withPicture' | 'withTwoPictures' | 'fileList' | null;

/** What one state shows: the list on screen, the dialog, and the message. */
export interface SnapshotFilesView {
  /** The list on screen, or null while the dialog shows (it hides the page from the accessibility tree). */
  readonly list: ListOnScreen;
  readonly dialog: 'asking' | 'opening' | null;
  readonly message: 'brokenFile' | 'notAPicture' | 'filesNotAdded' | null;
}

/** Each state of the machine, by its path, and what it shows. */
const SNAPSHOT_FILES_VIEWS: Readonly<Record<string, SnapshotFilesView>> = {
  'editor.before.lists.ownList': {list: 'ownList', dialog: null, message: null},
  'editor.before.lists.withPicture': {list: 'withPicture', dialog: null, message: null},
  'editor.before.lists.withTwoPictures': {list: 'withTwoPictures', dialog: null, message: null},
  'editor.before.brokenFileMessage': {list: 'ownList', dialog: null, message: 'brokenFile'},
  'editor.before.notAPictureMessage': {list: 'ownList', dialog: null, message: 'notAPicture'},
  'editor.asking.nothingWaits': {list: null, dialog: 'asking', message: null},
  'editor.asking.filesNotAdded': {list: null, dialog: 'asking', message: 'filesNotAdded'},
  'editor.opening': {list: null, dialog: 'opening', message: null},
  'editor.fileList': {list: 'fileList', dialog: null, message: null},
  'editor.askingAgain': {list: null, dialog: 'asking', message: null},
  left: {list: null, dialog: null, message: null},
};

/** The dotted path of a snapshot's state, such as 'editor.before.lists.ownList'. */
export function statePath(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${statePath(child)}`;
}

/** What the page shows in a state of the snapshot files machine. */
export function snapshotFilesViewOf(snapshot: SnapshotFilesSnapshot): SnapshotFilesView {
  const view = SNAPSHOT_FILES_VIEWS[statePath(snapshot.value)];
  if (!view) throw new RangeError(`No view for the snapshot files state ${statePath(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});
/**
 * A dialog shows. The message of asking.filesNotAdded shows over the dialog, which makes the
 * page ignore the pointer, so nothing holds it, but page time stands still in the test until
 * TOAST_TIMES_OUT: a paste or a drop over the dialog meets it there too.
 */
const dialogShows = ({snapshot}: When) => snapshot.matches('editor.asking') || snapshot.matches('editor.askingAgain')
  || snapshot.matches('editor.opening');
/** Where the machine takes the event, and where a dialog shows: a paste or a drop there must change nothing. */
const offeredOrOverDialog = (type: string) => (args: When) => offered(type)(args) || dialogShows(args);
/** Cancel and Escape, where the machine takes them, and while the list opens: they must change nothing then. */
const offeredOrOpening = (type: string) => (args: When) => offered(type)(args) || args.snapshot.matches('editor.opening');

/** A list on screen with no dialog, with or without a message (the pointer rests on a message, which a paste does not move). */
const listShows = ({snapshot}: When) => snapshot.matches('editor.before') || snapshot.matches('editor.fileList');

export const snapshotFilesModel = defineModel({
  id: 'snapshot-files',
  machine: snapshotFilesMachine,
  events: {
    OPEN_PICTURE_FILE: {generate: constant, when: offered('OPEN_PICTURE_FILE')},
    DROP_PICTURE_FILE: {generate: constant, when: offeredOrOverDialog('DROP_PICTURE_FILE')},
    PASTE_PICTURE_FILE: {generate: constant, when: offeredOrOverDialog('PASTE_PICTURE_FILE')},
    PASTE_TWO_PICTURES_AT_ONCE: {generate: constant, when: offered('PASTE_TWO_PICTURES_AT_ONCE')},
    OPEN_LIST_FILE: {generate: constant, when: offered('OPEN_LIST_FILE')},
    DROP_LIST_FILE: {generate: constant, when: offered('DROP_LIST_FILE')},
    PASTE_LIST_FILE: {generate: constant, when: offered('PASTE_LIST_FILE')},
    DROP_LIST_FILE_AND_PASTE_PICTURE: {generate: constant, when: offered('DROP_LIST_FILE_AND_PASTE_PICTURE')},
    OPEN_BROKEN_FILE: {generate: constant, when: offered('OPEN_BROKEN_FILE')},
    DROP_TEXT_FILE: {generate: constant, when: offered('DROP_TEXT_FILE')},
    // A paste takes pictures only: a pasted text file changes nothing, on any list.
    PASTE_TEXT_FILE: {generate: constant, when: listShows},
    CANCEL: {generate: constant, when: offeredOrOpening('CANCEL')},
    PRESS_ESCAPE: {generate: constant, when: offeredOrOpening('PRESS_ESCAPE')},
    OPEN_LIST: {generate: constant, when: offered('OPEN_LIST')},
    SERVER_ANSWERS: {generate: constant, when: offered('SERVER_ANSWERS')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
    LEAVE_WHILE_PICTURES_WAIT: {generate: constant, when: offered('LEAVE_WHILE_PICTURES_WAIT')},
    TOAST_TIMES_OUT: {generate: constant, when: offered('TOAST_TIMES_OUT')},
  },
});

/** The events that paste files: a script cannot paste files in Firefox (SCRIPTED_PASTE_SKIP). LEAVE pastes the pictures it leaves. */
export const PASTE_EVENTS = [
  'PASTE_PICTURE_FILE',
  'PASTE_TWO_PICTURES_AT_ONCE',
  'PASTE_LIST_FILE',
  'DROP_LIST_FILE_AND_PASTE_PICTURE',
  'PASTE_TEXT_FILE',
  'LEAVE_WHILE_PICTURES_WAIT',
] as const;

/**
 * The same machine without the events that paste, for Firefox. Its walk covers what the other
 * events reach: every state but the two pictures pasted at once, the message "Files not added"
 * and the landing page. walkPaths throws when a walk cannot reach an item of its own, so this
 * walk is complete for its events. It is not in MACHINE_MODELS: walks.test.ts asks every model
 * there to take every transition of its machine, and the paste transitions are left out here.
 */
export const snapshotFilesWithoutPasteModel = defineModel({
  id: 'snapshot-files-without-paste',
  machine: snapshotFilesMachine,
  events: Object.fromEntries(Object.entries(snapshotFilesModel.events)
    .filter(([type]) => !(PASTE_EVENTS as readonly string[]).includes(type))),
});
