import * as fc from 'fast-check';
import {createMachine, types, type EventFrom, type SnapshotFrom} from 'xstate';
import {defineModel} from '../support/machines';

/** The ranking orders of the Zen bar's menu (lib/zen/queue.ts: 'pick', 'order', 'shuffle'), by state name. */
export const RANKING_ORDER_KEYS = ['pickFreely', 'inOrder', 'shuffle'] as const;
export type RankingOrderKey = typeof RANKING_ORDER_KEYS[number];

/**
 * Zen on and off, the Zen bar's Ranking order menu (Pick freely, In order, Shuffle) and its
 * "Hide the queue" checkbox (components/ZenBar.tsx). Both are view settings in memory: they stay
 * when Zen goes off and on again, and they never write the link (components/useRankingOrder.ts).
 * "Hide the queue" is unavailable in Pick freely, but it stays as it was: choosing In order or
 * Shuffle again shows the queue hidden or shown as before (useRankingOrder.ts, setOrder).
 */
export const zenOrderMachine = createMachine({
  id: 'zenOrder',
  schemas: {
    events: {
      TOGGLE_ZEN: types<{}>(),
      EXIT_ZEN: types<{}>(),
      CHOOSE_ORDER: types<{order: RankingOrderKey}>(),
      SET_HIDE_QUEUE: types<{hide: boolean}>(),
    },
  },
  type: 'parallel',
  states: {
    mode: {
      initial: 'off',
      states: {
        off: {on: {TOGGLE_ZEN: {target: 'on'}}},
        // Escape also leaves Zen; the Zen layout machine checks it (tests/machines/zen-layout.ts).
        on: {on: {EXIT_ZEN: {target: 'off'}}},
      },
    },
    order: {
      initial: 'pickFreely',
      states: {pickFreely: {}, inOrder: {}, shuffle: {}},
      on: {
        // The menu is in the Zen bar, so the order changes only in Zen. Shuffle chosen again
        // draws a new order (useRankingOrder.ts, setOrder): the same state, a new draw.
        CHOOSE_ORDER: ({event, value}) =>
          (value as {mode: string}).mode === 'on' ? {target: `.${event.order}`} : undefined,
      },
    },
    queue: {
      initial: 'queueShown',
      states: {queueShown: {}, queueHidden: {}},
      on: {
        // The checkbox is unavailable in Pick freely (ZenBar.tsx, `disabled={order === 'pick'}`).
        SET_HIDE_QUEUE: ({event, value}) => {
          const {mode, order} = value as {mode: string; order: RankingOrderKey};
          if (mode !== 'on' || order === 'pickFreely') return undefined;
          return {target: event.hide ? '.queueHidden' : '.queueShown'};
        },
      },
    },
  },
});

export type ZenOrderSnapshot = SnapshotFrom<typeof zenOrderMachine>;
export type ZenOrderEvent = EventFrom<typeof zenOrderMachine>;
type Snapshot = ZenOrderSnapshot;
type Value = {mode: 'off' | 'on'; order: RankingOrderKey; queue: 'queueShown' | 'queueHidden'};

/** The ranking order a snapshot is in. */
export function orderOf(snapshot: Snapshot): RankingOrderKey {
  return (snapshot.value as Value).order;
}

/** True when a snapshot has "Hide the queue" turned on. */
export function queueHiddenIn(snapshot: Snapshot): boolean {
  return (snapshot.value as Value).queue === 'queueHidden';
}

/** Every state of the machine, as its leaf states joined: "on · inOrder · queueHidden". */
export const ZEN_ORDER_STATES: readonly string[] = (['off', 'on'] as const).flatMap((mode) =>
  RANKING_ORDER_KEYS.flatMap((order) => ['queueShown', 'queueHidden'].map((queue) => `${mode} · ${order} · ${queue}`)));

/** A snapshot's state, as in ZEN_ORDER_STATES. */
export function stateNameOf(snapshot: Snapshot): string {
  const {mode, order, queue} = snapshot.value as Value;
  return `${mode} · ${order} · ${queue}`;
}

const inZen = ({snapshot}: {snapshot: Snapshot}) => snapshot.matches({mode: 'on'});

export const zenOrderModel = defineModel({
  id: 'zen-order',
  description: 'Zen on and off, the Zen bar’s Ranking order and “Hide the queue”. Both stay when Zen goes off and on again; “Hide the queue” is unavailable in Pick freely but stays as it was.',
  machine: zenOrderMachine,
  // The Zen toggle and the Zen bar are offered one at a time. "Hide the queue" is offered where
  // the menu lets it change: in Zen, outside Pick freely, to the other value (the page object
  // checks the box's current value before it clicks).
  events: {
    TOGGLE_ZEN: {generate: fc.constant({}), when: (args: {snapshot: Snapshot}) => !inZen(args)},
    EXIT_ZEN: {generate: fc.constant({}), when: inZen},
    CHOOSE_ORDER: RANKING_ORDER_KEYS.map((order) => ({case: order, generate: fc.constant({order}), when: inZen})),
    SET_HIDE_QUEUE: [true, false].map((hide) => ({
      case: hide ? 'hide' : 'show',
      generate: fc.constant({hide}),
      when: (args: {snapshot: Snapshot}) =>
        inZen(args) && orderOf(args.snapshot) !== 'pickFreely' && queueHiddenIn(args.snapshot) !== hide,
    })),
  },
  // Seeded runs, not simple paths: the graph has 28 simple paths (182 steps), over 3 minutes in a
  // loaded browser, and they enter each state once, so they never turn Zen on again with an order
  // or a hidden queue chosen before. Seed 99's 7 runs (77 steps) reach all 12 states and turn Zen
  // off and on again in every order with the queue shown and hidden, and go from Pick freely back
  // to In order and Shuffle with the queue hidden. The campaign checks that every state was
  // reached; check the runs again after a change to the events.
  walk: {property: {seed: 99, numRuns: 8, maxCommands: 40}},
});
