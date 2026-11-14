import type {MachineModel} from '../support/machines';
import {historyModel} from './history';
import {tipsModel} from './tips';
import {tipsSharedListModel} from './tips-shared-list';
import {zenLayoutModel} from './zen-layout';
import {zenOrderModel} from './zen-order';
import {linkImagesModel} from './link-images';
import {appearanceModel} from './appearance';
import {recentlyViewedModel} from './recently-viewed';
import {keyboardDragModel} from './keyboard-drag';
import {sharePanelModel} from './share-panel';
import {snapshotFilesModel} from './snapshot-files';
import {deviceImagesModel} from './device-images';
import {freezeFrameLoadModel} from './freeze-frame-load';
import {mouseDragModel} from './mouse-drag';
import {sharedLinkModel} from './shared-link';
import {addFromTemplateModel} from './add-from-template';
import {removeAndUndoModel} from './remove-and-undo';
import {linkWritesModel} from './link-writes';
import {editorRowsModel} from './editor-rows';
import {zenStepsModel} from './zen-steps';
import {leavingWritesModel} from './leaving-writes';
import {labelWritesModel} from './label-writes';
import {linkDialogModel} from './link-dialog';

/**
 * The model of every machine in tests/machines/. tests/unit/machines/walks.test.ts walks each one
 * without a browser and checks that the walk reaches every state node, transition and reachable
 * state. Add a new machine's model here.
 */
export const MACHINE_MODELS: readonly MachineModel[] = Object.freeze([
  zenLayoutModel,
  zenOrderModel,
  historyModel,
  tipsModel,
  tipsSharedListModel,
  linkImagesModel,
  appearanceModel,
  recentlyViewedModel,
  keyboardDragModel,
  sharePanelModel,
  snapshotFilesModel,
  deviceImagesModel,
  freezeFrameLoadModel,
  mouseDragModel,
  sharedLinkModel,
  addFromTemplateModel,
  removeAndUndoModel,
  linkWritesModel,
  editorRowsModel,
  zenStepsModel,
  leavingWritesModel,
  labelWritesModel,
  linkDialogModel,
] as MachineModel[]);
