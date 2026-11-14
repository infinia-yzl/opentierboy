'use client';

import {editorStart, pageStart} from '@/lib/busy';
import {useBusyWhile, useHoldUntilStarted, useStarted} from '@/components/useBusy';

/**
 * Marks content that starts later than <main>: BusyMain finds it in the server's copy of the page
 * and holds the page busy until PageStarted runs (lib/busy.ts, pageStart). Pages without it,
 * such as Next.js's own "not found" page, start with <main>.
 */
export const STARTS_LATER_ATTRIBUTE = 'data-starts-later';

function StartsLaterMark() {
  return <span hidden {...{[STARTS_LATER_ATTRIBUTE]: ''}}/>;
}

/**
 * Says the page's own content has started in the browser (lib/busy.ts, pageStart). Every
 * page.tsx renders it (tests/unit/rules/page-started.test.ts). A passive effect: it runs after
 * the effects of the content around it.
 */
export function PageStarted() {
  useStarted(pageStart);
  return <StartsLaterMark/>;
}

/**
 * Keeps the page busy while the loading screen shows (app/loading.tsx): the next page is on its
 * way. The page that replaces it holds the page busy from the same commit until it has started.
 */
export function BusyWhileLoading() {
  useBusyWhile(true);
  return <StartsLaterMark/>;
}

/**
 * Keeps the page busy until the editor has started (lib/busy.ts, StartGate). The editor's code
 * loads on its own, so this part, which starts with the rest of the page, holds for it.
 */
export function EditorStartHold() {
  useHoldUntilStarted(editorStart);
  return null;
}
