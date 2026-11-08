/**
 * Freeze Frame's Download (A10): the steps that put the list into the captured picture.
 *
 * components/useSnapshotDownload.ts hands the file to the browser, or offers the picture alone.
 * This module touches no browser API at import time: the device images come through
 * `readDeviceImages`, and the decoder and canvas of prepareImageForStore through `prepare`.
 */
import {type PrepareImageOptions, prepareImageForStore} from './prepareImage';
import {normalizeRankPath} from '@/lib/rankPath';
import {SNAPSHOT_PAYLOAD_LIMITS, type SnapshotImage, writeSnapshotFile} from '@/lib/snapshot';
import {dataUrlFromImageBytes} from '@/lib/snapshot/dataUrl';
import {
  deviceImagesOfLink,
  MAX_SNAPSHOT_LINK_CHARS,
  snapshotFileName,
  snapshotLinkTooLong,
  snapshotOpenedLinkLength,
} from '@/lib/snapshot/open';
import {decodeState} from '@/lib/state';

/**
 * Longest side of a device image in a snapshot file. Tiles are small, so 512 pixels is plenty;
 * when all images together break the payload cap, they are drawn again at 256 pixels.
 */
export const SNAPSHOT_DOWNLOAD_IMAGE_SIDES: readonly number[] = Object.freeze([512, 256]);
const LONGEST_DATA_URL_PREFIX = 'data:image/jpeg;base64,'.length;
/** The largest image file whose data URL fits the payload's per-image cap. */
export const MAX_SNAPSHOT_DOWNLOAD_IMAGE_BYTES = Math.floor((SNAPSHOT_PAYLOAD_LIMITS.maxImageDataUrlChars - LONGEST_DATA_URL_PREFIX) / 4) * 3;
const TOO_LARGE_REASONS = new Set(['payload-too-large', 'text-too-large', 'file-too-large']);

export type SnapshotDownloadRefusal = 'too-large' | 'failed';

/** What Download says when the list cannot go into the picture. */
export const SNAPSHOT_DOWNLOAD_MESSAGES: Readonly<Record<SnapshotDownloadRefusal, string>> = Object.freeze({
  'too-large': 'This list is too large to keep in the picture',
  failed: 'The list could not be kept in the picture',
});

/** A Freeze Frame capture and the list it shows, kept together when the picture is taken. */
export interface Capture {
  picture: Blob;
  /** The link Share handed out at capture time (v3, A46). */
  state: string;
  /** The editor page at capture time. */
  path: string;
  title: string;
}

/** `fileName` is the download name in both cases: the picture alone downloads under it too. */
export type SnapshotDownloadResult =
  | {ok: true; file: Blob; fileName: string}
  | {ok: false; reason: SnapshotDownloadRefusal; fileName: string};

export interface SnapshotDownloadOptions {
  /** The stored device images with these ids. Missing images are left out. */
  readDeviceImages: (ids: string[]) => Promise<Map<string, Blob>>;
  /** The decoder and canvas for prepareImageForStore (tests). The browser's own by default. */
  prepare?: Pick<PrepareImageOptions, 'decode' | 'createCanvas'>;
}

interface ImageToKeep {
  id: string;
  label: string;
  blob: Blob;
}

/**
 * The device images as payload images, each drawn again at most `side` pixels (A10). An image
 * the browser cannot draw is left out: the list then shows its label tile. Null when all images
 * together break the payload cap.
 */
export async function snapshotDownloadImages(
  images: readonly ImageToKeep[],
  side: number,
  prepare: SnapshotDownloadOptions['prepare'] = {},
): Promise<SnapshotImage[] | null> {
  const kept: SnapshotImage[] = [];
  let total = 0;
  for (const image of images) {
    const prepared = await prepareImageForStore(image.blob, {...prepare, maxBytes: MAX_SNAPSHOT_DOWNLOAD_IMAGE_BYTES, maxSide: side, alwaysReencode: true});
    if (!prepared.ok) continue;
    const dataUrl = dataUrlFromImageBytes(new Uint8Array(await prepared.blob.arrayBuffer()));
    if (!dataUrl) continue;
    total += dataUrl.length;
    if (total > SNAPSHOT_PAYLOAD_LIMITS.maxTotalImageDataUrlChars) return null;
    kept.push({id: image.id, label: image.label.slice(0, SNAPSHOT_PAYLOAD_LIMITS.maxLabelChars), dataUrl});
  }
  return kept;
}

/**
 * The captured picture as a PNG file that also holds the list it shows (the link Share handed
 * out when the picture was taken) and the device images the list uses. Opening the file in
 * OpenTierBoy brings the list back (components/useSnapshotFiles.tsx). 'too-large' when the list
 * cannot go into the picture, 'failed' when anything else goes wrong. Never throws.
 */
export async function snapshotDownloadFile(
  {picture, state: shareLink, path: pathname, title}: Capture,
  {readDeviceImages, prepare}: SnapshotDownloadOptions,
): Promise<SnapshotDownloadResult> {
  const fileName = snapshotFileName(title);
  const refused = (reason: SnapshotDownloadRefusal): SnapshotDownloadResult => ({ok: false, reason, fileName});
  try {
    // A longer link would open to a blank page (snapshotLinkTooLong). Quick check first.
    if (snapshotLinkTooLong(shareLink)) return refused('too-large');
    const png = new Uint8Array(await picture.arrayBuffer());
    const devices = deviceImagesOfLink(shareLink);
    const blobs = await readDeviceImages(devices.map((device) => device.id));
    const present = devices.flatMap((device) => {
      const blob = blobs.get(device.id);
      return blob ? [{...device, blob}] : [];
    });
    let images: SnapshotImage[] | null = null;
    for (const side of SNAPSHOT_DOWNLOAD_IMAGE_SIDES) {
      images = await snapshotDownloadImages(present, side, prepare);
      if (images) break;
    }
    if (!images) return refused('too-large');
    // Opened in another browser, the images get longer ids: check the longest the link can get
    // there, as opening does (snapshotOpenedLinkLength), so the file always opens again.
    const list = decodeState(shareLink);
    const kept = new Set(images.map((image) => image.id));
    if (!list || snapshotOpenedLinkLength(list, kept) > MAX_SNAPSHOT_LINK_CHARS) return refused('too-large');
    const path = normalizeRankPath(pathname) ?? undefined;
    const result = await writeSnapshotFile(png, {state: shareLink, path, images});
    if (result.ok) return {ok: true, file: new Blob([result.png], {type: 'image/png'}), fileName};
    return refused(TOO_LARGE_REASONS.has(result.reason) ? 'too-large' : 'failed');
  } catch {
    return refused('failed');
  }
}
