import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {sharePanelMachine} from '../machines/share-panel';
import {always, defineModel, offered, type When} from '../support/machines';

export type SharePanelSnapshot = SnapshotFrom<typeof sharePanelMachine>;
export type SharePanelEvent = EventFrom<typeof sharePanelMachine>;

type PanelValue = 'closed' | {open: 'urlTab' | 'imageTab'} | {capturing: 'urlTab' | 'imageTab' | 'closed'};
type Made = 'thisList' | 'listBefore';
type Value = {panel: PanelValue; picture: 'none' | Made; clipboard: 'empty' | Made; deviceImages: 'none' | 'one'};

export interface SharePanelView {
  readonly tab: 'URL' | 'Image' | null;
  readonly capturing: boolean;
  readonly captured: boolean | null;
  readonly pictureDeviceImages: 0 | 1 | null;
  readonly clipboardDeviceImages: 0 | 1 | null;
  readonly deviceImages: 0 | 1;
}

const deviceImagesIn = (made: Made, now: 0 | 1): 0 | 1 => (made === 'thisList' ? now : 0);

export function sharePanelViewOf(snapshot: SharePanelSnapshot): SharePanelView {
  const {panel, picture, clipboard, deviceImages} = snapshot.value as Value;
  const capturing = panel !== 'closed' && 'capturing' in panel;
  const part = panel === 'closed' ? 'closed' : 'capturing' in panel ? panel.capturing : panel.open;
  const open = part === 'closed' ? null : part;
  const now = deviceImages === 'one' ? 1 : 0;
  return {
    tab: open === null ? null : open === 'urlTab' ? 'URL' : 'Image',
    capturing,
    captured: open === 'imageTab' ? picture !== 'none' : null,
    pictureDeviceImages: picture === 'none' ? null : deviceImagesIn(picture, now),
    clipboardDeviceImages: clipboard === 'empty' ? null : deviceImagesIn(clipboard, now),
    deviceImages: now,
  };
}

const constant = fc.constant({});
const inUrlTab = ({snapshot}: When) => snapshot.matches({panel: {open: 'urlTab'}});
const inImageTab = ({snapshot}: When) => snapshot.matches({panel: {open: 'imageTab'}});
const capturing = ({snapshot}: When) => snapshot.matches({panel: 'capturing'});
const panelClosedWithoutDeviceImage = ({snapshot}: When) =>
  snapshot.matches({panel: 'closed'}) && snapshot.matches({deviceImages: 'none'});

export const sharePanelModel = defineModel({
  id: 'share-panel',
  machine: sharePanelMachine,
  events: {
    OPEN_SHARE_PANEL: {generate: constant, when: offered('OPEN_SHARE_PANEL')},
    CLOSE_WITH_SHARE_BUTTON: {generate: constant, when: offered('CLOSE_WITH_SHARE_BUTTON')},
    PRESS_ESCAPE: {generate: constant, when: always},
    CLICK_OUTSIDE: {generate: constant, when: offered('CLICK_OUTSIDE')},
    CHOOSE_IMAGE_TAB: {generate: constant, when: offered('CHOOSE_IMAGE_TAB')},
    CHOOSE_URL_TAB: {generate: constant, when: offered('CHOOSE_URL_TAB')},
    CAPTURE_PREVIEW: {generate: constant, when: offered('CAPTURE_PREVIEW')},
    ENCODER_ANSWERS: {generate: constant, when: capturing},
    DOWNLOAD: {generate: constant, when: (args: When) => inImageTab(args) && offered('DOWNLOAD')(args)},
    COPY_MARKDOWN: {generate: constant, when: inUrlTab},
    ADD_DEVICE_IMAGE: {generate: constant, when: panelClosedWithoutDeviceImage},
  },
});
