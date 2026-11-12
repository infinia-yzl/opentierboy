import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {zenLayoutMachine} from '../machines/zen-layout';
import {always, defineModel, offered} from '../support/machines';

/** Zen's layouts (lib/zen/layouts.ts), by the machine's state names, with their names in the Layout menu. */
export const ZEN_LAYOUT_NAMES = {editor: 'Editor', wide: '16:9', tall: '9:16', overlay: 'Overlay · green key'} as const;
export type ZenLayoutKey = keyof typeof ZEN_LAYOUT_NAMES;

export type ZenLayoutSnapshot = SnapshotFrom<typeof zenLayoutMachine>;
export type ZenLayoutEvent = EventFrom<typeof zenLayoutMachine>;

/** The layout of a snapshot in Zen, or null out of Zen. */
export function layoutOf(snapshot: ZenLayoutSnapshot): ZenLayoutKey | null {
  const value = snapshot.value as 'off' | {on: ZenLayoutKey};
  return value === 'off' ? null : value.on;
}

const constant = fc.constant({});

export const zenLayoutModel = defineModel({
  id: 'zen-layout',
  machine: zenLayoutMachine,
  // The Zen toggle, the Zen bar and its Layout menu are sent where the page shows them. Escape
  // is sent everywhere: out of Zen, the page must ignore it.
  events: {
    TOGGLE_ZEN: {generate: constant, when: offered('TOGGLE_ZEN')},
    EXIT_ZEN: {generate: constant, when: offered('EXIT_ZEN')},
    PRESS_ESCAPE: {generate: constant, when: always},
    CHOOSE_EDITOR: {generate: constant, when: offered('CHOOSE_EDITOR')},
    CHOOSE_WIDE: {generate: constant, when: offered('CHOOSE_WIDE')},
    CHOOSE_TALL: {generate: constant, when: offered('CHOOSE_TALL')},
    CHOOSE_OVERLAY: {generate: constant, when: offered('CHOOSE_OVERLAY')},
  },
});
