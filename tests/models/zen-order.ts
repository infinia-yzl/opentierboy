import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {zenOrderMachine} from '../machines/zen-order';
import {defineModel, offered, type When} from '../support/machines';

/** The ranking orders of the Zen bar's menu (lib/zen/queue.ts), by the machine's state names, with their menu names. */
export const RANKING_ORDER_NAMES = {pickFreely: 'Pick freely', inOrder: 'In order', shuffle: 'Shuffle'} as const;
export type RankingOrderKey = keyof typeof RANKING_ORDER_NAMES;

export type ZenOrderSnapshot = SnapshotFrom<typeof zenOrderMachine>;
export type ZenOrderEvent = EventFrom<typeof zenOrderMachine>;
type OnValue = {on: {order: 'pickFreely' | {upNext: 'inOrder' | 'shuffle'}; queue: 'shown' | 'hidden'}};

/** The ranking order of a snapshot in Zen, or null out of Zen. */
export function orderOf(snapshot: ZenOrderSnapshot): RankingOrderKey | null {
  if (snapshot.value === 'off') return null;
  const {order} = (snapshot.value as OnValue).on;
  return order === 'pickFreely' ? order : order.upNext;
}

/** True when a snapshot in Zen has "Hide the queue" on. */
export function queueHiddenIn(snapshot: ZenOrderSnapshot): boolean {
  return snapshot.value !== 'off' && (snapshot.value as OnValue).on.queue === 'hidden';
}

const constant = fc.constant({});
const inZen = ({snapshot}: When) => snapshot.matches('on');

export const zenOrderModel = defineModel({
  id: 'zen-order',
  machine: zenOrderMachine,
  // The page object clicks the "Hide the queue" box, so each event is sent only when the box
  // has the other value. In Pick freely the box is unavailable: it is pressed there too, and the
  // page must change nothing.
  events: {
    TOGGLE_ZEN: {generate: constant, when: offered('TOGGLE_ZEN')},
    EXIT_ZEN: {generate: constant, when: offered('EXIT_ZEN')},
    CHOOSE_PICK_FREELY: {generate: constant, when: offered('CHOOSE_PICK_FREELY')},
    CHOOSE_IN_ORDER: {generate: constant, when: offered('CHOOSE_IN_ORDER')},
    CHOOSE_SHUFFLE: {generate: constant, when: offered('CHOOSE_SHUFFLE')},
    HIDE_QUEUE: {generate: constant, when: (args: When) => inZen(args) && !queueHiddenIn(args.snapshot as ZenOrderSnapshot)},
    SHOW_QUEUE: {generate: constant, when: (args: When) => inZen(args) && queueHiddenIn(args.snapshot as ZenOrderSnapshot)},
  },
});
