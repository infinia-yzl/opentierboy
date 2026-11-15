import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {tipsMachine} from '../machines/tips';
import {defineModel, type When} from '../support/machines';

export const TIP_IDS = ['first-drag', 'link-save', 'shared-list', 'device-images'] as const;
export type TipId = typeof TIP_IDS[number];

export interface ExpectedStoredTips {
  readonly seen: readonly TipId[] | null;
  readonly off: boolean;
}

export interface TipsView {
  readonly shown: 'firstDrag' | 'linkSave' | 'deviceImages' | 'sharedList' | null;
  readonly stored: ExpectedStoredTips;
}

export const TEMPLATE_ITEMS = 13;

export type TipsSnapshot = SnapshotFrom<typeof tipsMachine>;
export type TipsEvent = EventFrom<typeof tipsMachine>;

const seen = (...tips: TipId[]): ExpectedStoredTips => ({seen: tips, off: false});

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

export function statePath(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${statePath(child)}`;
}

export function tipsViewOf(snapshot: TipsSnapshot): TipsView {
  const view = TIPS_VIEWS[statePath(snapshot.value)];
  if (!view) throw new RangeError(`No view for the tips state ${statePath(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});
const inEditor = ({snapshot}: When) => snapshot.matches('editor');
const toastShows = ({snapshot}: When) => snapshot.matches('editor.linkSaveToast') || snapshot.matches('editor.deviceImagesToast');
const tipShows = (args: When) => args.snapshot.matches('editor.firstDragTip') || toastShows(args);

export const tipsModel = defineModel({
  id: 'tips',
  machine: tipsMachine,
  events: {
    OPEN_TEMPLATE: {generate: constant, weight: 0.5},
    DROP_IN_ROW: {generate: constant, when: inEditor},
    CHANGE_TITLE: {generate: constant, when: inEditor},
    ADD_DEVICE_IMAGE: {generate: constant, when: inEditor, weight: 2},
    CLOSE_TIP: {generate: constant, when: ({snapshot}: When) => snapshot.matches('editor.firstDragTip')},
    CLOSE_TOAST: {generate: constant, when: toastShows, weight: 3},
    TOAST_TIMES_OUT: {generate: constant, when: toastShows, weight: 3},
    HIDE_TIPS: {generate: constant, when: tipShows, weight: 2},
    SHOW_TIPS_AGAIN: {generate: constant, when: inEditor, weight: 0.5},
  },
});
