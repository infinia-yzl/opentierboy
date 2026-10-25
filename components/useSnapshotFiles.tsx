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
import {sniffImageType} from '@/lib/images/imageType';
import {pastedImageLabel} from '@/lib/images/listImages';
import {readSnapshotFile, SNAPSHOT_PNG_LIMITS} from '@/lib/snapshot';
import {imageBytesFromDataUrl} from '@/lib/snapshot/dataUrl';
import {
  SNAPSHOT_MESSAGES,
  snapshotLinkAfterImport,
  snapshotLinkTooLong,
  snapshotOpenOutcome,
  type SnapshotToOpen,
  snapshotToOpen,
} from '@/lib/snapshot/open';
import {stateParam} from '@/lib/tierListReducer';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const NOT_A_PICTURE = 'This file is not a picture.';

type FileCheck =
  | {kind: 'snapshot'; snapshot: SnapshotToOpen}
  | {kind: 'image'}
  | {kind: 'message'; message: string};

/** True for a picture "From your device" would take: raster bytes, or an image type the browser reports. */
async function isPictureFile(file: File): Promise<boolean> {
  // The rule of "From your device" (prepareImageForStore): a raster picture by its bytes, or a
  // file the browser calls an image (SVG, BMP), which is drawn again before it is stored. AVIF
  // and HEIC pass here and get prepareImageForStore's own refusal message.
  if (file.type.startsWith('image/')) return true;
  try {
    return sniffImageType(new Uint8Array(await file.slice(0, 64).arrayBuffer())) !== null;
  } catch {
    return false;
  }
}

/**
 * Looks for a list in a file. The file is untrusted: a file over the snapshot size limit is never
 * read as a snapshot, only files that start like a PNG are read, and the reader checks the PNG,
 * caps the text, checks the payload with zod (images by their declared size too) and refuses a
 * link too long to open (lib/snapshot).
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
    const opened = snapshotToOpen(result.payload);
    return opened.ok ? {kind: 'snapshot', snapshot: opened.snapshot} : {kind: 'message', message: opened.message};
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

/** True when the address already shows this list: opening it again changes nothing. */
function addressShows(path: string, state: string): boolean {
  return window.location.pathname === path && stateParam(new URLSearchParams(window.location.search).get('state')) === state;
}

export interface UseSnapshotFiles {
  /**
   * Opens files that someone chose, dropped or pasted. One file with a list (a snapshot file)
   * asks whether to open the list; pictures become items; other files show a message. Files that
   * arrive while a list is being asked about or opened are ignored; others wait their turn.
   */
  openFiles: (files: File[]) => void;
  /** The "Open the list in this file?" dialog. Render it once in the editor. */
  dialog: React.ReactNode;
  /** The Open file button: focus returns to it when the dialog closes. */
  openFileButtonRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Files in the editor: snapshot files (a Freeze Frame download with the list inside) and pictures.
 *
 * Opening a snapshot asks first. Then its images are drawn again (A10) and stored in the device
 * store under content-addressed ids (the list's `{d}` items follow), and the editor goes to the
 * list with one router.push: the list on screen before stays one Back step away. Opening the same
 * file again stores nothing new, and when the address already shows the list nothing changes.
 */
export function useSnapshotFiles(): UseSnapshotFiles {
  const router = useRouter();
  const {tiers} = useTierContext();
  const {addDeviceImages, importDeviceImages} = useCustomImages();
  const addItemsWithUndo = useAddItemsWithUndo();
  const [pending, setPending] = useState<SnapshotToOpen | null>(null);
  const openFileButtonRef = useRef<HTMLButtonElement | null>(null);
  /** True while the dialog asks about a list and while that list opens: files are ignored then. */
  const busy = useRef(false);
  /** Files are handled one call at a time, in the order they arrive. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** True from Open list until the list has opened. */
  const openingRef = useRef(false);

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
    if (files.length === 0 || busy.current) return;
    // In turn: quick pastes and drops each get added, in order, and two lists never open at once.
    const run = queue.current.then(() => openNow(files));
    queue.current = run.catch(() => undefined);

    async function openNow(files: File[]) {
      // A list was found in an earlier file and is being asked about or opened.
      if (busy.current) return;
      const checks = await Promise.all(files.map(isPictureFile));
      const pictures = files.filter((_, index) => checks[index]);
      const refused = files.filter((_, index) => !checks[index]);
      if (refused.length > 0) {
        toast.error(refused.length === files.length ? 'Could not open the file' : 'Some files could not be opened', {
          description: refused.map((file) => `${file.name}: ${NOT_A_PICTURE}`).join(' '),
        });
      }
      if (pictures.length === 0) return;
      if (pictures.length === 1) {
        const check = await checkFile(pictures[0]);
        if (check.kind === 'snapshot') {
          busy.current = true;
          setPending(check.snapshot);
          return;
        }
        if (check.kind === 'message') {
          toast.error('Could not open the file', {description: check.message});
          return;
        }
      }
      await addAsItems(pictures);
    }
  }, [addAsItems]);

  const openPending = useCallback(async (snapshot: SnapshotToOpen) => {
    const loading = toast.loading('Opening the list…');
    try {
      const {ids, errors} = await importDeviceImages(snapshotImages(snapshot));
      const state = snapshotLinkAfterImport(snapshot, ids);
      if (snapshotLinkTooLong(state)) {
        toast.error('Could not open the file', {description: SNAPSHOT_MESSAGES.tooLarge});
        return;
      }
      if (!addressShows(snapshot.path, state)) router.push(`${snapshot.path}?state=${state}`);
      recordRecentLink({path: snapshot.path, state, title: snapshot.list.title ?? ''});
      if (errors.length > 0) toast.error('Some images could not be added', {description: errors.join(' ')});
    } finally {
      toast.dismiss(loading);
      busy.current = false;
    }
  }, [importDeviceImages, router]);

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => {
      if (open) return;
      setPending(null);
      // Cancel ends the wait here; Open list ends it when the list has opened (openPending).
      if (!openingRef.current) busy.current = false;
    }}>
      <AlertDialogContent onCloseAutoFocus={(event) => {
        // The dialog has no trigger of its own: give focus back to the Open file button.
        event.preventDefault();
        openFileButtonRef.current?.focus();
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Open the list in this file?</AlertDialogTitle>
          <AlertDialogDescription>Your current list stays one Back step away.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            if (!pending) return;
            openingRef.current = true;
            void openPending(pending).finally(() => {
              openingRef.current = false;
            });
          }}>
            Open list
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {openFiles, dialog, openFileButtonRef};
}

/** True for a drag or drop that carries files (not text or a link). */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/** A file input (for example in "From your device") takes its own drops. */
function onFileInput(event: Event): boolean {
  const target = event.target instanceof Element ? event.target : null;
  return Boolean(target?.closest('input[type="file"]'));
}

/**
 * True while a dialog, an alert dialog, the share panel, a menu (Manage items, Select rows, a
 * tile's right-click menu) or a list box (a select) is open: drops then do nothing.
 */
function dialogOpen(): boolean {
  return document.querySelector([
    '[role="dialog"][data-state="open"]',
    '[role="alertdialog"][data-state="open"]',
    '[role="menu"][data-state="open"]',
    '[role="listbox"][data-state="open"]',
  ].join(', ')) !== null;
}

/**
 * Dropping files anywhere on the editor page opens them (useSnapshotFiles). Without this, the
 * browser would leave the page to show the dropped file. While a dialog is open, drops anywhere
 * (also on its overlay) do nothing, except on a file input.
 */
export function useFileDrop(openFiles: (files: File[]) => void) {
  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (!carriesFiles(event) || onFileInput(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = dialogOpen() ? 'none' : 'copy';
    };
    const onDrop = (event: DragEvent) => {
      if (!carriesFiles(event) || onFileInput(event)) return;
      event.preventDefault();
      if (dialogOpen()) return;
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
