/**
 * What the editor does with a file that someone opens, drops or pastes, and how a snapshot's
 * list gets its device images. Plain helpers for components/useSnapshotFiles.tsx.
 */
import {decodeState, encodeState, V3_PREFIX, type CanonicalState} from '@/lib/state';
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

/**
 * The longest link value (the `state` value) a snapshot may open or write: 13,000 characters.
 * The whole address must stay under the servers' limits. Vercel accepts about 14 KB of URL, and
 * `next start` answers "431 Request Header Fields Too Large" (a blank page) at about 15,850
 * characters of state. With the page path (at most 512 characters), "?state=" and the site's
 * address, 13,000 characters of state keep the whole URL under 14,000 characters, with room
 * left for the other request headers.
 */
export const MAX_SNAPSHOT_LINK_CHARS = 13_000;

/** True when a link value is too long to open as an address (MAX_SNAPSHOT_LINK_CHARS). */
export function snapshotLinkTooLong(state: string): boolean {
  return state.length > MAX_SNAPSHOT_LINK_CHARS;
}

/**
 * The longest id a snapshot's image can get when the file opens in another browser: `snap-` and
 * 22 hash characters (lib/snapshot/imageId.ts). The file's own id is kept where this browser
 * holds it, and a hash collision gets a random id of 16 characters.
 */
export const OPENED_IMAGE_ID_CHARS = 27;

const ID_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * The link value of a list with the ids that the file's images (`imageIds`) can get when it opens
 * in another browser (OPENED_IMAGE_ID_CHARS): each id is replaced by its own placeholder of that
 * length (or of its own length, when longer), made of random characters, which compress about
 * as badly as a real hash. The same list and ids always give the same value. See
 * snapshotOpenedLinkLength.
 */
export function snapshotLinkWorstCase(list: CanonicalState, imageIds: ReadonlySet<string>): string {
  // xorshift32 with a fixed seed: the same placeholders on both sides.
  let seed = 0x9e3779b9;
  const nextCharacter = () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return ID_CHARACTERS[seed & 63];
  };
  const placeholders = new Map<string, string>();
  const placeholderOf = (id: string) => {
    let placeholder = placeholders.get(id);
    if (placeholder === undefined) {
      placeholder = Array.from({length: Math.max(OPENED_IMAGE_ID_CHARS, id.length)}, nextCharacter).join('');
      placeholders.set(id, placeholder);
    }
    return placeholder;
  };
  return encodeState({
    ...list,
    tiers: list.tiers.map(tier => ({
      ...tier,
      items: tier.items.map(item => (item.kind === 'device' && imageIds.has(item.id) ? {...item, id: placeholderOf(item.id)} : item)),
    })),
  }, {format: 3});
}

/**
 * Room for the compressor: a real hash id can compress a few characters worse than its
 * placeholder (at most 15 characters in 2,100 random lists). 64 keeps the estimate above the
 * link that opening writes.
 */
const OPENED_LINK_SLACK = 64;

/**
 * The longest the link value of a list can get once its file opens in another browser, where the
 * file's images (`imageIds`) get new, longer ids: snapshotLinkWorstCase plus OPENED_LINK_SLACK.
 * Download checks it against MAX_SNAPSHOT_LINK_CHARS, and opening checks it again before
 * anything is stored, so every file the app writes opens again.
 */
export function snapshotOpenedLinkLength(list: CanonicalState, imageIds: ReadonlySet<string>): number {
  const worst = snapshotLinkWorstCase(list, imageIds);
  return imageIds.size === 0 ? worst.length : worst.length + OPENED_LINK_SLACK;
}

export type SnapshotToOpenResult = {ok: true; snapshot: SnapshotToOpen} | {ok: false; message: string};

/**
 * Decodes a snapshot's list. Refuses a link value that does not decode as a versioned list
 * (damaged), or that is or can get too long to open as an address once its images get their ids
 * in this browser (too large, snapshotOpenedLinkLength): before anything is stored.
 */
export function snapshotToOpen(payload: SnapshotPayload): SnapshotToOpenResult {
  if (snapshotLinkTooLong(payload.state)) return {ok: false, message: SNAPSHOT_MESSAGES.tooLarge};
  // A file holds a v3 link. Any other version would go to the legacy decoder, which
  // decompresses without the v3 size cap: refuse it before decoding.
  if (!payload.state.startsWith(V3_PREFIX)) return {ok: false, message: SNAPSHOT_MESSAGES.damaged};
  const list = decodeState(payload.state);
  if (!list || list.version < 3) return {ok: false, message: SNAPSHOT_MESSAGES.damaged};
  const used = new Set(deviceItemIds(list));
  const images = payload.images.filter(image => used.has(image.id));
  if (snapshotOpenedLinkLength(list, new Set(images.map(image => image.id))) > MAX_SNAPSHOT_LINK_CHARS) {
    return {ok: false, message: SNAPSHOT_MESSAGES.tooLarge};
  }
  return {ok: true, snapshot: {list, state: payload.state, path: payload.path ?? '/rank', images}};
}

/**
 * The download name of a snapshot file: the title in lower case, letters and digits of any
 * script joined by '-', at most 80 characters; `tier-list.png` when nothing is left.
 */
export function snapshotFileName(title: string): string {
  // Built at call time: Unicode property escapes need a newer target than the build's ES2017.
  const nonWord = new RegExp('[^\\p{L}\\p{N}]+', 'gu');
  const slug = String(title).normalize('NFKC').toLowerCase().replace(nonWord, '-').replace(/^-+|-+$/g, '');
  const short = Array.from(slug).slice(0, 80).join('').replace(/-+$/, '');
  return `${short || 'tier-list'}.png`;
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
