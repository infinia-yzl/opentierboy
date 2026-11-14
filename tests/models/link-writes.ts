import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {linkWritesMachine} from '../machines/link-writes';
import {defineModel, offered, type When} from '../support/machines';

/** The versions the link writes machine follows: the list as opened and 3 changes. */
export const MAX_LINK_VERSIONS = 4;

export type LinkWritesSnapshot = SnapshotFrom<typeof linkWritesMachine>;
export type LinkWritesEvent = EventFrom<typeof linkWritesMachine>;

/** What one state shows. Version 1 is the list as opened; each change adds the next version. */
export interface LinkWritesView {
  /** The version on screen: it shows at once, before its link reaches the address. */
  readonly onScreen: number;
  /** The version in the address: the last link that reached it, or the one Back or Forward went to. */
  readonly inAddress: number;
  /** The versions in the tab's history, one entry each. A change after Back drops the later ones only when its link arrives. */
  readonly versions: number;
  /** The links that wait for the server (0, 1 or 2). */
  readonly waiting: number;
}

/** What the page shows in a state of the link writes machine, such as {versions3: 'version2OneWaiting'}. */
export function linkWritesViewOf(snapshot: LinkWritesSnapshot): LinkWritesView {
  const [[parent, leaf]] = Object.entries(snapshot.value as Record<string, string>);
  const versions = Number(/^versions(\d)$/.exec(parent)?.[1]);
  const match = /^version(\d)(?:(One|Two)Waiting)?$/.exec(leaf);
  if (!versions || !match) throw new RangeError(`No view for the link writes state ${parent}.${leaf}`);
  const inAddress = Number(match[1]);
  const waiting = match[2] === 'Two' ? 2 : match[2] === 'One' ? 1 : 0;
  return {onScreen: inAddress + waiting, inAddress, versions, waiting};
}

const constant = fc.constant({});
/** No link waits for the server. */
const nothingWaits = ({snapshot}: When) => linkWritesViewOf(snapshot as LinkWritesSnapshot).waiting === 0;

/**
 * Changes, server answers and Back are sent where the machine takes them. Forward is sent
 * wherever no link waits: on the latest version the page must stay as it is, which after a change
 * that came after Back checks that the later versions are gone. Back and Forward are never sent
 * while a link waits: the change would be lost (the known-bug test in tests/e2e/history.spec.ts,
 * kept by the owner on 2026-10-25), so the machine has neither in its waiting states.
 */
export const linkWritesModel = defineModel({
  id: 'link-writes',
  machine: linkWritesMachine,
  events: {
    CHANGE_LIST: {generate: constant, when: offered('CHANGE_LIST')},
    SERVER_ANSWERS: {generate: constant, when: offered('SERVER_ANSWERS')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
    BROWSER_FORWARD: {generate: constant, when: nothingWaits},
  },
});
