import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {sharePanelMachine} from '../machines/share-panel';
import {always, defineModel, offered, type When} from '../support/machines';

export type SharePanelSnapshot = SnapshotFrom<typeof sharePanelMachine>;
export type SharePanelEvent = EventFrom<typeof sharePanelMachine>;

type PanelValue = 'closed' | {open: 'urlTab' | 'imageTab'};
type Made = 'thisList' | 'listBefore';
type Value = {panel: PanelValue; picture: 'none' | Made; clipboard: 'empty' | Made; deviceImages: 'none' | 'one'};

/** What a state of the share panel machine shows. */
export interface SharePanelView {
  /** The tab on screen, or null with the panel closed. */
  readonly tab: 'URL' | 'Image' | null;
  /** In the Image tab: whether a captured picture shows (null in the other states). */
  readonly captured: boolean | null;
  /** The device images in the list the picture shows (what Download saves), or null with no picture. */
  readonly pictureDeviceImages: 0 | 1 | null;
  /** The device images in the list whose link the clipboard holds, or null when nothing was copied. */
  readonly clipboardDeviceImages: 0 | 1 | null;
  /** Images from the device in the list on screen: the panel's note counts them. */
  readonly deviceImages: 0 | 1;
}

/** The device images in a list made now (thisList) or before the one device image was added (listBefore). */
const deviceImagesIn = (made: Made, now: 0 | 1): 0 | 1 => (made === 'thisList' ? now : 0);

/** What the page shows in a state of the share panel machine. */
export function sharePanelViewOf(snapshot: SharePanelSnapshot): SharePanelView {
  const {panel, picture, clipboard, deviceImages} = snapshot.value as Value;
  const open = panel === 'closed' ? null : panel.open;
  const now = deviceImages === 'one' ? 1 : 0;
  return {
    tab: open === null ? null : open === 'urlTab' ? 'URL' : 'Image',
    captured: open === 'imageTab' ? picture !== 'none' : null,
    pictureDeviceImages: picture === 'none' ? null : deviceImagesIn(picture, now),
    clipboardDeviceImages: clipboard === 'empty' ? null : deviceImagesIn(clipboard, now),
    deviceImages: now,
  };
}

const constant = fc.constant({});
const inUrlTab = ({snapshot}: When) => snapshot.matches({panel: {open: 'urlTab'}});
const inImageTab = ({snapshot}: When) => snapshot.matches({panel: {open: 'imageTab'}});
/** The Add images menu is reached with the panel closed; the model adds one device image. */
const panelClosedWithoutDeviceImage = ({snapshot}: When) =>
  snapshot.matches({panel: 'closed'}) && snapshot.matches({deviceImages: 'none'});

export const sharePanelModel = defineModel({
  id: 'share-panel',
  machine: sharePanelMachine,
  // Escape is sent everywhere: with the panel closed, the page must ignore it. Copy Markdown is
  // in the URL tab, and Capture Preview and Download in the Image tab, Download only with a picture.
  events: {
    OPEN_SHARE_PANEL: {generate: constant, when: offered('OPEN_SHARE_PANEL')},
    CLOSE_WITH_SHARE_BUTTON: {generate: constant, when: offered('CLOSE_WITH_SHARE_BUTTON')},
    PRESS_ESCAPE: {generate: constant, when: always},
    CLICK_OUTSIDE: {generate: constant, when: offered('CLICK_OUTSIDE')},
    CHOOSE_IMAGE_TAB: {generate: constant, when: offered('CHOOSE_IMAGE_TAB')},
    CHOOSE_URL_TAB: {generate: constant, when: offered('CHOOSE_URL_TAB')},
    CAPTURE_PREVIEW: {generate: constant, when: inImageTab},
    DOWNLOAD: {generate: constant, when: (args: When) => inImageTab(args) && offered('DOWNLOAD')(args)},
    COPY_MARKDOWN: {generate: constant, when: inUrlTab},
    ADD_DEVICE_IMAGE: {generate: constant, when: panelClosedWithoutDeviceImage},
  },
});
