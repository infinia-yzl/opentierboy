'use client';

import {useEffect, useLayoutEffect, useRef} from 'react';
import {usePathname, useSearchParams} from 'next/navigation';
import {pageBusy} from '@/lib/busy';

/** A page address as the router shows it: its path and query, in a fixed form. */
function addressOf(pathname: string, search: URLSearchParams): string {
  return `${pathname}?${search.toString()}`;
}

/** The address a plain left click on a link of this site, opening here, goes to; otherwise null. */
function linkTarget(event: MouseEvent): URL | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || link.hasAttribute('download')) return null;
  const url = new URL(link.href, window.location.href);
  return url.origin === window.location.origin ? url : null;
}

/**
 * Keeps the page busy while the router goes to another address (lib/busy.ts): from the event
 * that starts it, a click on a link of this site or Back and Forward (popstate), until the
 * router shows a new address. Next.js renders the new address in a transition, a task or more
 * after the event. A loading screen on the way keeps the page busy too (app/loading.tsx).
 * A link that goes nowhere ends it with the next press or key.
 */
export function NavigationBusy() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shown = addressOf(pathname, searchParams);
  const shownRef = useRef(shown);
  const pending = useRef<(() => void) | null>(null);

  // Any new address ends the wait, so it never stays on.
  useLayoutEffect(() => {
    shownRef.current = shown;
    pending.current?.();
    pending.current = null;
  }, [shown]);

  useEffect(() => {
    const finish = () => {
      pending.current?.();
      pending.current = null;
    };
    const begin = (to: URL) => {
      if (addressOf(to.pathname, to.searchParams) === shownRef.current) return;
      finish();
      pending.current = pageBusy.begin();
    };
    const onClick = (event: MouseEvent) => {
      const to = linkTarget(event);
      if (to) begin(to);
    };
    const onPopState = () => begin(new URL(window.location.href));
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', finish, true);
    document.addEventListener('keydown', finish, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerdown', finish, true);
      document.removeEventListener('keydown', finish, true);
      window.removeEventListener('popstate', onPopState);
      finish();
    };
  }, []);

  return null;
}
