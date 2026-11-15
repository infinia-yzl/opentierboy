'use client';

import {useCallback} from 'react';
import {toast} from 'sonner';
import {useCustomImages} from '@/contexts/CustomImagesContext';
import {type Capture, SNAPSHOT_DOWNLOAD_MESSAGES, snapshotDownloadFile} from '@/lib/images/snapshotDownload';

export type {Capture};

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

/**
 * Freeze Frame's Download (A10): the captured picture as a PNG file that also holds the list it
 * shows and the device images the list uses (lib/images/snapshotDownload.ts). When the list
 * cannot go into the picture (too large), it offers the picture without the list.
 */
export function useSnapshotDownload(): (capture: Capture) => Promise<void> {
  const {readDeviceImages} = useCustomImages();

  return useCallback(async (capture: Capture) => {
    const result = await snapshotDownloadFile(capture, {readDeviceImages});
    const offerPictureOnly = (message: string) => {
      toast(message, {
        description: 'Download the picture without the list?',
        action: {label: 'Download picture', onClick: () => saveFile(capture.picture, result.fileName)},
      });
    };
    if (!result.ok) {
      offerPictureOnly(SNAPSHOT_DOWNLOAD_MESSAGES[result.reason]);
      return;
    }
    try {
      saveFile(result.file, result.fileName);
    } catch {
      offerPictureOnly(SNAPSHOT_DOWNLOAD_MESSAGES.failed);
    }
  }, [readDeviceImages]);
}
