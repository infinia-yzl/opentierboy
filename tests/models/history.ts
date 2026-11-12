import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {historyMachine} from '../machines/history';
import {always, defineModel, offered} from '../support/machines';

/** The versions the history machine follows: the list as opened and 3 changes. */
export const MAX_VERSIONS = 4;

export type HistorySnapshot = SnapshotFrom<typeof historyMachine>;
export type HistoryEvent = EventFrom<typeof historyMachine>;
type Value = {list: string; labelPosition: 'left' | 'top'; itemLabels: 'shown' | 'hidden'};

/** What a snapshot shows: the version on screen (1 is the list as opened), the label position and the item labels. */
export function historyViewOf(snapshot: HistorySnapshot) {
  const {list, labelPosition, itemLabels} = snapshot.value as Value;
  const match = /^version(\d)of(\d)$/.exec(list);
  if (!match) throw new RangeError(`Not a version state: ${list}`);
  return {version: Number(match[1]), labelPosition, itemLabels: itemLabels === 'shown'};
}

const constant = fc.constant({});

export const historyModel = defineModel({
  id: 'history',
  machine: historyMachine,
  events: {
    CHANGE_LIST: {generate: constant, weight: 3, when: offered('CHANGE_LIST')},
    BROWSER_BACK: {generate: constant, weight: 3, when: offered('BROWSER_BACK')},
    // The browser offers Forward everywhere. On the latest version the page must stay as it is:
    // after a change that came after Back, that checks that the later versions are gone.
    BROWSER_FORWARD: {generate: constant, weight: 2, when: always},
    CHOOSE_TOP: {generate: constant, when: offered('CHOOSE_TOP')},
    CHOOSE_LEFT: {generate: constant, when: offered('CHOOSE_LEFT')},
    HIDE_ITEM_LABELS: {generate: constant, when: offered('HIDE_ITEM_LABELS')},
    SHOW_ITEM_LABELS: {generate: constant, when: offered('SHOW_ITEM_LABELS')},
  },
});
