import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {linkWritesMachine} from '../machines/link-writes';
import {defineModel, offered} from '../support/machines';

/** The versions the link writes machine follows: the list as opened and 3 changes. */
export const MAX_LINK_VERSIONS = 4;

export type LinkWritesSnapshot = SnapshotFrom<typeof linkWritesMachine>;
export type LinkWritesEvent = EventFrom<typeof linkWritesMachine>;

/** What one state shows. Version 1 is the list as opened; each change adds the next version. */
export interface LinkWritesView {
  /** The version on screen: it shows at once, before its link reaches the address. */
  readonly onScreen: number;
  /** The version in the address: the last link that reached it, or the one Back went to. */
  readonly inAddress: number;
  /** The versions in the tab's history, one entry each. */
  readonly versions: number;
  /** The links that wait for the server (0, 1 or 2). */
  readonly waiting: number;
}

/** What the page shows in a state of the link writes machine, such as {versions3: 'oneWaiting'}. */
export function linkWritesViewOf(snapshot: LinkWritesSnapshot): LinkWritesView {
  const [[parent, leaf]] = Object.entries(snapshot.value as Record<string, string>);
  const versions = Number(/^versions(\d)$/.exec(parent)?.[1]);
  const back = /^version(\d)$/.exec(leaf);
  const waiting = {latest: 0, oneWaiting: 1, twoWaiting: 2}[leaf as 'latest' | 'oneWaiting' | 'twoWaiting'];
  if (!versions || (!back && waiting === undefined)) throw new RangeError(`No view for the link writes state ${parent}.${leaf}`);
  if (back) return {onScreen: Number(back[1]), inAddress: Number(back[1]), versions, waiting: 0};
  return {onScreen: versions + waiting, inAddress: versions, versions, waiting};
}

const constant = fc.constant({});

/**
 * Every event is sent only where the machine takes it. BROWSER_BACK is never sent while a link
 * waits: the change would be lost (the known-bug test in tests/e2e/history.spec.ts, kept by the
 * owner on 2026-10-25), so the machine has no Back in its waiting states.
 */
export const linkWritesModel = defineModel({
  id: 'link-writes',
  machine: linkWritesMachine,
  events: {
    CHANGE_LIST: {generate: constant, when: offered('CHANGE_LIST')},
    SERVER_ANSWERS: {generate: constant, when: offered('SERVER_ANSWERS')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
  },
});
