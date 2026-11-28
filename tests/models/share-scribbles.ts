import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {shareScribblesMachine} from '../machines/share-scribbles';
import {defineModel, offered, type When} from '../support/machines';

export type ShareScribblesSnapshot = SnapshotFrom<typeof shareScribblesMachine>;
export type ShareScribblesEvent = EventFrom<typeof shareScribblesMachine>;

type ClipboardInk = 'clipboardWithout' | 'clipboardWith';
type ScribblesValue = 'none' | {included: ClipboardInk} | {leftOut: ClipboardInk};
type Value = {panel: 'closed' | 'open'; scribbles: ScribblesValue};

export interface ShareScribblesView {
  readonly open: boolean;
  readonly scribbles: 'none' | 'included' | 'leftOut';
  readonly clipboardScribbles: boolean;
}

export const SCRIBBLES_LINES = {
  included: 'Every button below shares your scribbles too',
  leftOut: 'Every button below shares the list without your scribbles',
} as const;

export function shareScribblesViewOf(snapshot: ShareScribblesSnapshot): ShareScribblesView {
  const {panel, scribbles} = snapshot.value as Value;
  const clipboardInk = scribbles === 'none' ? 'clipboardWithout' : 'included' in scribbles ? scribbles.included : scribbles.leftOut;
  return {
    open: panel === 'open',
    scribbles: scribbles === 'none' ? 'none' : 'included' in scribbles ? 'included' : 'leftOut',
    clipboardScribbles: clipboardInk === 'clipboardWith',
  };
}

const constant = fc.constant({});
const panelOpen = ({snapshot}: When) => snapshot.matches({panel: 'open'});
const panelClosed = ({snapshot}: When) => snapshot.matches({panel: 'closed'});
const inOpenPanel = (type: string) => (args: When) => panelOpen(args) && offered(type)(args);

export const shareScribblesModel = defineModel({
  id: 'share-scribbles',
  machine: shareScribblesMachine,
  events: {
    OPEN_SHARE_PANEL: {generate: constant, when: offered('OPEN_SHARE_PANEL')},
    CLOSE_WITH_SHARE_BUTTON: {generate: constant, when: offered('CLOSE_WITH_SHARE_BUTTON')},
    DRAW_SCRIBBLE: {generate: constant, when: (args: When) => panelClosed(args) && offered('DRAW_SCRIBBLE')(args)},
    COPY_MARKDOWN: {generate: constant, when: inOpenPanel('COPY_MARKDOWN')},
    COPY_LINK: {generate: constant, when: inOpenPanel('COPY_LINK')},
    SWITCH_SCRIBBLES_OFF: {generate: constant, when: inOpenPanel('SWITCH_SCRIBBLES_OFF')},
    SWITCH_SCRIBBLES_ON: {generate: constant, when: inOpenPanel('SWITCH_SCRIBBLES_ON')},
  },
});
