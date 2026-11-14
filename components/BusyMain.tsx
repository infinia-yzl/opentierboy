'use client';

import React, {useLayoutEffect, useRef} from 'react';
import {usePageBusy} from '@/components/useBusy';
import {STARTS_LATER_ATTRIBUTE} from '@/components/StartHold';
import {pageStart} from '@/lib/busy';

/**
 * The page's <main>, with `aria-busy` while the page is working on something (lib/busy.ts).
 * React takes over <main> before the page's own content (app/loading.tsx wraps it in Suspense),
 * so when the server's copy holds content that starts later, <main> holds the page busy until
 * that content has started (PageStarted, BusyWhileLoading).
 */
export function BusyMain({className, children}: {className?: string; children: React.ReactNode}) {
  const busy = usePageBusy();
  const main = useRef<HTMLElement>(null);
  useLayoutEffect(() => (main.current?.querySelector(`[${STARTS_LATER_ATTRIBUTE}]`) ? pageStart.hold() : undefined), []);
  return <main ref={main} className={className} aria-busy={busy || undefined}>{children}</main>;
}
