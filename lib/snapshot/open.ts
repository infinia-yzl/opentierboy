/**
 * What the editor does with a file that someone opens, drops or pastes, and how a snapshot's
 * list gets its device images. Plain helpers for components/useSnapshotFiles.tsx.
 */
import {decodeState, encodeState, type CanonicalState} from '@/lib/state';
import type {SnapshotImage, SnapshotPayload} from './payload';
import type {ReadSnapshotFileResult} from './index';

type ReadFailure = Extract<ReadSnapshotFileResult, {ok: false}>['reason'];

/**
 * Reasons after which the file is offered as an ordinary picture: a PNG without a list, a file
 * that is not a PNG (JPEG, WebP...), and PNGs that picture viewers still show although they are
 * not quite valid (bytes after their end, a damaged minor chunk). The image check of the
 * add-items flow decides whether it really is a picture.
 */
const ADD_AS_IMAGE: ReadonlySet<ReadFailure> = new Set(['no-snapshot', 'not-png', 'bad-structure', 'bad-crc']);

export type SnapshotOpenOutcome = {action: 'add-as-image'} | {action: 'message'; message: string};

export const SNAPSHOT_MESSAGES = Object.freeze({
  damaged: 'This file is damaged, or it was not made by OpenTierBoy.',
  tooLarge: 'This file is too large to open as a list.',
  newer: 'This file was made by a newer version of OpenTierBoy. Reload the page and try again.',
  unsupported: 'This browser cannot open list files. Try a newer browser.',
});

/** What to do after reading a file failed with `reason`. */
export function snapshotOpenOutcome(reason: ReadFailure): SnapshotOpenOutcome {
  if (ADD_AS_IMAGE.has(reason)) return {action: 'add-as-image'};
  switch (reason) {
    case 'file-too-large':
    case 'text-too-large':
    case 'payload-too-large':
      return {action: 'message', message: SNAPSHOT_MESSAGES.tooLarge};
    case 'unsupported-version':
      return {action: 'message', message: SNAPSHOT_MESSAGES.newer};
    case 'unsupported':
      return {action: 'message', message: SNAPSHOT_MESSAGES.unsupported};
    default:
      return {action: 'message', message: SNAPSHOT_MESSAGES.damaged};
  }
}

export interface SnapshotToOpen {
  /** The list, decoded and checked by the link decoder. */
  list: CanonicalState;
  /** The link value as the file stored it. */
  state: string;
  /** The editor page to open: the file's path, or `/rank`. */
  path: string;
  /** The images the list's device items use, each once. Images no item uses are left out. */
  images: SnapshotImage[];
}

/** Decodes a snapshot's list. Null when the link value does not decode as a versioned list. */
export function snapshotToOpen(payload: SnapshotPayload): SnapshotToOpen | null {
  const list = decodeState(payload.state);
  if (!list || list.version < 3) return null;
  const used = new Set(deviceItemIds(list));
  return {
    list,
    state: payload.state,
    path: payload.path ?? '/rank',
    images: payload.images.filter(image => used.has(image.id)),
  };
}

/** The ids of the device images (v3 `{d}` items) of a list, each once, in list order. */
export function deviceItemIds(list: Pick<CanonicalState, 'tiers'>): string[] {
  const ids = new Set<string>();
  for (const tier of list.tiers) {
    for (const item of tier.items) if (item.kind === 'device') ids.add(item.id);
  }
  return Array.from(ids);
}

/**
 * The device images (v3 `{d}` items) of a link value, each once with the label of its first
 * item, in list order. [] when the value does not decode.
 */
export function deviceImagesOfLink(state: string): {id: string; label: string}[] {
  const list = decodeState(state);
  if (!list) return [];
  const images = new Map<string, string>();
  for (const tier of list.tiers) {
    for (const item of tier.items) if (item.kind === 'device' && !images.has(item.id)) images.set(item.id, item.content);
  }
  return Array.from(images, ([id, label]) => ({id, label}));
}

/**
 * The link value to open after the images were stored. `ids` maps each image's id in the file
 * to its id in this browser's store. When no id changed, the file's own value comes back
 * unchanged; otherwise the list is written again (v3) with the new ids in its `{d}` items.
 */
export function snapshotLinkAfterImport(snapshot: Pick<SnapshotToOpen, 'list' | 'state'>, ids: ReadonlyMap<string, string>): string {
  const changed = Array.from(ids).some(([from, to]) => from !== to);
  if (!changed) return snapshot.state;
  const list: CanonicalState = {
    ...snapshot.list,
    tiers: snapshot.list.tiers.map(tier => ({
      ...tier,
      items: tier.items.map(item => (item.kind === 'device' && ids.has(item.id) ? {...item, id: ids.get(item.id)!} : item)),
    })),
  };
  return encodeState(list, {format: 3});
}
