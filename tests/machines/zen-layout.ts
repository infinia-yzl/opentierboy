import * as fc from 'fast-check';
import {createMachine, types, type EventFrom, type SnapshotFrom} from 'xstate';
import {defineModel} from '../support/machines';

/** Zen's layouts (lib/zen/layouts.ts), by their keys. */
export const ZEN_LAYOUT_KEYS = ['editor', 'wide', 'tall', 'overlay'] as const;
export type ZenLayoutKey = typeof ZEN_LAYOUT_KEYS[number];

/**
 * Zen on and off, and the layout chosen in the Zen bar's Layout menu (components/ZenBar.tsx).
 * The layout is a view setting in memory: it stays when Zen goes off and on again, and it never
 * writes the link (components/useZenLayout.ts).
 */
export const zenLayoutMachine = createMachine({
  id: 'zenLayout',
  description: 'Zen on and off, and the layout of the Zen bar’s Layout menu. The layout stays when Zen goes off and on again.',
  schemas: {
    events: {
      TOGGLE_ZEN: types<{}>(),
      EXIT_ZEN: types<{}>(),
      PRESS_ESCAPE: types<{}>(),
      CHOOSE_LAYOUT: types<{layout: ZenLayoutKey}>(),
    },
  },
  type: 'parallel',
  states: {
    mode: {
      initial: 'off',
      states: {
        off: {on: {TOGGLE_ZEN: {target: 'on'}}},
        on: {
          on: {
            EXIT_ZEN: {target: 'off'},
            // Escape with the focus on the list. On the Layout button, the first Escape closes
            // the button's tooltip (zen-layouts.spec.ts); the page object moves the focus first.
            PRESS_ESCAPE: {target: 'off'},
          },
        },
      },
    },
    layout: {
      initial: 'editor',
      states: {editor: {}, wide: {}, tall: {}, overlay: {}},
      on: {
        // The Layout menu is in the Zen bar, so a layout changes only in Zen.
        CHOOSE_LAYOUT: ({event, value}) =>
          (value as {mode: string}).mode === 'on' ? {target: `.${event.layout}`} : undefined,
      },
    },
  },
});

export type ZenLayoutSnapshot = SnapshotFrom<typeof zenLayoutMachine>;
export type ZenLayoutEvent = EventFrom<typeof zenLayoutMachine>;
type Snapshot = ZenLayoutSnapshot;
const inZen = ({snapshot}: {snapshot: Snapshot}) => snapshot.matches({mode: 'on'});

/** The layout a snapshot is in. */
export function layoutOf(snapshot: Snapshot): ZenLayoutKey {
  return (snapshot.value as {layout: ZenLayoutKey}).layout;
}

export const zenLayoutModel = defineModel({
  id: 'zen-layout',
  machine: zenLayoutMachine,
  // The Zen toggle and the Zen bar are offered one at a time, so `when` sends each only where the
  // page shows it. Escape is offered everywhere: outside Zen, the page must ignore it.
  events: {
    TOGGLE_ZEN: {generate: fc.constant({}), when: (args: {snapshot: Snapshot}) => !inZen(args)},
    EXIT_ZEN: {generate: fc.constant({}), when: inZen},
    PRESS_ESCAPE: fc.constant({}),
    CHOOSE_LAYOUT: ZEN_LAYOUT_KEYS.map((layout) => ({case: layout, generate: fc.constant({layout}), when: inZen})),
  },
  walk: {paths: 'simple'},
  // Simple paths enter each state once: they never choose Editor from another layout, and never
  // turn Zen off and on again, which is what shows that the layout stays.
  revisits: {seed: 1, numRuns: 10, maxCommands: 6},
});
