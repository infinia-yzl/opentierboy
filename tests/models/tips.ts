import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {tipsMachine} from '../machines/tips';
import {defineModel, type When} from '../support/machines';

/** The one-time tips (lib/tips/tips.ts), by the ids that local storage keeps under `otb-tips`, in that order. */
export const TIP_IDS = ['first-drag', 'link-save', 'shared-list', 'device-images'] as const;
export type TipId = typeof TIP_IDS[number];

/**
 * What `otb-tips` holds, with the seen tips in the order of TIP_IDS. With tips off, the tips seen
 * depend on when Hide tips was pressed, so `seen` is left out (null).
 */
export interface ExpectedStoredTips {
  readonly seen: readonly TipId[] | null;
  readonly off: boolean;
}

/** What one state of a tips machine shows: the tip on screen, if any, and what is stored. */
export interface TipsView {
  readonly shown: 'firstDrag' | 'linkSave' | 'deviceImages' | 'sharedList' | null;
  readonly stored: ExpectedStoredTips;
}

/** The template of every run: OVERWATCH's 13 tanks, all in Unranked. */
export const TEMPLATE_ITEMS = 13;

export type TipsSnapshot = SnapshotFrom<typeof tipsMachine>;
export type TipsEvent = EventFrom<typeof tipsMachine>;

const seen = (...tips: TipId[]): ExpectedStoredTips => ({seen: tips, off: false});

/** Each state of the tips machine, by its path, and what it shows. */
const TIPS_VIEWS: Readonly<Record<string, TipsView>> = {
  'editor.firstDragTip.nothingWaits': {shown: 'firstDrag', stored: seen()},
  'editor.firstDragTip.linkSaveWaits': {shown: 'firstDrag', stored: seen()},
  'editor.firstDragTip.linkSaveAndDeviceImagesWait': {shown: 'firstDrag', stored: seen()},
  'editor.linkSaveToast.nothingWaits': {shown: 'linkSave', stored: seen('first-drag', 'link-save')},
  'editor.linkSaveToast.deviceImagesWaits': {shown: 'linkSave', stored: seen('first-drag', 'link-save')},
  'editor.deviceImagesToast': {shown: 'deviceImages', stored: seen('first-drag', 'link-save', 'device-images')},
  'editor.noTip.firstDragSeen': {shown: null, stored: seen('first-drag')},
  'editor.noTip.linkSaveSeen': {shown: null, stored: seen('first-drag', 'link-save')},
  'editor.noTip.allSeen': {shown: null, stored: seen('first-drag', 'link-save', 'device-images')},
  'editor.tipsOff': {shown: null, stored: {seen: null, off: true}},
  about: {shown: null, stored: seen()},
};

/** The dotted path of a snapshot's state, such as 'editor.noTip.allSeen'. */
export function statePath(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${statePath(child)}`;
}

/** What the page shows in a state of the tips machine. */
export function tipsViewOf(snapshot: TipsSnapshot): TipsView {
  const view = TIPS_VIEWS[statePath(snapshot.value)];
  if (!view) throw new RangeError(`No view for the tips state ${statePath(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});
const inEditor = ({snapshot}: When) => snapshot.matches('editor');
const toastShows = ({snapshot}: When) => snapshot.matches('editor.linkSaveToast') || snapshot.matches('editor.deviceImagesToast');
/** Every tip shown in the editor: the first-drag tip and the toasts. */
const tipShows = (args: When) => args.snapshot.matches('editor.firstDragTip') || toastShows(args);
/**
 * A toast ends by itself 10 s after it shows (EditorTips.tsx, TIP_TOAST_MS), in real time too: the
 * page clock runs. So while a toast shows, the campaign sends only what ends it or leaves the
 * page, and the 10 s never pass inside a run.
 */
const editsWithoutToast = (args: When) => inEditor(args) && !toastShows(args);

export const tipsModel = defineModel({
  id: 'tips',
  machine: tipsMachine,
  events: {
    OPEN_TEMPLATE: {generate: constant, weight: 0.5},
    // A run sends fewer than TEMPLATE_ITEMS changes, so Unranked always holds an item to drop.
    DROP_IN_ROW: {generate: constant, when: editsWithoutToast},
    CHANGE_TITLE: {generate: constant, when: editsWithoutToast},
    ADD_DEVICE_IMAGE: {generate: constant, when: editsWithoutToast, weight: 2},
    CLOSE_TIP: {generate: constant, when: ({snapshot}: When) => snapshot.matches('editor.firstDragTip')},
    CLOSE_TOAST: {generate: constant, when: toastShows, weight: 3},
    TOAST_TIMES_OUT: {generate: constant, when: toastShows, weight: 3},
    HIDE_TIPS: {generate: constant, when: tipShows, weight: 2},
    SHOW_TIPS_AGAIN: {generate: constant, when: inEditor, weight: 0.5},
  },
});
