import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {zenLayoutMachine} from '../machines/zen-layout';
import {always, defineModel, offered, type When} from '../support/machines';

/** Zen's layouts (lib/zen/layouts.ts), by the machine's state names, with their names in the Layout menu. */
export const ZEN_LAYOUT_NAMES = {editor: 'Editor', wide: '16:9', tall: '9:16', overlay: 'Overlay · green key'} as const;
export type ZenLayoutKey = keyof typeof ZEN_LAYOUT_NAMES;

/** The frame each layout draws, by its accessible name, or null for none. */
export const ZEN_FRAME_NAMES: Readonly<Record<ZenLayoutKey, string | null>> = {
  editor: null,
  wide: 'Frame 16:9',
  tall: 'Frame 9:16',
  overlay: 'Frame 16:9',
};

export type ZenLayoutSnapshot = SnapshotFrom<typeof zenLayoutMachine>;
export type ZenLayoutEvent = EventFrom<typeof zenLayoutMachine>;
type Value = {zen: 'off' | {on: ZenLayoutKey}; list: 'opened' | 'changed' | 'back'};

/** The layout of a snapshot in Zen, or null out of Zen. */
export function layoutOf(snapshot: ZenLayoutSnapshot): ZenLayoutKey | null {
  const {zen} = snapshot.value as Value;
  return zen === 'off' ? null : zen.on;
}

/** True when the list on screen and in the address is the changed one; false for the list as opened. */
export function listChangedIn(snapshot: ZenLayoutSnapshot): boolean {
  return (snapshot.value as Value).list === 'changed';
}

const constant = fc.constant({});
const zenOff = ({snapshot}: When) => snapshot.matches({zen: 'off'} as never);

export const zenLayoutModel = defineModel({
  id: 'zen-layout',
  machine: zenLayoutMachine,
  // The Zen toggle, the Zen bar and its Layout menu are sent where the page shows them. Escape
  // is sent everywhere: out of Zen, the page must ignore it. The change is made out of Zen, with
  // the editor's tools. Back and Forward are sent in each layout (the machine's Zen declares
  // them), and Forward everywhere: where no later version is left, the page must stay as it is.
  events: {
    TOGGLE_ZEN: {generate: constant, when: offered('TOGGLE_ZEN')},
    EXIT_ZEN: {generate: constant, when: offered('EXIT_ZEN')},
    PRESS_ESCAPE: {generate: constant, when: always},
    CHOOSE_EDITOR: {generate: constant, when: offered('CHOOSE_EDITOR')},
    CHOOSE_WIDE: {generate: constant, when: offered('CHOOSE_WIDE')},
    CHOOSE_TALL: {generate: constant, when: offered('CHOOSE_TALL')},
    CHOOSE_OVERLAY: {generate: constant, when: offered('CHOOSE_OVERLAY')},
    CHANGE_LIST: {generate: constant, when: (args: When) => zenOff(args) && offered('CHANGE_LIST')(args)},
    // Back only from the change: Back from the list as opened would leave the editor.
    BROWSER_BACK: {generate: constant, when: ({snapshot}: When) => snapshot.matches({list: 'changed'} as never)},
    BROWSER_FORWARD: {generate: constant, when: always},
  },
});
