/**
 * "Recently viewed": a list of tier list links this browser opened, kept in local storage.
 *
 * - Each entry stores the link's path (`/rank/<set>/<tag>`), its `state` value, the list
 *   title and the time it was opened.
 * - The same link opened again moves to the top (one entry per link).
 * - Pinned links stay until they are unpinned or removed. At most `RECENT_PIN_LIMIT` links can
 *   be pinned at once.
 * - Unpinned links are capped at `RECENT_UNPINNED_LIMIT`; the oldest drop off first.
 *
 * Links are the only save (product rule 5): this list only remembers links on this device.
 * Nothing leaves the browser.
 *
 * The caller passes the storage (for example `browserLocalStorage()`). Every storage access is
 * wrapped in try/catch, because storage can be missing, blocked or full. Stored data is
 * untrusted: it is checked with zod on every read, and bad entries are dropped.
 *
 * Plain code: zod only, no React. Nothing touches browser APIs at import time.
 */
import {MAX_RANK_PATH_CHARS, normalizeRankPath} from '@/lib/rankPath';
import {z} from '@/lib/zod';

/** The local storage key. */
export const RECENT_LINKS_STORAGE_KEY = 'otb-recent-links';

/**
 * The most links that can be pinned at once. One constant, for the owner's UI review.
 * If it is lowered later, the oldest pins beyond it become ordinary recent links.
 */
export const RECENT_PIN_LIMIT = 20;

/** The most unpinned links kept. Pinned links do not count towards it. */
export const RECENT_UNPINNED_LIMIT = 30;

/**
 * Size limits per entry. A link over these limits is not recorded.
 * The 430-item test list has a state of about 12,000 characters.
 */
export const RECENT_LINK_LIMITS = Object.freeze({
  maxPathChars: MAX_RANK_PATH_CHARS,
  maxStateChars: 16_384,
  /** Longer titles are shortened to this many characters when recorded. */
  maxTitleChars: 200,
});

export interface RecentLink {
  /** The page path, for example `/rank/overwatch/tank`. */
  path: string;
  /** The `?state=` value, or '' for a link without a list state. */
  state: string;
  /** The list title, or '' when the list has none. */
  title: string;
  /** When the link was last opened (milliseconds since 1970). */
  openedAt: number;
  pinned: boolean;
  /** When the link was pinned (milliseconds since 1970). Present only when pinned. */
  pinnedAt?: number;
}

/** A link to record or to look up: its path and its `state` value. */
export interface RecentLinkRef {
  path: string;
  state?: string | null;
}

export interface RecentLinkInput extends RecentLinkRef {
  title?: string | null;
}

/** The storage methods the list uses. `window.localStorage` fits. */
export type RecentLinksStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type RecentLinksReason =
  /** The link's path or state is not valid or too long. */
  | 'invalid-link'
  /** The link is not in the list. */
  | 'not-found'
  /** `RECENT_PIN_LIMIT` links are pinned already. */
  | 'pin-limit'
  /** Storage is missing, blocked or full. */
  | 'storage-unavailable';

/** The outcome of a change, with the list as it is afterwards. */
export type RecentLinksResult =
  | {ok: true; links: readonly RecentLink[]}
  | {ok: false; reason: RecentLinksReason; links: readonly RecentLink[]};

export interface RecentLinks {
  /**
   * The links: pinned ones first (most recently pinned first), then the others (most recently
   * opened first). Returns the same array object while the stored data is unchanged, so it
   * works as a `useSyncExternalStore` snapshot.
   */
  list(): readonly RecentLink[];
  /** Adds the link at the top, or moves it there and updates its title and time. */
  record(link: RecentLinkInput): RecentLinksResult;
  pin(link: RecentLinkRef): RecentLinksResult;
  /** Unpins the link. It stays in the list as an ordinary recent link. */
  unpin(link: RecentLinkRef): RecentLinksResult;
  remove(link: RecentLinkRef): RecentLinksResult;
  /** Removes every link, pinned ones included. */
  clear(): RecentLinksResult;
}

export interface RecentLinksOptions {
  /** The clock, for tests. Defaults to `Date.now`. */
  now?: () => number;
  /** The storage key. Defaults to `RECENT_LINKS_STORAGE_KEY`. */
  key?: string;
}

const STORED_VERSION = 1;
/**
 * The most stored entries read back. The list writes at most RECENT_PIN_LIMIT +
 * RECENT_UNPINNED_LIMIT, pinned ones first; twice that leaves room for duplicates and for a
 * pin limit that was lowered later. Anything beyond is never parsed.
 */
const MAX_STORED_LINKS = 2 * (RECENT_PIN_LIMIT + RECENT_UNPINNED_LIMIT);
const EMPTY: readonly RecentLink[] = Object.freeze([]);

/** Printable ASCII without spaces: lz-string's URL-safe alphabet plus the version dot and the
 * odd trailing character of an old link. */
const STATE = /^[\x21-\x7e]*$/;
const time = z.number().int().nonnegative().max(8.64e15);

const storedLinkSchema = z.object({
  path: z.string().max(RECENT_LINK_LIMITS.maxPathChars).refine(path => normalizeRankPath(path) === path),
  state: z.string().max(RECENT_LINK_LIMITS.maxStateChars).regex(STATE),
  title: z.string().max(RECENT_LINK_LIMITS.maxTitleChars),
  openedAt: time,
  pinned: z.boolean(),
  pinnedAt: time.optional(),
});

/**
 * The browser's local storage, or null when it is missing or blocked (some privacy modes throw
 * on access). Call it in the browser only, for example inside an effect.
 */
export function browserLocalStorage(): RecentLinksStorage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

/** The key that identifies a link: its path and state, after normalising both. */
export function recentLinkKey(link: RecentLinkRef): string {
  const normal = normalizeRef(link);
  return normal ? keyOf(normal) : '';
}

/** The href to open a link from the list, with the state value URL-encoded. */
export function recentLinkHref(link: Pick<RecentLink, 'path' | 'state'>): string {
  return link.state ? `${link.path}?state=${encodeURIComponent(link.state)}` : link.path;
}

/** Creates the list on top of a storage. With `null` storage the list is empty and every change reports `storage-unavailable`. */
export function createRecentLinks(storage: RecentLinksStorage | null | undefined, options: RecentLinksOptions = {}): RecentLinks {
  const key = options.key ?? RECENT_LINKS_STORAGE_KEY;
  const now = options.now ?? Date.now;
  let cachedRaw: string | null | undefined;
  let cachedLinks: readonly RecentLink[] = EMPTY;

  function readRaw(): string | null {
    if (!storage) return null;
    try {
      const raw = storage.getItem(key);
      return typeof raw === 'string' ? raw : null;
    } catch {
      return null;
    }
  }

  function list(): readonly RecentLink[] {
    const raw = readRaw();
    if (raw === cachedRaw) return cachedLinks;
    cachedRaw = raw;
    cachedLinks = Object.freeze(parseStored(raw).map(link => Object.freeze(link)));
    return cachedLinks;
  }

  function write(links: RecentLink[], keep?: string): RecentLinksResult {
    const before = list();
    const next = sortLinks(enforceLimits(links, keep));
    if (!storage) return {ok: false, reason: 'storage-unavailable', links: before};
    try {
      storage.setItem(key, JSON.stringify({version: STORED_VERSION, links: next}));
    } catch {
      return {ok: false, reason: 'storage-unavailable', links: before};
    }
    return {ok: true, links: list()};
  }

  function change(ref: RecentLinkRef, apply: (link: RecentLink, links: RecentLink[]) => RecentLinksResult | RecentLink[] | null): RecentLinksResult {
    const links = list();
    const normal = normalizeRef(ref);
    if (!normal) return {ok: false, reason: 'invalid-link', links};
    const target = keyOf(normal);
    const index = links.findIndex(link => keyOf(link) === target);
    if (index === -1) return {ok: false, reason: 'not-found', links};
    const copy = links.map(link => ({...link}));
    const outcome = apply(copy[index], copy);
    if (outcome === null) return {ok: true, links};
    if (!Array.isArray(outcome)) return outcome;
    return write(outcome, target);
  }

  return {
    list,

    record(input) {
      const links = list();
      const normal = normalizeRef(input);
      if (!normal) return {ok: false, reason: 'invalid-link', links};
      const target = keyOf(normal);
      const existing = links.find(link => keyOf(link) === target);
      const entry: RecentLink = {
        ...normal,
        title: shortenTitle(input.title),
        openedAt: currentTime(now),
        pinned: existing?.pinned ?? false,
      };
      if (existing?.pinned) entry.pinnedAt = existing.pinnedAt;
      return write([entry, ...links.filter(link => keyOf(link) !== target)], target);
    },

    pin(ref) {
      return change(ref, (link, links) => {
        if (link.pinned) return null;
        const pinnedCount = links.filter(other => other.pinned).length;
        if (pinnedCount >= RECENT_PIN_LIMIT) return {ok: false, reason: 'pin-limit', links: list()};
        link.pinned = true;
        link.pinnedAt = currentTime(now);
        return links;
      });
    },

    unpin(ref) {
      return change(ref, (link, links) => {
        if (!link.pinned) return null;
        link.pinned = false;
        delete link.pinnedAt;
        return links;
      });
    },

    remove(ref) {
      return change(ref, (link, links) => links.filter(other => other !== link));
    },

    clear() {
      if (!storage) return {ok: false, reason: 'storage-unavailable', links: list()};
      try {
        storage.removeItem(key);
      } catch {
        return {ok: false, reason: 'storage-unavailable', links: list()};
      }
      return {ok: true, links: list()};
    },
  };
}

/** Reads stored data. Anything malformed is dropped; a bad entry does not drop the others. */
function parseStored(raw: string | null): RecentLink[] {
  if (raw === null) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return [];
  const {version, links} = json as {version?: unknown; links?: unknown};
  if (version !== STORED_VERSION || !Array.isArray(links)) return [];

  const byKey = new Map<string, RecentLink>();
  // Slice before checking entries, so a huge stored array costs no time.
  for (const candidate of links.slice(0, MAX_STORED_LINKS)) {
    const parsed = storedLinkSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const normal = normalizeRef(parsed.data);
    if (!normal) continue;
    const link: RecentLink = {...normal, title: parsed.data.title, openedAt: parsed.data.openedAt, pinned: parsed.data.pinned};
    if (link.pinned) link.pinnedAt = parsed.data.pinnedAt ?? parsed.data.openedAt;
    const key = keyOf(link);
    const seen = byKey.get(key);
    // Two entries for one link: keep the newer one, and keep it pinned if either was.
    if (!seen) {
      byKey.set(key, link);
    } else {
      const newer = link.openedAt > seen.openedAt ? link : seen;
      const pinnedOne = seen.pinned ? seen : link.pinned ? link : null;
      byKey.set(key, pinnedOne ? {...newer, pinned: true, pinnedAt: pinnedOne.pinnedAt} : newer);
    }
  }
  return sortLinks(enforceLimits(Array.from(byKey.values())));
}

/**
 * Applies both caps. Pins beyond the pin limit (only possible when the limit was lowered)
 * become ordinary links, oldest pins first. Then the oldest unpinned links drop off, except
 * `keep`, the link the user just acted on.
 */
function enforceLimits(links: RecentLink[], keep?: string): RecentLink[] {
  const pinned = links.filter(link => link.pinned).sort(byPinnedDesc);
  const extraPins = pinned.slice(RECENT_PIN_LIMIT).map(link => {
    const copy = {...link, pinned: false};
    delete copy.pinnedAt;
    return copy;
  });
  const unpinned = [...links.filter(link => !link.pinned), ...extraPins].sort(byOpenedDesc);
  const kept = unpinned.filter(link => keyOf(link) === keep);
  const others = unpinned.filter(link => keyOf(link) !== keep).slice(0, Math.max(0, RECENT_UNPINNED_LIMIT - kept.length));
  return [...pinned.slice(0, RECENT_PIN_LIMIT), ...kept, ...others];
}

function sortLinks(links: RecentLink[]): RecentLink[] {
  const pinned = links.filter(link => link.pinned).sort(byPinnedDesc);
  const unpinned = links.filter(link => !link.pinned).sort(byOpenedDesc);
  return [...pinned, ...unpinned];
}

function byPinnedDesc(a: RecentLink, b: RecentLink): number {
  return (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0) || byOpenedDesc(a, b);
}

function byOpenedDesc(a: RecentLink, b: RecentLink): number {
  if (b.openedAt !== a.openedAt) return b.openedAt - a.openedAt;
  const ka = keyOf(a);
  const kb = keyOf(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * Checks and normalises a link: the path must be a plain /rank path (lib/rankPath.ts; a trailing
 * '/' is dropped), and spaces in the state become '+' (URLSearchParams reads '+' in a link as a
 * space). Returns null when invalid.
 */
function normalizeRef(ref: RecentLinkRef | null | undefined): {path: string; state: string} | null {
  if (!ref) return null;
  const path = normalizeRankPath(ref.path);
  if (path === null) return null;
  const state = typeof ref.state === 'string' ? ref.state.replace(/ /g, '+') : '';
  if (state.length > RECENT_LINK_LIMITS.maxStateChars || !STATE.test(state)) return null;
  return {path, state};
}

function keyOf(link: {path: string; state: string}): string {
  return link.state ? `${link.path}?state=${link.state}` : link.path;
}

/** Shortens a title to `maxTitleChars` UTF-16 units, without cutting an emoji in half. */
function shortenTitle(title: string | null | undefined): string {
  if (typeof title !== 'string') return '';
  if (title.length <= RECENT_LINK_LIMITS.maxTitleChars) return title;
  const cut = title.slice(0, RECENT_LINK_LIMITS.maxTitleChars);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

function currentTime(now: () => number): number {
  const value = now();
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : Date.now();
}
