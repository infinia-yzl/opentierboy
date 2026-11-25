/**
 * Opening a snapshot file's pictures: the steps that keep them in the device store (A10).
 *
 * The editor (contexts/CustomImagesContext.tsx) runs this one call at a time with "From your
 * device", and wires it to its object URLs, its image states and the list of removed images
 * through `SnapshotImportHooks`. This module touches no browser API at import time; the store,
 * and the decoder and canvas of prepareImageForStore, come from the caller.
 */
import type {DeviceImageType, DeviceStore} from './deviceStore';
import {DEVICE_IMAGE_REFUSAL_MESSAGES} from './messages';
import {type PrepareImageOptions, prepareImageForStore} from './prepareImage';
import {snapshotImageId} from '@/lib/snapshot/imageId';

/** Longest side of a snapshot file's images in the store: the app writes them at most this size. */
export const SNAPSHOT_IMAGE_SIDE = 512;

/** An image from a snapshot file, with its id in the file. */
export interface SnapshotDeviceImage {
  id: string;
  blob: Blob;
  label: string;
}

export interface ImportDeviceImagesResult {
  /** Each stored image's id in the file → its id in this browser's store. */
  ids: Map<string, string>;
  /** One message per image that could not be stored. */
  errors: string[];
}

export interface SnapshotImportHooks {
  /** Ids that eviction must not remove: the images the list shows, and those handed out. Read at each write. */
  keep: () => Iterable<string>;
  /**
   * Hands out a stored image: the list will show it, so nothing may remove it. May throw (an
   * object URL that cannot be made): the image is then not handed out, and gets the storage-error
   * message.
   */
  handOut: (id: string, blob: Blob, type: DeviceImageType) => void;
  /**
   * After a write that stored the image or removed others to make room (also when the write then
   * failed): `evicted` are the removed ids, `stored` the stored id (empty when the write failed).
   */
  afterWrite: (change: {evicted: string[]; stored: string[]}) => void;
  /** The decoder and canvas for prepareImageForStore (tests). The browser's own by default. */
  prepare?: Pick<PrepareImageOptions, 'decode' | 'createCanvas'>;
}

/** The message for an image that could not be stored for an unexpected reason. */
const storageError = (image: Pick<SnapshotDeviceImage, 'label'>) => `${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-error']}`;

/** The result when nothing could be stored: the storage-error message for each image. */
export function failedSnapshotImport(images: readonly Pick<SnapshotDeviceImage, 'label'>[]): ImportDeviceImagesResult {
  return {ids: new Map(), errors: images.map(storageError)};
}

/** True when two files hold the same bytes. */
export async function sameBytes(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false;
  const [left, right] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/**
 * Keeps the images of a snapshot file in the device store, in order. An image the store already
 * holds under the file's own id is used as it is, whatever the file holds: the file was made in
 * this browser, so its link stays the same (a file that reuses such an id on purpose can only
 * show the visitor's own picture). Every other image is drawn again first (AVIF and HEIC get the
 * refusal of "From your device"), at most SNAPSHOT_IMAGE_SIDE pixels on its longest side, and
 * stored under a content-addressed id (`snap-` and a hash of the drawn bytes,
 * lib/snapshot/imageId.ts): opening the same file again stores nothing new and gives the same
 * ids. An image the store already holds under that id is reused; a different picture under the
 * same id (a hash collision) gets a random id. No image in `hooks.keep()` is removed to make
 * room. Never throws for one image: whatever throws becomes the storage-error message for it.
 */
export async function importSnapshotImages(
  store: DeviceStore,
  images: readonly SnapshotDeviceImage[],
  hooks: SnapshotImportHooks,
): Promise<ImportDeviceImagesResult> {
  const ids = new Map<string, string>();
  const errors: string[] = [];
  for (const image of images) {
    // Whatever throws for one image becomes the usual message for that image.
    try {
      await importOne(image);
    } catch {
      errors.push(storageError(image));
    }
  }
  return {ids, errors};

  /** The URL comes first (hooks.handOut): when it cannot be made, the image is not handed out at all. */
  function handOut(fileId: string, id: string, blob: Blob, type: DeviceImageType) {
    hooks.handOut(id, blob, type);
    ids.set(fileId, id);
  }

  async function importOne(image: SnapshotDeviceImage) {
    // The file's own id names an image this browser already holds: the file was made here.
    // That copy shows, quietly; the file's bytes are not read (an AVIF there is not refused).
    const own = await store.get(image.id);
    if (own) {
      handOut(image.id, image.id, own.blob, own.type);
      return;
    }
    const prepared = await prepareImageForStore(image.blob, {
      ...hooks.prepare,
      maxBytes: store.limits.maxImageBytes,
      maxSide: SNAPSHOT_IMAGE_SIDE,
      alwaysReencode: true,
    });
    if (!prepared.ok) {
      errors.push(`${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES[prepared.reason]}`);
      return;
    }
    const id = await snapshotImageId(new Uint8Array(await prepared.blob.arrayBuffer()));
    const existing = await store.get(id);
    if (existing && await sameBytes(existing.blob, prepared.blob)) {
      handOut(image.id, id, existing.blob, existing.type);
      return;
    }
    // A different picture under the same id (a hash collision): store it under a random id.
    // Never remove an image the list shows, or one handed out that it may not show yet.
    const result = await store.put(prepared.blob, {id: existing ? undefined : id, keep: [...hooks.keep()]});
    // Images removed to make room, also when the write failed after making room.
    const removed = result.evicted ?? [];
    if (result.ok || removed.length > 0) hooks.afterWrite({evicted: removed, stored: result.ok ? [result.id] : []});
    if (!result.ok) {
      errors.push(`${image.label}: ${DEVICE_IMAGE_REFUSAL_MESSAGES[result.reason]}`);
      return;
    }
    handOut(image.id, result.id, prepared.blob, result.type);
  }
}
