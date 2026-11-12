import * as fc from 'fast-check';
import {createMachine, types, type EventFrom, type SnapshotFrom} from 'xstate';
import {defineModel} from '../support/machines';

/**
 * The most versions of the list a walk makes: the list as opened and 3 changes. The campaign's
 * list holds 3 Unranked items, one for each change.
 */
export const MAX_VERSIONS = 4;

/** The label positions the walk chooses (Row options). Right works like Top: one is enough. */
export const LABEL_POSITIONS = ['left', 'top'] as const;
export type HistoryLabelPosition = typeof LABEL_POSITIONS[number];

interface HistoryContext {
  /** Which version of the list is on screen, from 0: the list as opened. */
  readonly index: number;
  /** How many versions of the list the tab's history holds: entries the walk can step to. */
  readonly versions: number;
  /** The label settings on screen. They never make a version (A3). */
  readonly labelPosition: HistoryLabelPosition;
  readonly itemLabels: boolean;
}

type VersionState = 'onlyVersion' | 'firstVersion' | 'middleVersion' | 'latestVersion';

/** The state of version `index` out of `versions`. */
function versionState(index: number, versions: number): VersionState {
  if (versions === 1) return 'onlyVersion';
  if (index === 0) return 'firstVersion';
  return index === versions - 1 ? 'latestVersion' : 'middleVersion';
}

/**
 * A change to the list pushes a new history entry after the one on screen (router.push,
 * contexts/TierContext.tsx). The browser drops the entries after the one on screen, so the
 * new version is the latest.
 */
const changeList = ({context}: {context: HistoryContext}) => {
  const index = context.index + 1;
  return {target: versionState(index, index + 1), context: {index, versions: index + 1}};
};

const goBack = ({context}: {context: HistoryContext}) => {
  const index = context.index - 1;
  return {target: versionState(index, context.versions), context: {index}};
};

const goForward = ({context}: {context: HistoryContext}) => {
  const index = context.index + 1;
  return {target: versionState(index, context.versions), context: {index}};
};

/**
 * Browser history as the list's undo (product rule 2): the versions of one list in the tab's
 * history, which one is on screen, and the label settings.
 *
 * - Every change to the list pushes one history entry. Back shows the previous version and
 *   Forward the next one. A change after Back drops the later versions.
 * - The first version is the list as the link opened it. Back from there leaves the editor for
 *   the page before (tests/e2e/history.spec.ts, "opened links"), so the machine has no Back there.
 * - With no later version, Forward does nothing.
 * - Label position and item labels replace the current entry (A3, LAYOUT_LINK_WRITE in
 *   lib/tierListReducer.ts): no new version. Back and Forward keep them as they are on screen.
 */
export const historyMachine = createMachine({
  id: 'history',
  description: 'Browser history as the list’s undo: each change adds a version, Back and Forward step between versions, a change after Back drops the later ones, and label settings add no version.',
  schemas: {
    context: types<HistoryContext>(),
    events: {
      CHANGE_LIST: types<{}>(),
      BROWSER_BACK: types<{}>(),
      BROWSER_FORWARD: types<{}>(),
      CHOOSE_LABEL_POSITION: types<{position: HistoryLabelPosition}>(),
      SET_ITEM_LABELS: types<{visible: boolean}>(),
    },
  },
  context: {index: 0, versions: 1, labelPosition: 'left', itemLabels: true},
  initial: 'onlyVersion',
  states: {
    onlyVersion: {on: {CHANGE_LIST: changeList}},
    firstVersion: {on: {CHANGE_LIST: changeList, BROWSER_FORWARD: goForward}},
    middleVersion: {on: {CHANGE_LIST: changeList, BROWSER_BACK: goBack, BROWSER_FORWARD: goForward}},
    latestVersion: {on: {CHANGE_LIST: changeList, BROWSER_BACK: goBack}},
  },
  on: {
    CHOOSE_LABEL_POSITION: ({event}) => ({context: {labelPosition: event.position}}),
    SET_ITEM_LABELS: ({event}) => ({context: {itemLabels: event.visible}}),
  },
});

export type HistorySnapshot = SnapshotFrom<typeof historyMachine>;
export type HistoryEvent = EventFrom<typeof historyMachine>;
type Snapshot = HistorySnapshot;
type When = {snapshot: Snapshot};

export const historyModel = defineModel({
  id: 'history',
  machine: historyMachine,
  events: {
    // Each change makes one more version, up to MAX_VERSIONS.
    CHANGE_LIST: {generate: fc.constant({}), weight: 3, when: ({snapshot}: When) => snapshot.context.index + 2 <= MAX_VERSIONS},
    // Back from the first version would leave the editor, which this machine does not follow.
    BROWSER_BACK: {generate: fc.constant({}), weight: 3, when: ({snapshot}: When) => snapshot.context.index > 0},
    // The browser offers Forward everywhere (its key and its menu). With no later version, the
    // page must stay as it is: after a change that came after Back, that is the check that the
    // later versions are gone.
    BROWSER_FORWARD: {generate: fc.constant({}), weight: 2},
    // Choosing the setting already chosen writes nothing, so only the other one is offered.
    CHOOSE_LABEL_POSITION: LABEL_POSITIONS.map((position) => ({
      case: position,
      generate: fc.constant({position}),
      when: ({snapshot}: When) => snapshot.context.labelPosition !== position,
    })),
    SET_ITEM_LABELS: [true, false].map((visible) => ({
      case: visible ? 'shown' : 'hidden',
      generate: fc.constant({visible}),
      when: ({snapshot}: When) => snapshot.context.itemLabels !== visible,
    })),
  },
  // Simple paths cannot walk this graph: Forward, and a change after Back, always lead to a
  // version the path has already shown, so no simple path takes them. Seeded random runs do.
  walk: {property: {seed: 14, numRuns: 5, maxCommands: 25}},
  // Bounds the graph of the reachable-state check (stopWhen); the walk stops at MAX_VERSIONS
  // through CHANGE_LIST's `when`.
  stopWhen: (snapshot) => snapshot.context.versions >= MAX_VERSIONS,
});
