'use client';

import {useSyncExternalStore} from 'react';
import {
  browserLocalStorage,
  createRecentLinks,
  RECENT_LINKS_STORAGE_KEY,
  type RecentLink,
  type RecentLinkInput,
  type RecentLinkRef,
  type RecentLinks,
  type RecentLinksResult,
} from '@/lib/recent/recentLinks';

/**
 * "Recently viewed" for React: the list of links this browser opened (lib/recent/recentLinks.ts),
 * read with useSyncExternalStore. The server and the first render in the browser see an empty
 * list, so the page renders the same on both; the list appears right after.
 *
 * The list lives in local storage. Changes in this tab notify the listeners here; changes in
 * other tabs arrive through the `storage` event.
 */

const NO_LINKS: readonly RecentLink[] = Object.freeze([]);
const listeners = new Set<() => void>();
let recentLinks: RecentLinks | null = null;

/** Created on first use in the browser, when local storage can be read. */
function links(): RecentLinks {
  recentLinks ??= createRecentLinks(browserLocalStorage());
  return recentLinks;
}

function changed(result: RecentLinksResult): RecentLinksResult {
  listeners.forEach((listener) => listener());
  return result;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === RECENT_LINKS_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const getSnapshot = () => links().list();
const getServerSnapshot = () => NO_LINKS;

/** Records an opened link. Call it in the browser only (an effect or an event handler). */
export function recordRecentLink(link: RecentLinkInput): RecentLinksResult {
  return changed(links().record(link));
}

export interface UseRecentLinks {
  links: readonly RecentLink[];
  pin: (link: RecentLinkRef) => RecentLinksResult;
  unpin: (link: RecentLinkRef) => RecentLinksResult;
  remove: (link: RecentLinkRef) => RecentLinksResult;
}

const actions = {
  pin: (link: RecentLinkRef) => changed(links().pin(link)),
  unpin: (link: RecentLinkRef) => changed(links().unpin(link)),
  remove: (link: RecentLinkRef) => changed(links().remove(link)),
};

/** The recently viewed links (pinned first), and the changes the list offers. */
export function useRecentLinks(): UseRecentLinks {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {links: list, ...actions};
}
