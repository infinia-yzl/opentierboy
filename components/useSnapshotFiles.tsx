'use client';

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {useTierContext} from '@/contexts/TierContext';
import {type SnapshotDeviceImage, useCustomImages} from '@/contexts/CustomImagesContext';
import {useAddItemsWithUndo} from '@/components/useAddItems';
import {recordRecentLink} from '@/components/useRecentLinks';
import {pastedImageLabel} from '@/lib/images/listImages';
import {readSnapshotFile, SNAPSHOT_PNG_LIMITS} from '@/lib/snapshot';
import {imageBytesFromDataUrl} from '@/lib/snapshot/dataUrl';
import {
  SNAPSHOT_MESSAGES,
  snapshotLinkAfterImport,
  snapshotOpenOutcome,
  type SnapshotToOpen,
  snapshotToOpen,
} from '@/lib/snapshot/open';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

type FileCheck =
  | {kind: 'snapshot'; snapshot: SnapshotToOpen}
  | {kind: 'image'}
  | {kind: 'message'; message: string};

/**
 * Looks for a list in a file. The file is untrusted: a file over the snapshot size limit is never
 * read as a snapshot, only files that start like a PNG are read, and the reader checks the PNG,
 * caps the text and checks the payload with zod (lib/snapshot).
 */
async function checkFile(file: File): Promise<FileCheck> {
  try {
    if (file.size > SNAPSHOT_PNG_LIMITS.maxFileBytes) return {kind: 'image'};
    const head = new Uint8Array(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer());
    if (!PNG_SIGNATURE.every((value, index) => head[index] === value)) return {kind: 'image'};
    const result = await readSnapshotFile(await file.arrayBuffer());
    if (!result.ok) {
      const outcome = snapshotOpenOutcome(result.reason);
      return outcome.action === 'add-as-image' ? {kind: 'image'} : {kind: 'message', message: outcome.message};
    }
    const snapshot = snapshotToOpen(result.payload);
    return snapshot ? {kind: 'snapshot', snapshot} : {kind: 'message', message: SNAPSHOT_MESSAGES.damaged};
  } catch {
    return {kind: 'message', message: SNAPSHOT_MESSAGES.damaged};
  }
}

/** The images of a snapshot as files, from their data URLs (already checked by the payload schema). */
function snapshotImages(snapshot: SnapshotToOpen): SnapshotDeviceImage[] {
  return snapshot.images.flatMap((image) => {
    const decoded = imageBytesFromDataUrl(image.dataUrl);
    return decoded ? [{id: image.id, label: image.label || 'Image', blob: new Blob([decoded.bytes], {type: decoded.type})}] : [];
  });
}

export interface UseSnapshotFiles {
  /**
   * Opens files that someone chose, dropped or pasted. One file with a list (a snapshot file)
   * asks whether to open the list; pictures become items; other files show a message.
   */
  openFiles: (files: File[]) => void;
  /** The "Open the list in this file?" dialog. Render it once in the editor. */
  dialog: React.ReactNode;
}

/**
 * Files in the editor: snapshot files (a Freeze Frame download with the list inside) and pictures.
 *
 * Opening a snapshot asks first. Then its images are drawn again (A10) and stored in the device
 * store (new ids when another image has the same id, and the list's `{d}` items follow), and the
 * editor goes to the list with one router.push: the list on screen before stays one Back step away.
 */
export function useSnapshotFiles(): UseSnapshotFiles {
  const router = useRouter();
  const {tiers} = useTierContext();
  const {addDeviceImages, importDeviceImages} = useCustomImages();
  const addItemsWithUndo = useAddItemsWithUndo();
  const [pending, setPending] = useState<SnapshotToOpen | null>(null);

  // The handlers below run after awaits: read the latest list and helpers through refs.
  const latest = useRef({tiers, addDeviceImages, addItemsWithUndo});
  useEffect(() => {
    latest.current = {tiers, addDeviceImages, addItemsWithUndo};
  }, [tiers, addDeviceImages, addItemsWithUndo]);

  const addAsItems = useCallback(async (files: File[]) => {
    const {tiers: current, addDeviceImages: add} = latest.current;
    const taken = new Set(current.flatMap((tier) => tier.items.map((item) => item.content)));
    const images = files.map((file) => {
      const label = pastedImageLabel(file.name, taken);
      taken.add(label);
      return {blob: file, label};
    });
    const {items, errors} = await add(images);
    // The list may have changed while the images were stored: add them to the latest one.
    if (items.length > 0) latest.current.addItemsWithUndo(items);
    if (errors.length > 0) toast.error('Some images could not be added', {description: errors.join(' ')});
  }, []);

  const openFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    void (async () => {
      if (files.length === 1) {
        const check = await checkFile(files[0]);
        if (check.kind === 'snapshot') {
          setPending(check.snapshot);
          return;
        }
        if (check.kind === 'message') {
          toast.error('Could not open the file', {description: check.message});
          return;
        }
      }
      await addAsItems(files);
    })();
  }, [addAsItems]);

  const openPending = useCallback(async (snapshot: SnapshotToOpen) => {
    const {ids, errors} = await importDeviceImages(snapshotImages(snapshot));
    const state = snapshotLinkAfterImport(snapshot, ids);
    router.push(`${snapshot.path}?state=${state}`);
    recordRecentLink({path: snapshot.path, state, title: snapshot.list.title ?? ''});
    if (errors.length > 0) toast.error('Some images could not be added', {description: errors.join(' ')});
  }, [importDeviceImages, router]);

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => {
      if (!open) setPending(null);
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Open the list in this file?</AlertDialogTitle>
          <AlertDialogDescription>Your current list stays one Back step away.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            if (pending) void openPending(pending);
          }}>
            Open list
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {openFiles, dialog};
}

/** True for a drag or drop that carries files (not text or a link). */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/** Leaves drops on fields and dialogs alone: the file input of "From your device" takes its own drops. */
function inFieldOrDialog(event: Event): boolean {
  const target = event.target instanceof Element ? event.target : null;
  return Boolean(target?.closest('input, textarea, [contenteditable=""], [contenteditable="true"], [role="dialog"], [role="alertdialog"]'));
}

/**
 * Dropping files anywhere on the editor page opens them (useSnapshotFiles). Without this, the
 * browser would leave the page to show the dropped file.
 */
export function useFileDrop(openFiles: (files: File[]) => void) {
  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (!carriesFiles(event) || inFieldOrDialog(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event) || inFieldOrDialog(event)) return;
      event.preventDefault();
      openFiles(Array.from(event.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [openFiles]);
}
