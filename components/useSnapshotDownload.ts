'use client';

import {useCallback} from 'react';
import {toast} from 'sonner';
import {useCustomImages} from '@/contexts/CustomImagesContext';
import {prepareImageForStore} from '@/lib/images/prepareImage';
import {normalizeRankPath} from '@/lib/rankPath';
import {SNAPSHOT_PAYLOAD_LIMITS, type SnapshotImage, writeSnapshotFile} from '@/lib/snapshot';
import {dataUrlFromImageBytes} from '@/lib/snapshot/dataUrl';
import {deviceImagesOfLink, snapshotFileName, snapshotLinkTooLong} from '@/lib/snapshot/open';

/**
 * Longest side of a device image in a snapshot file. Tiles are small, so 512 pixels is plenty;
 * when all images together break the payload cap, they are drawn again at 256 pixels.
 */
const IMAGE_SIDES = [512, 256];
const LONGEST_DATA_URL_PREFIX = 'data:image/jpeg;base64,'.length;
/** The largest image file whose data URL fits the payload's per-image cap. */
const MAX_IMAGE_BYTES = Math.floor((SNAPSHOT_PAYLOAD_LIMITS.maxImageDataUrlChars - LONGEST_DATA_URL_PREFIX) / 4) * 3;
const TOO_LARGE_REASONS = new Set(['payload-too-large', 'text-too-large', 'file-too-large']);

const MESSAGES = {
  tooLarge: 'This list is too large to keep in the picture',
  failed: 'The list could not be kept in the picture',
};

/** Hands a file to the browser's download. */
function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started by then; the URL only keeps the bytes alive.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
async function snapshotImages(images: ImageToKeep[], side: number): Promise<SnapshotImage[] | null> {
  const kept: SnapshotImage[] = [];
  let total = 0;
  for (const image of images) {
    const prepared = await prepareImageForStore(image.blob, {maxBytes: MAX_IMAGE_BYTES, maxSide: side, alwaysReencode: true});
    if (!prepared.ok) continue;
    const dataUrl = dataUrlFromImageBytes(new Uint8Array(await prepared.blob.arrayBuffer()));
    if (!dataUrl) continue;
    total += dataUrl.length;
    if (total > SNAPSHOT_PAYLOAD_LIMITS.maxTotalImageDataUrlChars) return null;
    kept.push({id: image.id, label: image.label.slice(0, SNAPSHOT_PAYLOAD_LIMITS.maxLabelChars), dataUrl});
  }
  return kept;
}

/** A Freeze Frame capture and the list it shows, kept together when the picture is taken. */
export interface Capture {
  picture: Blob;
  /** The link Share handed out at capture time (v3, A46). */
  state: string;
  /** The editor page at capture time. */
  path: string;
  title: string;
}

/**
 * Freeze Frame's Download (A10): the captured picture as a PNG file that also holds the list it
 * shows (the link Share handed out when the picture was taken) and the device images the list
 * uses. Opening the file in OpenTierBoy brings the list back (components/useSnapshotFiles.tsx).
 * When the list cannot go into the picture (too large), it offers the picture without the list.
 */
export function useSnapshotDownload(): (capture: Capture) => Promise<void> {
  const {readDeviceImages} = useCustomImages();

  return useCallback(async ({picture, state: shareLink, path: pathname, title}: Capture) => {
    const fileName = snapshotFileName(title);
    const offerPictureOnly = (message: string) => {
      toast(message, {
        description: 'Download the picture without the list?',
        action: {label: 'Download picture', onClick: () => saveFile(picture, fileName)},
      });
    };
    try {
      // A longer link would open to a blank page (snapshotLinkTooLong).
      if (snapshotLinkTooLong(shareLink)) {
        offerPictureOnly(MESSAGES.tooLarge);
        return;
      }
      const png = new Uint8Array(await picture.arrayBuffer());
      const devices = deviceImagesOfLink(shareLink);
      const blobs = await readDeviceImages(devices.map((device) => device.id));
      const present = devices.flatMap((device) => {
        const blob = blobs.get(device.id);
        return blob ? [{...device, blob}] : [];
      });
      let images: SnapshotImage[] | null = null;
      for (const side of IMAGE_SIDES) {
        images = await snapshotImages(present, side);
        if (images) break;
      }
      if (!images) {
        offerPictureOnly(MESSAGES.tooLarge);
        return;
      }
      const path = normalizeRankPath(pathname) ?? undefined;
      const result = await writeSnapshotFile(png, {state: shareLink, path, images});
      if (result.ok) {
        saveFile(new Blob([result.png], {type: 'image/png'}), fileName);
        return;
      }
      offerPictureOnly(TOO_LARGE_REASONS.has(result.reason) ? MESSAGES.tooLarge : MESSAGES.failed);
    } catch {
      offerPictureOnly(MESSAGES.failed);
    }
  }, [readDeviceImages]);
}
