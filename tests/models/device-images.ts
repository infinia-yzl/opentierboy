import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {deviceImagesMachine} from '../machines/device-images';
import {defineModel, offered, type When} from '../support/machines';

export const DEVICE_IMAGE_NAMES = {red: 'red-square', blue: 'blue-square'} as const;
export type DeviceImageKey = keyof typeof DEVICE_IMAGE_NAMES;

export interface DeviceImagesView {
  readonly browser: 'this' | 'new';
  readonly ranked: readonly DeviceImageKey[];
  readonly unranked: readonly DeviceImageKey[];
  readonly toast: boolean;
}

export type DeviceImagesSnapshot = SnapshotFrom<typeof deviceImagesMachine>;
export type DeviceImagesEvent = EventFrom<typeof deviceImagesMachine>;

const view = (browser: DeviceImagesView['browser'], ranked: DeviceImageKey[], unranked: DeviceImageKey[], toast = false): DeviceImagesView =>
  ({browser, ranked, unranked, toast});

const DEVICE_IMAGES_VIEWS: Readonly<Record<string, DeviceImagesView>> = {
  'thisBrowser.noImages': view('this', [], []),
  'thisBrowser.redAdded': view('this', [], ['red'], true),
  'thisBrowser.redUndone': view('this', [], []),
  'thisBrowser.redBackAfterUndo': view('this', [], ['red']),
  'thisBrowser.asOpenedBeforeRed': view('this', [], []),
  'thisBrowser.redUnranked': view('this', [], ['red']),
  'thisBrowser.redRanked': view('this', ['red'], []),
  'thisBrowser.blueAdded': view('this', ['red'], ['blue'], true),
  'thisBrowser.redRankedBlueUnranked': view('this', ['red'], ['blue']),
  'newBrowser.redUnranked': view('new', [], ['red']),
  'newBrowser.redRanked': view('new', ['red'], []),
  'newBrowser.redRankedBlueUnranked': view('new', ['red'], ['blue']),
};

function statePath(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${statePath(child)}`;
}

export function deviceImagesViewOf(snapshot: DeviceImagesSnapshot): DeviceImagesView {
  const found = DEVICE_IMAGES_VIEWS[statePath(snapshot.value)];
  if (!found) throw new RangeError(`No view for the device images state ${statePath(snapshot.value)}`);
  return found;
}

const constant = fc.constant({});

export const deviceImagesModel = defineModel({
  id: 'device-images',
  machine: deviceImagesMachine,
  events: {
    UPLOAD_RED: {generate: constant, when: offered('UPLOAD_RED')},
    UPLOAD_BLUE: {generate: constant, when: offered('UPLOAD_BLUE')},
    UNDO: {generate: constant, when: offered('UNDO')},
    TOAST_TIMES_OUT: {generate: constant, when: offered('TOAST_TIMES_OUT')},
    RANK_RED: {generate: constant, when: offered('RANK_RED')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
    BROWSER_FORWARD: {generate: constant, when: ({snapshot}: When) => snapshot.matches('thisBrowser')},
    RELOAD: {generate: constant, when: offered('RELOAD')},
    OPEN_IN_NEW_BROWSER: {generate: constant, when: offered('OPEN_IN_NEW_BROWSER')},
    CLOSE_NEW_BROWSER: {generate: constant, when: offered('CLOSE_NEW_BROWSER')},
  },
});
