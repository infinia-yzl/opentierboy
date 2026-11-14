'use client';

import React, {useEffect, useRef, useState} from 'react';
import {toast} from '@/lib/toast';
import {usePathname, useSearchParams} from 'next/navigation';
import {Cross2Icon} from '@radix-ui/react-icons';
import {Button} from '@/components/ui/button';
import {useTierContext} from '@/contexts/TierContext';
import {useZenMode} from '@/components/usePageState';
import {endTips, openSharePanel, useTips} from '@/components/useTips';
import {openedFromLinkLoad, type TipId} from '@/lib/tips/tips';
import type Tier from '@/models/Tier';
import {cn} from '@/lib/utils';

/**
 * The one-time tips of the editor (owner-approved onboarding proposal, 2026-10-31; rules in
 * lib/tips/tips.ts). EditorTips watches the list and starts and ends the tips, and shows the two
 * toasts; FirstDragHint (the Unranked tray's hint line) and SharedListTip (under the title) show
 * the two tips that sit in the page. Tips hide in Zen and stay out of Freeze Frame captures, and
 * showing, closing or hiding a tip never changes the link.
 */

/** How long a tip toast stays, unless closed. Long enough to read two sentences. */
const TIP_TOAST_MS = 10_000;

const rankedRows = (tiers: readonly Tier[]) => tiers.slice(0, -1);
const unrankedRow = (tiers: readonly Tier[]) => tiers[tiers.length - 1];

const hasRankedItem = (tiers: readonly Tier[]) => rankedRows(tiers).some(tier => tier.items.length > 0);

/** The editor has images in Unranked and nothing in the rows. */
const waitsForFirstDrag = (tiers: readonly Tier[]) =>
  (unrankedRow(tiers)?.items.length ?? 0) > 0 && !hasRankedItem(tiers);

const deviceImageIds = (tiers: readonly Tier[]) =>
  new Set(tiers.flatMap(tier => tier.items.filter(item => item.source === 'device').map(item => item.id)));

/** Whether an editor opened in this document already (a store with a closure, A47). */
function createDocumentEditors() {
  let opened = false;
  return Object.freeze({
    openedBefore: (): boolean => opened,
    markOpened: () => {
      opened = true;
    },
  });
}

const documentEditors = createDocumentEditors();

/** The document's navigation: its type and the address it was loaded for, or null. */
function documentNavigation(): {type: string; url: string} | null {
  const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
  return entry ? {type: entry.type, url: entry.name} : null;
}

/** "Hide tips" and the close button of a tip. */
function TipButtons({onClose, onHide, closeLabel}: {onClose: () => void; onHide: () => void; closeLabel: string}) {
  return (
    <>
      <button
        type="button"
        onClick={onHide}
        className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Hide tips
      </button>
      <Button type="button" variant="ghost" size="icon" aria-label={closeLabel} onClick={onClose} className="size-6 -my-1 text-muted-foreground">
        <Cross2Icon className="h-3.5 w-3.5"/>
      </Button>
    </>
  );
}

/** The dot that marks a tip. */
// Lined up with the first line of the tip's text, also when the text wraps.
const TipDot = () => <span aria-hidden="true" className="mt-[0.45em] inline-block size-2 shrink-0 rounded-full bg-primary"/>;

/** ", or press Space or Enter on an image": in the text for screen readers, and on screen while the keyboard is in use. */
const KeyboardWords = () => (
  <span className="sr-only in-[body:has(:focus-visible)]:not-sr-only">, or press Space or Enter on an image</span>
);

/**
 * The first-drag tip, in the Unranked tray's hint line, right after "Drag to reorder.". While
 * the tip shows, it takes that hint's place: the class `[*:has(+&)]:hidden` hides the element
 * just before it, so nothing moves. The status region is always there (hidden while empty), so
 * screen readers read the tip once when it appears.
 */
export function FirstDragHint() {
  const {current, finish, hide} = useTips();
  const shown = current === 'first-drag';
  return (
    <span
      className={shown ? 'hide-in-zen inline-flex flex-wrap items-center gap-x-2 [*:has(+&)]:hidden' : 'sr-only'}
      data-html2canvas-ignore
    >
      <span role="status" className={shown ? 'inline-flex items-start gap-2 font-semibold text-foreground' : undefined}>
        {shown && (
          <>
            <TipDot/>
            <span className="tooltip-mouse">Drag an image into a row to rank it<KeyboardWords/>.</span>
            <span className="tooltip-touch">Hold an image, then drag it into a row<KeyboardWords/>.</span>
          </>
        )}
      </span>
      {shown && <TipButtons closeLabel="Close tip" onClose={() => finish('first-drag')} onHide={hide}/>}
    </span>
  );
}

const SHARED_LIST_TEXT = 'Someone shared this list with you. Your edits stay with you, and their list stays as they made it.';

/**
 * The shared-list tip, one line under the title. It ends with Close, Hide tips or the first
 * change. After the first change its box stays (empty) until the editor closes, so the rows do
 * not move under a drop; Close and Hide tips remove it.
 */
export function SharedListTip() {
  const {current, session, finish, hide} = useTips();
  const shown = current === 'shared-list';
  // Set once the tip showed; false again when the visitor closes it.
  const [boxKept, setBoxKept] = useState(false);
  if (shown && !boxKept) setBoxKept(true);

  const close = () => {
    setBoxKept(false);
    finish('shared-list');
  };
  const hideAll = () => {
    setBoxKept(false);
    hide();
  };
  const boxed = shown || (boxKept && session !== null && !session.stored.off);

  return (
    <div
      className={boxed
        ? cn('hide-in-zen ml-2 mt-2 flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted px-3 py-1.5 text-sm', !shown && 'invisible')
        : 'sr-only'}
      data-html2canvas-ignore
    >
      <span role="status" className={shown ? 'inline-flex items-start gap-2' : undefined}>
        {shown && <><TipDot/>{SHARED_LIST_TEXT}</>}
      </span>
      {shown && <TipButtons closeLabel="Close tip" onClose={close} onHide={hideAll}/>}
    </div>
  );
}

interface ToastTip {
  title: string;
  description: string;
  /** The toast's button, besides close and Hide tips. */
  action?: {label: string; onClick: () => void};
}

const TOAST_TIPS: Partial<Record<TipId, ToastTip>> = {
  'link-save': {
    title: "Your list lives in this page's address",
    description: 'Bookmark this page, or press Share to copy its link. Back undoes a change.',
    action: {label: 'Share', onClick: openSharePanel},
  },
  'device-images': {
    title: 'Your images stay in this browser',
    description: 'A link shares their names; a downloaded Freeze Frame shares the images too.',
  },
};

/**
 * Starts and ends the editor's tips from what happens to the list, and shows the toast tips.
 * Renders nothing itself.
 */
export function EditorTips() {
  const {tiers, title, writing, urlLength} = useTierContext();
  const {current, session, request, withdraw, finish, hide} = useTips();
  const loaded = session !== null;
  const isZenMode = useZenMode();
  // The editor started with a list from its link (urlLength is set only then).
  const [openedWithList] = useState(urlLength > 0);
  // The address the editor opened at, as Next.js renders it (window.location may still show the
  // page before during a move inside OpenTierBoy).
  const pathname = usePathname();
  const stateParam = useSearchParams().get('state');
  const [openedAt] = useState(() => ({pathname, state: stateParam}));
  const previous = useRef({tiers, title});

  // The tips end with the editor.
  useEffect(() => endTips, []);

  // Whether the editor opened with the page itself, from a link opened fresh (as from a chat
  // app), and not after a move inside OpenTierBoy: a router.push from the home page, opening a
  // file, or any other in-app move (lib/tips/tips.ts: openedFromLinkLoad).
  const openedFromLink = useRef(false);
  useEffect(() => {
    openedFromLink.current = openedFromLinkLoad({
      navigation: documentNavigation(),
      ...openedAt,
      editorOpenedBefore: documentEditors.openedBefore(),
    });
    documentEditors.markOpened();
  }, [openedAt]);

  // A friend's list: a list opened fresh from a link, before this browser made any change
  // (a list it made itself, opened again, is not someone else's).
  // Decided once, when the tips load.
  const sharedListDecided = useRef(false);
  useEffect(() => {
    if (!session || sharedListDecided.current) return;
    sharedListDecided.current = true;
    if (!openedWithList || !openedFromLink.current || session.stored.seen.includes('link-save')) return;
    request('shared-list');
  }, [session, openedWithList, request]);

  // A change this browser made: the list or title changed while its write is on the way (Back,
  // Forward and opened links change the list without a write).
  useEffect(() => {
    const before = previous.current;
    previous.current = {tiers, title};
    if (!session || !writing || (tiers === before.tiers && title === before.title)) return;
    if (hasRankedItem(tiers)) finish('first-drag');
    if (session.current === 'shared-list' || session.waiting.includes('shared-list')) finish('shared-list');
    request('link-save');
    const hadDeviceImages = deviceImageIds(before.tiers);
    if ([...deviceImageIds(tiers)].some(id => !hadDeviceImages.has(id))) request('device-images');
  }, [tiers, title, writing, session, request, finish]);

  // First drag: images in Unranked, nothing ranked yet.
  const firstDragUseful = waitsForFirstDrag(tiers);
  useEffect(() => {
    if (!loaded) return;
    if (firstDragUseful) request('first-drag');
    else withdraw('first-drag');
  }, [firstDragUseful, loaded, request, withdraw]);

  // The toast tips. A toast waits while Zen is on: it would time out unseen.
  const toastTip = current !== null && TOAST_TIPS[current] ? current : null;
  useEffect(() => {
    if (!toastTip || isZenMode) return;
    const tip = TOAST_TIPS[toastTip];
    if (!tip) return;
    const id = `tip-${toastTip}`;
    const end = () => finish(toastTip);
    toast(tip.title, {
      id,
      description: (
        <span className="flex flex-col items-start gap-1">
          <span>{tip.description}</span>
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              hide();
              toast.dismiss(id);
            }}
          >
            Hide tips
          </button>
        </span>
      ),
      action: tip.action,
      closeButton: true,
      duration: TIP_TOAST_MS,
      className: 'hide-in-zen',
      onDismiss: end,
      onAutoClose: end,
    });
  }, [toastTip, isZenMode, finish, hide]);

  // A toast whose tip ended another way (Hide tips) closes.
  const shownToast = useRef<TipId | null>(null);
  useEffect(() => {
    const before = shownToast.current;
    shownToast.current = toastTip;
    if (before && before !== toastTip) toast.dismiss(`tip-${before}`);
  }, [toastTip]);

  return null;
}
