import type {MachineModel} from '../support/machines';
import {historyModel} from './history';
import {zenLayoutModel} from './zen-layout';
import {zenOrderModel} from './zen-order';

/**
 * Every model of tests/machines/. tests/unit/machines/diagrams.test.ts draws each one into
 * docs/machines/<id>.md and checks that its paths reach every state node and transition.
 * Add a new machine's model here.
 */
export const MACHINE_MODELS: readonly MachineModel[] = Object.freeze([
  zenLayoutModel,
  zenOrderModel,
  historyModel,
] as MachineModel[]);
