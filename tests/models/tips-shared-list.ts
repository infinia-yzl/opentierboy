import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {tipsSharedListMachine} from '../machines/tips-shared-list';
import {defineModel, type When} from '../support/machines';
import {statePath, type ExpectedStoredTips, type TipId, type TipsView} from './tips';

export type TipsSharedListSnapshot = SnapshotFrom<typeof tipsSharedListMachine>;
export type TipsSharedListEvent = EventFrom<typeof tipsSharedListMachine>;

const seen = (...tips: TipId[]): ExpectedStoredTips => ({seen: tips, off: false});

/** Each state of the shared-list machine, by its path, and what it shows. */
const SHARED_LIST_VIEWS: Readonly<Record<string, TipsView>> = {
  'editor.sharedListTip': {shown: 'sharedList', stored: seen('shared-list')},
  'editor.linkSaveToast.afterSharedListTip': {shown: 'linkSave', stored: seen('first-drag', 'link-save', 'shared-list')},
  'editor.linkSaveToast.withoutSharedListTip': {shown: 'linkSave', stored: seen('first-drag', 'link-save')},
  'editor.noTip.nothingSeen': {shown: null, stored: seen()},
  'editor.noTip.sharedListSeen': {shown: null, stored: seen('shared-list')},
  'editor.noTip.linkSaveSeen': {shown: null, stored: seen('first-drag', 'link-save')},
  'editor.noTip.allSeen': {shown: null, stored: seen('first-drag', 'link-save', 'shared-list')},
  'editor.tipsOff': {shown: null, stored: {seen: null, off: true}},
  about: {shown: null, stored: seen()},
};

/** What the page shows in a state of the shared-list machine. */
export function sharedListViewOf(snapshot: TipsSharedListSnapshot): TipsView {
  const view = SHARED_LIST_VIEWS[statePath(snapshot.value)];
  if (!view) throw new RangeError(`No view for the shared-list state ${statePath(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});
const inEditor = ({snapshot}: When) => snapshot.matches('editor');
const toastShows = ({snapshot}: When) => snapshot.matches('editor.linkSaveToast');
/**
 * The toast ends by itself after 10 s of real time: this campaign cannot install the page clock,
 * which hides the shared-list tip (see tips.spec.ts). So while the toast shows, only what ends
 * it or leaves the page is sent, and the 10 s never pass inside a run.
 */
const editsWithoutToast = (args: When) => inEditor(args) && !toastShows(args);

export const tipsSharedListModel = defineModel({
  id: 'tips-shared-list',
  machine: tipsSharedListMachine,
  events: {
    OPEN_SHARED_LINK: constant,
    OPEN_FROM_RECENTLY_VIEWED: constant,
    CHANGE_TITLE: {generate: constant, when: editsWithoutToast},
    CLOSE_TIP: {generate: constant, when: ({snapshot}: When) => snapshot.matches('editor.sharedListTip')},
    CLOSE_TOAST: {generate: constant, when: toastShows},
    HIDE_TIPS: {generate: constant, when: (args: When) => args.snapshot.matches('editor.sharedListTip') || toastShows(args)},
    SHOW_TIPS_AGAIN: {generate: constant, when: inEditor},
  },
});
