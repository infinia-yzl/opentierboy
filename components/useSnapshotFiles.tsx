'use client';

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
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
import {isIsoMediaFile, sniffImageType} from '@/lib/images/imageType';
import {pastedImageLabel} from '@/lib/images/listImages';
import {checkImage, labelFallback} from '@/lib/images/imageCheck';
import {
  type FoundLinkImages,
  foundNothing,
  linkImagesFromDrop,
  MAX_DROPPED_TEXT_LENGTH,
  MAX_LINKS_PER_ADD,
} from '@/lib/images/droppedLinks';
import {IMAGE_CHECK_FAILURE_MESSAGES, LINK_IMAGE_REFUSAL_MESSAGES} from '@/lib/images/messages';
import type Item from '@/models/Item';
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

/** Why waiting files were not added (the "Files not added" message). */
const NOT_ADDED = {
  history: 'You went Back or Forward before they were added:',
  list: 'A list file was being opened, so they were not added:',
} as const;

/** The name of a link image in messages and on its tile: its file name, else its site. */
function linkImageLabel(url: string, displayDomain: string): string {
  return labelFallback(url).text || displayDomain;
}
type NotAddedReason = keyof typeof NOT_ADDED;

type FileCheck =
  | {kind: 'snapshot'; snapshot: SnapshotToOpen}
  | {kind: 'image'}
  | {kind: 'message'; message: string};

/** True for a picture "From your device" would take: raster bytes, or an image type the browser reports. */
async function isPictureFile(file: File): Promise<boolean> {
  // The rule of "From your device" (prepareImageForStore): a raster picture by its bytes, or a
  // file the browser calls an image (SVG, BMP), which is drawn again before it is stored. AVIF
  // and HEIC pass here, also by their bytes alone (a browser may give a .heic file no type),
  // and get prepareImageForStore's own refusal message.
  if (file.type.startsWith('image/')) return true;
  try {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    return sniffImageType(head) !== null || isIsoMediaFile(head);
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


export interface UseSnapshotFiles {
  /**
   * Opens files that someone chose, dropped or pasted. One file with a list (a snapshot file)
   * asks whether to open the list; pictures become items; other files show a message. Files wait
   * their turn, each until the previous add is in the address. Files that wait while a list is
   * being asked about or opened, or across Back or Forward, are not added ("Files not added");
   * when the visitor leaves the editor, waiting files are dropped quietly.
   */
  openFiles: (files: File[]) => void;
  /**
   * Adds image addresses that someone dropped or pasted as link images, in turn with the files
   * (lib/images/droppedLinks.ts finds and checks them first).
   */
  openLinks: (found: FoundLinkImages) => void;
  /** The "Open the list in this file?" dialog. Render it once in the editor. */
  dialog: React.ReactNode;
  /** The Add images button: focus returns to it when the dialog closes. */
  openFileButtonRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Files in the editor: snapshot files (a Freeze Frame download with the list inside) and pictures.
 *
 * Opening a snapshot asks first. Then its images are drawn again (A10) and stored in the device
 * store under content-addressed ids (the list's `{d}` items follow), and the editor goes to the
 * list with one router.push: the list on screen before stays one Back step away. The dialog
 * stays open ("Opening the list…") until the list is in the address. Opening the same file again
 * stores nothing new, and when the address already shows the list nothing changes.
 */
export function useSnapshotFiles(): UseSnapshotFiles {
  const router = useRouter();
  const pathname = usePathname();
  const address = stateParam(useSearchParams().get('state'));
  const {tiers, writing} = useTierContext();
  const {addDeviceImages, importDeviceImages, isHostAllowed} = useCustomImages();
  const addItemsWithUndo = useAddItemsWithUndo();
  const [pending, setPending] = useState<SnapshotToOpen | null>(null);
  /** True from Open list until the list is in the address (or the opening ends otherwise). */
  const [opening, setOpening] = useState(false);
  /** Where the opening list goes, and the address it leaves. */
  const target = useRef<{path: string; state: string; from: string; title: string} | null>(null);
  const openFileButtonRef = useRef<HTMLButtonElement | null>(null);
  /** True while the dialog asks about a list and while that list opens: files are ignored then. */
  const busy = useRef(false);
  /** Files are handled one call at a time, in the order they arrive. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** False once the editor has closed: waiting files are dropped, quietly. */
  const alive = useRef(true);
  /** True once a link to another page was clicked: waiting files are dropped, quietly. */
  const leaving = useRef(false);
  /** Counts Back and Forward: files that waited across one are dropped. */
  const historyMoves = useRef(0);
  /** The names in each "Files not added" message on screen. */
  const notAddedNames = useRef<Record<NotAddedReason, string[]>>({history: [], list: []});

  useEffect(() => {
    alive.current = true;
    // Next.js moves through history with pushState; only Back and Forward fire popstate.
    const onHistoryMove = () => {
      historyMoves.current += 1;
    };
    window.addEventListener('popstate', onHistoryMove);
    // A click on a link to another page starts a navigation that the next add would cancel
    // (Next.js drops a navigation still loading when another starts): stop adding.
    const onLinkClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname !== window.location.pathname) leaving.current = true;
    };
    document.addEventListener('click', onLinkClick, true);
    return () => {
      alive.current = false;
      window.removeEventListener('popstate', onHistoryMove);
      document.removeEventListener('click', onLinkClick, true);
    };
  }, []);

  /** True once the editor closed or is being left: nothing more is added or opened. */
  const gone = useCallback(() => !alive.current || leaving.current, []);

  /** Says which waiting files were not added, and why: one message per reason, growing. */
  const notAdded = useCallback((items: File[] | string[], reason: NotAddedReason) => {
    const names = notAddedNames.current[reason];
    names.push(...items.map((item) => (typeof item === 'string' ? item : item.name)));
    const clear = () => {
      notAddedNames.current[reason] = [];
    };
    toast('Files not added', {
      id: `files-not-added-${reason}`,
      description: `${NOT_ADDED[reason]} ${names.join(', ')}.`,
      onDismiss: clear,
      onAutoClose: clear,
    });
  }, []);

  // The handlers below run after awaits: read the latest list, address and helpers through refs.
  const latest = useRef({tiers, addDeviceImages, addItemsWithUndo, isHostAllowed, pathname, address});
  useEffect(() => {
    latest.current = {tiers, addDeviceImages, addItemsWithUndo, isHostAllowed, pathname, address};
  }, [tiers, addDeviceImages, addItemsWithUndo, isHostAllowed, pathname, address]);

  /** Callers waiting until the address shows the list on screen. */
  const waiters = useRef<(() => void)[]>([]);
  const [waitTick, setWaitTick] = useState(0);
  useEffect(() => {
    if (writing || waiters.current.length === 0) return;
    waiters.current.splice(0).forEach((resolve) => resolve());
  }, [writing, waitTick]);
  useEffect(() => () => {
    // The editor closed: nothing waits for its address any more.
    waiters.current.splice(0).forEach((resolve) => resolve());
  }, []);
  /**
   * Resolves once the address shows the list on screen, with every change made before the call
   * (TierContext's `writing` is false again). The tick makes a render after those changes, so the
   * effect above sees them.
   */
  const untilWritten = useCallback(() => new Promise<void>((resolve) => {
    waiters.current.push(resolve);
    setWaitTick((tick) => tick + 1);
  }), []);

  const addAsItems = useCallback(async (files: File[], moves: number) => {
    const {tiers: current, addDeviceImages: add} = latest.current;
    const taken = new Set(current.flatMap((tier) => tier.items.map((item) => item.content)));
    const images = files.map((file) => {
      const label = pastedImageLabel(file.name, taken);
      taken.add(label);
      return {blob: file, label};
    });
    const {items, errors} = await add(images);
    if (gone()) return;
    // Back or Forward while the images were stored: the list on screen is another version now.
    if (historyMoves.current !== moves) {
      notAdded(files, 'history');
      return;
    }
    if (errors.length > 0) toast.error('Some images could not be added', {description: errors.join(' ')});
    if (items.length === 0) return;
    // The list may have changed while the images were stored: add them to the latest one.
    latest.current.addItemsWithUndo(items);
    // The next file waits until this change is in the address: each add is its own Back step
    // (product rule 2), however many files wait.
    await untilWritten();
  }, [untilWritten, notAdded, gone]);

  const openFiles = useCallback((files: File[]) => {
    if (files.length === 0 || !alive.current) return;
    // New files: the visitor stays (a click on a link that went nowhere).
    leaving.current = false;
    if (busy.current) {
      notAdded(files, 'list');
      return;
    }
    // In turn: quick pastes and drops each get added, in order, and two lists never open at once.
    const moves = historyMoves.current;
    const run = queue.current.then(() => openNow(files));
    queue.current = run.catch(() => undefined);

    async function openNow(files: File[]) {
      // The editor closed or is being left, or Back or Forward showed another version while
      // these files waited: they are not added (the version they were meant for is not on screen).
      if (gone()) return;
      if (historyMoves.current !== moves) {
        notAdded(files, 'history');
        return;
      }
      // A list was found in an earlier file and is being asked about or opened.
      if (busy.current) {
        notAdded(files, 'list');
        return;
      }
      const checks = await Promise.all(files.map(isPictureFile));
      if (gone()) return;
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
        if (gone()) return;
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
      await addAsItems(pictures, moves);
    }
  }, [addAsItems, notAdded, gone]);

  /**
   * Adds dropped or pasted image addresses as link images (#107), with the checks of "From a
   * link": the addresses passed checkLinkImageUrl already (lib/images/droppedLinks.ts). An image
   * from a trusted site, or from a site this visitor allowed, is loaded once to check it, and
   * added only when it loads. An image from any other site is added without loading it: it
   * waits for the visitor's consent ("Images from other sites"), like a link image in a shared
   * list. All the images of one drop or paste are one change: one Back step.
   */
  const openLinks = useCallback((found: FoundLinkImages) => {
    if (!alive.current) return;
    const names = found.accepted.map((link) => linkImageLabel(link.url, link.displayDomain));
    const problems = found.refused.map((refused) => `${refused.address}: ${LINK_IMAGE_REFUSAL_MESSAGES[refused.reason]}`);
    if (found.leftOut > 0) {
      toast('Too many image addresses', {
        description: `Up to ${MAX_LINKS_PER_ADD} are added at a time. ${found.leftOut} ${found.leftOut === 1 ? 'was' : 'were'} left out.`,
      });
    }
    if (found.accepted.length === 0) {
      if (problems.length > 0) toast.error(problems.length === 1 ? 'Could not add the image' : 'Could not add the images', {description: problems.join(' ')});
      return;
    }
    leaving.current = false;
    if (busy.current) {
      notAdded(names, 'list');
      return;
    }
    const moves = historyMoves.current;
    const run = queue.current.then(() => addLinksNow());
    queue.current = run.catch(() => undefined);

    async function addLinksNow() {
      if (gone()) return;
      if (historyMoves.current !== moves) {
        notAdded(names, 'history');
        return;
      }
      if (busy.current) {
        notAdded(names, 'list');
        return;
      }
      const {isHostAllowed: allowed} = latest.current;
      const results = await Promise.all(found.accepted.map(async (link, index): Promise<Item | string> => {
        const label = names[index];
        const item: Item = {id: link.url, content: label, source: 'link', url: link.url};
        // Never load an image from a site the visitor has not allowed: it waits for consent.
        if (!allowed(link.host)) return item;
        const check = await checkImage(link.url, {label});
        return check.ok ? item : `${label}: ${IMAGE_CHECK_FAILURE_MESSAGES[check.reason]}`;
      }));
      if (gone()) return;
      if (historyMoves.current !== moves) {
        notAdded(names, 'history');
        return;
      }
      const items = results.filter((result): result is Item => typeof result !== 'string');
      const failed = [...problems, ...results.filter((result): result is string => typeof result === 'string')];
      if (failed.length > 0) {
        toast.error(items.length > 0 ? 'Some images could not be added' : failed.length === 1 ? 'Could not add the image' : 'Could not add the images', {
          description: failed.join(' '),
        });
      }
      if (items.length === 0) return;
      latest.current.addItemsWithUndo(items);
      await untilWritten();
    }
  }, [untilWritten, notAdded, gone]);

  /** Ends the opening: the dialog closes, and files are handled again. */
  const finishOpening = useCallback(() => {
    target.current = null;
    busy.current = false;
    setOpening(false);
    setPending(null);
  }, []);

  /**
   * Opens a snapshot's list. The dialog stays open, saying "Opening the list…", until the address
   * shows the list: nothing can change the list meanwhile, so no later change replaces the
   * navigation (Next.js drops a navigation still loading when another starts).
   */
  const openPending = useCallback(async (snapshot: SnapshotToOpen) => {
    setOpening(true);
    const moves = historyMoves.current;
    /** True when the opening must stop: the visitor left, or went Back or Forward meanwhile. */
    const abandoned = () => {
      if (!alive.current) return true;
      if (!leaving.current && historyMoves.current === moves) return false;
      finishOpening();
      return true;
    };
    try {
      const {ids, errors} = await importDeviceImages(snapshotImages(snapshot));
      // Never pull a visitor who left back into the editor, or over a version they went to.
      if (abandoned()) return;
      const state = snapshotLinkAfterImport(snapshot, ids);
      if (snapshotLinkTooLong(state)) {
        toast.error('Could not open the file', {description: SNAPSHOT_MESSAGES.tooLarge});
        finishOpening();
        return;
      }
      if (errors.length > 0) toast.error('Some images could not be added', {description: errors.join(' ')});
      // A change made just before Open list may still be on its way to the address: a push now
      // would cancel it.
      await untilWritten();
      if (abandoned()) return;
      const here = latest.current;
      const title = snapshot.list.title ?? '';
      if (here.pathname === snapshot.path && here.address === state) {
        // The address shows this list already: opening it again changes nothing.
        recordRecentLink({path: snapshot.path, state, title});
        finishOpening();
        return;
      }
      target.current = {path: snapshot.path, state, from: `${here.pathname}?state=${here.address}`, title};
      router.push(`${snapshot.path}?state=${state}`);
    } catch {
      if (!alive.current) return;
      toast.error('Could not open the file', {description: SNAPSHOT_MESSAGES.damaged});
      finishOpening();
    }
  }, [importDeviceImages, router, untilWritten, finishOpening]);

  // The opening ends when the address shows the list: Recently viewed records it then (on
  // another editor page, the new editor records it as a list opened fresh). It also ends when
  // another address replaces the one it left (Back or Forward during the round trip).
  useEffect(() => {
    const opened = target.current;
    if (!opened) return;
    if (pathname === opened.path && address === opened.state) {
      recordRecentLink({path: opened.path, state: opened.state, title: opened.title});
      finishOpening();
    } else if (`${pathname}?state=${address}` !== opened.from) {
      finishOpening();
    }
  }, [pathname, address, finishOpening]);

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => {
      // While the list opens, the dialog stays (Escape and Cancel do nothing).
      if (open || opening) return;
      setPending(null);
      busy.current = false;
    }}>
      <AlertDialogContent onCloseAutoFocus={(event) => {
        // The dialog has no trigger of its own: give focus back to the Add images button.
        event.preventDefault();
        openFileButtonRef.current?.focus();
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Open the list in this file?</AlertDialogTitle>
          <AlertDialogDescription aria-live="polite">
            {opening ? 'Opening the list…' : 'Your current list stays one Back step away.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* aria-disabled, not disabled: focus stays in the dialog while the list opens. */}
          <AlertDialogCancel aria-disabled={opening}>Cancel</AlertDialogCancel>
          <AlertDialogAction aria-disabled={opening} onClick={(event) => {
            // The dialog closes once the list is in the address (finishOpening), not now.
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

  return {openFiles, openLinks, dialog, openFileButtonRef};
}

/** True for a drag or drop that carries files. */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/** True for a drag or drop that carries files, a link or text: something that may add images. */
function carriesImagesOrLinks(event: DragEvent): boolean {
  const types = Array.from(event.dataTransfer?.types ?? []);
  return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/plain');
}

/** A file input (for example in "From your device") takes its own drops. */
function onFileInput(event: Event): boolean {
  const target = event.target instanceof Element ? event.target : null;
  return Boolean(target?.closest('input[type="file"]'));
}

/** A text field (the title or a row name while it is edited) takes its own text drops. */
function onTextField(event: Event): boolean {
  const target = event.target instanceof Element ? event.target : null;
  return Boolean(target?.closest('input, textarea, [contenteditable=""], [contenteditable="true"]'));
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

/** The most `<img>` addresses read from a drop's HTML. */
const MAX_DROPPED_IMAGES_READ = 100;

/**
 * The addresses of the images in a drop's HTML (an image dragged from another page). The HTML is
 * parsed in a document of its own, which runs no script and loads nothing; only the `src`
 * attributes are read, as text.
 */
function imageSourcesInHtml(html: string): string[] {
  if (html === '' || html.length > MAX_DROPPED_TEXT_LENGTH) return [];
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(parsed.images).slice(0, MAX_DROPPED_IMAGES_READ).map((image) => image.getAttribute('src') ?? '');
  } catch {
    return [];
  }
}

/** The link images a drop carries (lib/images/droppedLinks.ts finds and checks them). */
function droppedLinkImages(data: DataTransfer): FoundLinkImages {
  return linkImagesFromDrop({
    imageSources: imageSourcesInHtml(data.getData('text/html')),
    uriList: data.getData('text/uri-list'),
    plain: data.getData('text/plain'),
  });
}

/**
 * Dropping on the editor page (owner decision, issue #107): files open (useSnapshotFiles:
 * openFiles), and image addresses (a link or an image dragged from another page) become link
 * images (openLinks). Without this, the browser would leave the page to show the dropped file or
 * link. While a dialog is open, drops anywhere (also on its overlay) do nothing, except on a file
 * input; a text field takes text dropped on it. Drags that start on this page (selected text)
 * are left alone.
 *
 * Returns true while something that may add images is dragged over the page: the editor shows
 * the drop overlay then.
 */
export function useEditorDrop(openFiles: (files: File[]) => void, openLinks: (found: FoundLinkImages) => void): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    /** True while a drag that started on this page goes on. */
    let fromThisPage = false;
    /** dragenter and dragleave come in pairs for each element the pointer crosses. */
    let depth = 0;
    const takes = (event: DragEvent) => !fromThisPage && carriesImagesOrLinks(event) && !onFileInput(event)
      && !(onTextField(event) && !carriesFiles(event));
    const stop = () => {
      depth = 0;
      setDragging(false);
    };
    const onDragStart = () => {
      fromThisPage = true;
    };
    const onDragEnd = () => {
      fromThisPage = false;
      stop();
    };
    const onDragEnter = (event: DragEvent) => {
      if (fromThisPage || !carriesImagesOrLinks(event)) return;
      depth += 1;
      setDragging(!dialogOpen());
    };
    const onDragLeave = (event: DragEvent) => {
      if (fromThisPage || !carriesImagesOrLinks(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDragOver = (event: DragEvent) => {
      if (!takes(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = dialogOpen() ? 'none' : 'copy';
    };
    const onDrop = (event: DragEvent) => {
      if (!takes(event)) {
        stop();
        return;
      }
      event.preventDefault();
      stop();
      if (dialogOpen() || !event.dataTransfer) return;
      const files = Array.from(event.dataTransfer.files ?? []);
      if (files.length > 0) {
        openFiles(files);
        return;
      }
      const found = droppedLinkImages(event.dataTransfer);
      if (!foundNothing(found)) openLinks(found);
    };
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragend', onDragEnd);
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('dragend', onDragEnd);
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [openFiles, openLinks]);
  return dragging;
}
