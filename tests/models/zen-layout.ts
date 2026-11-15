import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {zenLayoutMachine} from '../machines/zen-layout';
import {always, defineModel, offered, type When} from '../support/machines';

export const ZEN_LAYOUT_NAMES = {editor: 'Editor', wide: '16:9', tall: '9:16', overlay: 'Overlay · green key'} as const;
export type ZenLayoutKey = keyof typeof ZEN_LAYOUT_NAMES;

export const ZEN_FRAME_NAMES: Readonly<Record<ZenLayoutKey, string | null>> = {
  editor: null,
  wide: 'Frame 16:9',
  tall: 'Frame 9:16',
  overlay: 'Frame 16:9',
};

export type ZenLayoutSnapshot = SnapshotFrom<typeof zenLayoutMachine>;
export type ZenLayoutEvent = EventFrom<typeof zenLayoutMachine>;
type Value = {zen: 'off' | {on: ZenLayoutKey}; list: 'opened' | 'changed' | 'back'};

export function layoutOf(snapshot: ZenLayoutSnapshot): ZenLayoutKey | null {
  const {zen} = snapshot.value as Value;
  return zen === 'off' ? null : zen.on;
}

export function listChangedIn(snapshot: ZenLayoutSnapshot): boolean {
  return (snapshot.value as Value).list === 'changed';
}

const constant = fc.constant({});
const zenOff = ({snapshot}: When) => snapshot.matches({zen: 'off'} as never);

export const zenLayoutModel = defineModel({
  id: 'zen-layout',
  machine: zenLayoutMachine,
  events: {
    TOGGLE_ZEN: {generate: constant, when: offered('TOGGLE_ZEN')},
    EXIT_ZEN: {generate: constant, when: offered('EXIT_ZEN')},
    PRESS_ESCAPE: {generate: constant, when: always},
    CHOOSE_EDITOR: {generate: constant, when: offered('CHOOSE_EDITOR')},
    CHOOSE_WIDE: {generate: constant, when: offered('CHOOSE_WIDE')},
    CHOOSE_TALL: {generate: constant, when: offered('CHOOSE_TALL')},
    CHOOSE_OVERLAY: {generate: constant, when: offered('CHOOSE_OVERLAY')},
    CHANGE_LIST: {generate: constant, when: (args: When) => zenOff(args) && offered('CHANGE_LIST')(args)},
    BROWSER_BACK: {generate: constant, when: ({snapshot}: When) => snapshot.matches({list: 'changed'} as never)},
    BROWSER_FORWARD: {generate: constant, when: always},
  },
});
