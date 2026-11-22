import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {snapshotFilesMachine} from '../machines/snapshot-files';
import {defineModel, offered, type When} from '../support/machines';

export type SnapshotFilesSnapshot = SnapshotFrom<typeof snapshotFilesMachine>;
export type SnapshotFilesEvent = EventFrom<typeof snapshotFilesMachine>;

export type ListOnScreen = 'ownList' | 'withPicture' | 'withTwoPictures' | 'fileList' | null;

export interface SnapshotFilesView {
  readonly list: ListOnScreen;
  readonly dialog: 'asking' | null;
  readonly message: 'brokenFile' | 'notAPicture' | 'filesNotAdded' | null;
}

const SNAPSHOT_FILES_VIEWS: Readonly<Record<string, SnapshotFilesView>> = {
  'editor.before.lists.ownList': {list: 'ownList', dialog: null, message: null},
  'editor.before.lists.withPicture': {list: 'withPicture', dialog: null, message: null},
  'editor.before.lists.withTwoPictures': {list: 'withTwoPictures', dialog: null, message: null},
  'editor.before.brokenFileMessage': {list: 'ownList', dialog: null, message: 'brokenFile'},
  'editor.before.notAPictureMessage': {list: 'ownList', dialog: null, message: 'notAPicture'},
  'editor.asking.nothingWaits': {list: null, dialog: 'asking', message: null},
  'editor.asking.filesNotAdded': {list: null, dialog: 'asking', message: 'filesNotAdded'},
  'editor.fileList': {list: 'fileList', dialog: null, message: null},
  'editor.askingAgain': {list: null, dialog: 'asking', message: null},
  left: {list: null, dialog: null, message: null},
};

export function statePath(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${statePath(child)}`;
}

export function snapshotFilesViewOf(snapshot: SnapshotFilesSnapshot): SnapshotFilesView {
  const view = SNAPSHOT_FILES_VIEWS[statePath(snapshot.value)];
  if (!view) throw new RangeError(`No view for the snapshot files state ${statePath(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});
const messageShows = ({snapshot}: When) => SNAPSHOT_FILES_VIEWS[statePath(snapshot.value)]?.message != null;
const dialogShows = (args: When) => (args.snapshot.matches('editor.asking') || args.snapshot.matches('editor.askingAgain')) && !messageShows(args);
const offeredOrOverDialog = (type: string) => (args: When) => offered(type)(args) || dialogShows(args);

const listShows = (args: When) => (args.snapshot.matches('editor.before') || args.snapshot.matches('editor.fileList')) && !messageShows(args);

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
    PASTE_TEXT_FILE: {generate: constant, when: listShows},
    CANCEL: {generate: constant, when: offered('CANCEL')},
    PRESS_ESCAPE: {generate: constant, when: offered('PRESS_ESCAPE')},
    OPEN_LIST: {generate: constant, when: offered('OPEN_LIST')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
    LEAVE_WHILE_PICTURES_WAIT: {generate: constant, when: offered('LEAVE_WHILE_PICTURES_WAIT')},
  },
});

export const PASTE_EVENTS = [
  'PASTE_PICTURE_FILE',
  'PASTE_TWO_PICTURES_AT_ONCE',
  'PASTE_LIST_FILE',
  'DROP_LIST_FILE_AND_PASTE_PICTURE',
  'PASTE_TEXT_FILE',
  'LEAVE_WHILE_PICTURES_WAIT',
] as const;

export const snapshotFilesWithoutPasteModel = defineModel({
  id: 'snapshot-files-without-paste',
  machine: snapshotFilesMachine,
  events: Object.fromEntries(Object.entries(snapshotFilesModel.events)
    .filter(([type]) => !(PASTE_EVENTS as readonly string[]).includes(type))),
});
