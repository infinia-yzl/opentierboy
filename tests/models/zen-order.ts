import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {zenOrderMachine} from '../machines/zen-order';
import {defineModel, offered, type When} from '../support/machines';

export const RANKING_ORDER_NAMES = {pickFreely: 'Pick freely', inOrder: 'In order', shuffle: 'Shuffle'} as const;
export type RankingOrderKey = keyof typeof RANKING_ORDER_NAMES;

export type ZenOrderSnapshot = SnapshotFrom<typeof zenOrderMachine>;
export type ZenOrderEvent = EventFrom<typeof zenOrderMachine>;
type OnValue = {on: {order: 'pickFreely' | {upNext: 'inOrder' | 'shuffle'}; queue: 'shown' | 'hidden'}};

export function orderOf(snapshot: ZenOrderSnapshot): RankingOrderKey | null {
  if (snapshot.value === 'off') return null;
  const {order} = (snapshot.value as OnValue).on;
  return order === 'pickFreely' ? order : order.upNext;
}

export function queueHiddenIn(snapshot: ZenOrderSnapshot): boolean {
  return snapshot.value !== 'off' && (snapshot.value as OnValue).on.queue === 'hidden';
}

const constant = fc.constant({});
const inZen = ({snapshot}: When) => snapshot.matches('on');

export const zenOrderModel = defineModel({
  id: 'zen-order',
  machine: zenOrderMachine,
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
