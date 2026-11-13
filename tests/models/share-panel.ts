import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {sharePanelMachine} from '../machines/share-panel';
import {always, defineModel, offered, type When} from '../support/machines';

export type SharePanelSnapshot = SnapshotFrom<typeof sharePanelMachine>;
export type SharePanelEvent = EventFrom<typeof sharePanelMachine>;

type PanelValue = 'closed' | {open: 'urlTab' | {imageTab: 'noCapture' | 'captured'}};
type Value = {panel: PanelValue; clipboard: 'empty' | 'holdsLink'; deviceImages: 'none' | 'one'};

/** What a state of the share panel machine shows. */
export interface SharePanelView {
  /** The tab on screen, or null with the panel closed. */
  readonly tab: 'URL' | 'Image' | null;
  /** In the Image tab: whether a captured picture shows (null in the other states). */
  readonly captured: boolean | null;
  /** Whether the clipboard holds the Markdown that Copy Markdown wrote. */
  readonly clipboardHoldsLink: boolean;
  /** Images from the device in the list: the panel's note counts them. */
  readonly deviceImages: 0 | 1;
}

/** What the page shows in a state of the share panel machine. */
export function sharePanelViewOf(snapshot: SharePanelSnapshot): SharePanelView {
  const {panel, clipboard, deviceImages} = snapshot.value as Value;
  const open = panel === 'closed' ? null : panel.open;
  return {
    tab: open === null ? null : open === 'urlTab' ? 'URL' : 'Image',
    captured: open === null || open === 'urlTab' ? null : open.imageTab === 'captured',
    clipboardHoldsLink: clipboard === 'holdsLink',
    deviceImages: deviceImages === 'one' ? 1 : 0,
  };
}

const constant = fc.constant({});
/** Copy Markdown is in the URL tab only. */
const inUrlTab = ({snapshot}: When) => snapshot.matches({panel: {open: 'urlTab'}});
/** The Add images menu is reached with the panel closed; the model adds one device image. */
const panelClosedWithoutDeviceImage = ({snapshot}: When) =>
  snapshot.matches({panel: 'closed'}) && snapshot.matches({deviceImages: 'none'});

export const sharePanelModel = defineModel({
  id: 'share-panel',
  machine: sharePanelMachine,
  // Escape is sent everywhere: with the panel closed, the page must ignore it.
  events: {
    OPEN_SHARE_PANEL: {generate: constant, when: offered('OPEN_SHARE_PANEL')},
    CLOSE_WITH_SHARE_BUTTON: {generate: constant, when: offered('CLOSE_WITH_SHARE_BUTTON')},
    PRESS_ESCAPE: {generate: constant, when: always},
    CLICK_OUTSIDE: {generate: constant, when: offered('CLICK_OUTSIDE')},
    CHOOSE_IMAGE_TAB: {generate: constant, when: offered('CHOOSE_IMAGE_TAB')},
    CHOOSE_URL_TAB: {generate: constant, when: offered('CHOOSE_URL_TAB')},
    CAPTURE_PREVIEW: {generate: constant, when: offered('CAPTURE_PREVIEW')},
    DOWNLOAD: {generate: constant, when: offered('DOWNLOAD')},
    COPY_MARKDOWN: {generate: constant, when: inUrlTab},
    ADD_DEVICE_IMAGE: {generate: constant, when: panelClosedWithoutDeviceImage},
  },
});
