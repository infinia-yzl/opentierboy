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
import {TierListProvider, useTierContext} from '@/contexts/TierContext';
import {CustomImagesProvider, useCustomImages} from '@/contexts/CustomImagesContext';
import {checkFile, isPictureFile, NOT_A_PICTURE, snapshotImages} from '@/components/useSnapshotFiles';
import {pastedImageLabel} from '@/lib/images/listImages';
import {
  SNAPSHOT_MESSAGES,
  snapshotLinkAfterImport,
  snapshotLinkTooLong,
  type SnapshotToOpen,
} from '@/lib/snapshot/open';
import {itemsToAdd} from '@/lib/tierListReducer';

/** The editor page of a new blank list, and its title (app/rank/[[...slug]]/page.tsx). */
const BLANK_LIST_PATH = '/rank';
const BLANK_LIST_TITLE = 'Custom Tier List';

/** Files someone chose or dropped on the landing page: a new object for each choice or drop. */
export interface HomeFileRequest {
  files: File[];
}

interface HomeFileOpenerProps {
  request: HomeFileRequest;
  /** Focus returns here when the "Open the list in this file?" dialog closes. */
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Opens files on the landing page ("Open a Freeze Frame" and the drop area of "Your own list"),
 * the way the editor's openFiles does (components/useSnapshotFiles.tsx), with its file checks and
 * its device image store (contexts/CustomImagesContext.tsx, lib/images/deviceStore.ts):
 *
 * - one file with a list (a snapshot file) asks first, then stores its images and opens its
 *   list in the editor with one router.push: the landing page stays one Back step away;
 * - pictures are stored in this browser and start a new list (/rank) with them in Unranked, also
 *   with one router.push;
 * - other files get the editor's messages.
 *
 * The page loads this only when the visitor chooses or drops a file, so the landing page opens
 * no device store before that. The editor providers run here with a blank list, for the device
 * store; this component never changes that list or the address, except for the one push.
 */
export default function HomeFileOpener({request, returnFocusRef}: HomeFileOpenerProps) {
  return (
    <TierListProvider pageTitle={BLANK_LIST_TITLE}>
      <CustomImagesProvider>
        <Opener request={request} returnFocusRef={returnFocusRef}/>
      </CustomImagesProvider>
    </TierListProvider>
  );
}

function Opener({request, returnFocusRef}: HomeFileOpenerProps) {
  const router = useRouter();
  const {tierCortex} = useTierContext();
  const {addDeviceImages, importDeviceImages} = useCustomImages();
  const [pending, setPending] = useState<SnapshotToOpen | null>(null);
  /** True from Open list until the editor replaces this page (or the opening fails). */
  const [opening, setOpening] = useState(false);
  /** True while a list is asked about or opened, or a new list starts: files are ignored then. */
  const busy = useRef(false);
  /** False once the page has closed: nothing more is stored or opened. */
  const alive = useRef(true);
  /** Requests already handled (an effect may run twice for one request). */
  const handled = useRef(new WeakSet<HomeFileRequest>());

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The handlers below run after awaits: read the latest helpers through a ref.
  const latest = useRef({addDeviceImages, importDeviceImages, tierCortex});
  useEffect(() => {
    latest.current = {addDeviceImages, importDeviceImages, tierCortex};
  }, [addDeviceImages, importDeviceImages, tierCortex]);

  /** Stores the pictures and opens a new list with them in Unranked. */
  const startList = useCallback(async (pictures: File[]) => {
    busy.current = true;
    const taken = new Set<string>();
    const images = pictures.map((file) => {
      const label = pastedImageLabel(file.name, taken);
      taken.add(label);
      return {blob: file, label};
    });
    const {items, errors} = await latest.current.addDeviceImages(images);
    if (!alive.current) return;
    if (errors.length > 0) toast.error('Some images could not be added', {description: errors.join(' ')});
    if (items.length === 0) {
      busy.current = false;
      return;
    }
    // The blank list of /rank, with the pictures at the end of Unranked, as the editor adds them.
    const {tierCortex: cortex} = latest.current;
    const tiers = cortex.getInitialTiers(undefined, undefined);
    const added = itemsToAdd(tiers, items);
    const last = tiers.length - 1;
    const state = cortex.encodeListForURL(BLANK_LIST_TITLE, tiers.map((tier, index) => (
      index === last ? {...tier, items: [...tier.items, ...added]} : tier
    )));
    router.push(`${BLANK_LIST_PATH}?state=${state}`);
  }, [router]);

  const openFiles = useCallback(async (files: File[]) => {
    // A list is being asked about or opened, or a new list starts.
    if (files.length === 0 || busy.current) return;
    const checks = await Promise.all(files.map(isPictureFile));
    if (!alive.current) return;
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
      if (!alive.current || busy.current) return;
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
    await startList(pictures);
  }, [startList]);

  useEffect(() => {
    if (handled.current.has(request)) return;
    handled.current.add(request);
    void openFiles(request.files);
  }, [request, openFiles]);

  /** Ends the opening: the dialog closes, and files are handled again. */
  const finishOpening = useCallback(() => {
    busy.current = false;
    setOpening(false);
    setPending(null);
  }, []);

  /** Opens a snapshot's list, as the editor does (useSnapshotFiles: openPending). */
  const openPending = useCallback(async (snapshot: SnapshotToOpen) => {
    setOpening(true);
    try {
      const {ids, errors} = await latest.current.importDeviceImages(snapshotImages(snapshot));
      if (!alive.current) return;
      const state = snapshotLinkAfterImport(snapshot, ids);
      if (snapshotLinkTooLong(state)) {
        toast.error('Could not open the file', {description: SNAPSHOT_MESSAGES.tooLarge});
        finishOpening();
        return;
      }
      if (errors.length > 0) toast.error('Some images could not be added', {description: errors.join(' ')});
      // The dialog stays ("Opening the list…") until the editor replaces this page, which
      // records the list in Recently viewed as a list opened fresh.
      router.push(`${snapshot.path}?state=${state}`);
    } catch {
      if (!alive.current) return;
      toast.error('Could not open the file', {description: SNAPSHOT_MESSAGES.damaged});
      finishOpening();
    }
  }, [router, finishOpening]);

  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => {
      // While the list opens, the dialog stays (Escape and Cancel do nothing).
      if (open || opening) return;
      setPending(null);
      busy.current = false;
    }}>
      <AlertDialogContent onCloseAutoFocus={(event) => {
        // The dialog has no trigger of its own: give focus back to "Open a Freeze Frame".
        event.preventDefault();
        returnFocusRef.current?.focus();
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Open the list in this file?</AlertDialogTitle>
          <AlertDialogDescription aria-live="polite">
            {opening ? 'Opening the list…' : 'This page stays one Back step away.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* aria-disabled, not disabled: focus stays in the dialog while the list opens. */}
          <AlertDialogCancel aria-disabled={opening}>Cancel</AlertDialogCancel>
          <AlertDialogAction aria-disabled={opening} onClick={(event) => {
            // The dialog stays open until the editor replaces this page.
            event.preventDefault();
            if (!pending || opening) return;
            void openPending(pending);
          }}>
            {opening ? 'Opening…' : 'Open list'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
