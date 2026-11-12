import type {MachineModel} from '../support/machines';
import {historyModel} from './history';
import {tipsModel} from './tips';
import {tipsSharedListModel} from './tips-shared-list';
import {zenLayoutModel} from './zen-layout';
import {zenOrderModel} from './zen-order';

/**
 * Every model of tests/machines/. tests/unit/machines/walks.test.ts walks each one without a
 * browser and checks that the walk reaches every state node, transition and reachable state.
 * Add a new machine's model here.
 */
export const MACHINE_MODELS: readonly MachineModel[] = Object.freeze([
  zenLayoutModel,
  zenOrderModel,
  historyModel,
  tipsModel,
  tipsSharedListModel,
] as MachineModel[]);
