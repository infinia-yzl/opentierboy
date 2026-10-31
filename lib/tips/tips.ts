/**
 * One-time tips for first-time visitors (owner-approved onboarding proposal, 2026-10-31).
 *
 * Four tips, each shown once, when it becomes useful:
 * - 'first-drag': the editor has images in Unranked, nothing in the rows, and this browser has
 *   never ranked. Ends with the first drop into a row.
 * - 'link-save': right after the first change this browser makes (a toast).
 * - 'shared-list': the editor opens a list from a link, for the first time in this browser.
 *   Ends when closed, or with the first change.
 * - 'device-images': this browser adds its first image from the device (a toast).
 *
 * Rules:
 * - At most one tip shows at a time. A tip that becomes useful while another shows waits, and
 *   shows when that one ends (if it is still wanted).
 * - A tip that ended (closed, timed out, or its own end) is seen and never returns, until the
 *   visitor asks for the tips again (About, "Show the tips again"). "Hide tips" turns all tips
 *   off.
 * - Local storage keeps one key, `otb-tips`: the tips seen and whether tips are off. A browser
 *   with Recently viewed entries or a saved appearance setting starts with tips off: it has
 *   used OpenTierBoy before.
 *
 * Plain code: zod only, no React. The caller passes the storage; every access is wrapped in
 * try/catch, because storage can be missing, blocked or full. Stored data is checked with zod.
 */
import {z} from '@/lib/zod';
import {createRecentLinks} from '@/lib/recent/recentLinks';
import {FONT_STORAGE_KEY, GAME_COLOURS_STORAGE_KEY} from '@/lib/appearance';

/** The local storage key. */
export const TIPS_STORAGE_KEY = 'otb-tips';

/** next-themes keeps the chosen mode (Light, Dark, System) under this key. */
export const THEME_STORAGE_KEY = 'theme';

export const TIP_IDS = ['first-drag', 'link-save', 'shared-list', 'device-images'] as const;
export type TipId = typeof TIP_IDS[number];

/** The tips that are seen as soon as they show. 'first-drag' is seen only when it ends: until
 * this browser ranks, it shows again on the next visit. */
const SEEN_WHEN_SHOWN: ReadonlySet<TipId> = new Set<TipId>(['link-save', 'shared-list', 'device-images']);

/** What local storage keeps. */
export interface StoredTips {
  readonly seen: readonly TipId[];
  readonly off: boolean;
}

/** The tips of one page: what is stored, the tip on screen, and the tips waiting for it. */
export interface TipsSession {
  readonly stored: StoredTips;
  readonly current: TipId | null;
  readonly waiting: readonly TipId[];
}

export type TipsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Longer stored values are not read: the real value is under 100 characters. */
const MAX_STORED_CHARS = 1_000;

const storedSchema = z.object({
  seen: z.array(z.string().max(40)).max(20),
  off: z.boolean(),
});

/** Tips on, nothing seen: a new browser, or a visitor who asked for the tips again. */
export const TIPS_ON: StoredTips = Object.freeze({seen: Object.freeze([]), off: false});

/** Tips off, nothing seen: a browser that used OpenTierBoy before tips existed. */
const TIPS_OFF: StoredTips = Object.freeze({seen: Object.freeze([]), off: true});

const isTipId = (value: string): value is TipId => (TIP_IDS as readonly string[]).includes(value);

/** The stored tips in `raw`, or null when it is missing or not a valid value. Unknown tip ids are dropped. */
export function parseStoredTips(raw: string | null): StoredTips | null {
  if (raw === null || raw.length > MAX_STORED_CHARS) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = storedSchema.safeParse(json);
  if (!parsed.success) return null;
  return {seen: Array.from(new Set(parsed.data.seen.filter(isTipId))), off: parsed.data.off};
}

/** The value stored under TIPS_STORAGE_KEY. */
export function storedTipsText(tips: StoredTips): string {
  return JSON.stringify({seen: tips.seen, off: tips.off});
}

function getItem(storage: TipsStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** True when this browser has Recently viewed entries or a saved appearance setting. */
export function usedBefore(storage: TipsStorage): boolean {
  if ([THEME_STORAGE_KEY, FONT_STORAGE_KEY, GAME_COLOURS_STORAGE_KEY].some(key => getItem(storage, key) !== null)) return true;
  return createRecentLinks(storage).list().length > 0;
}

/**
 * The stored tips of this browser. A browser without them gets tips on, or off when it has
 * used OpenTierBoy before (usedBefore), and the choice is written at once, so it stays the same
 * on later visits. Without storage, tips are on for this page only.
 */
export function loadStoredTips(storage: TipsStorage | null): StoredTips {
  if (!storage) return TIPS_ON;
  const stored = parseStoredTips(getItem(storage, TIPS_STORAGE_KEY));
  if (stored) return stored;
  const first = usedBefore(storage) ? TIPS_OFF : TIPS_ON;
  writeStoredTips(storage, first);
  return first;
}

/** Writes the stored tips; false when the storage is missing, blocked or full. */
export function writeStoredTips(storage: TipsStorage | null, tips: StoredTips): boolean {
  if (!storage) return false;
  try {
    storage.setItem(TIPS_STORAGE_KEY, storedTipsText(tips));
    return true;
  } catch {
    return false;
  }
}

/** A page's tips, before any tip shows. */
export function startSession(stored: StoredTips): TipsSession {
  return {stored, current: null, waiting: []};
}

const withSeen = (stored: StoredTips, tip: TipId): StoredTips =>
  stored.seen.includes(tip) ? stored : {...stored, seen: [...stored.seen, tip]};

/** Shows `tip` (seen at once when SEEN_WHEN_SHOWN has it). */
function show(session: TipsSession, tip: TipId, waiting: readonly TipId[]): TipsSession {
  return {
    stored: SEEN_WHEN_SHOWN.has(tip) ? withSeen(session.stored, tip) : session.stored,
    current: tip,
    waiting,
  };
}

/** The next waiting tip shows, or none. */
function showNext(session: TipsSession): TipsSession {
  const [next, ...rest] = session.waiting;
  return next === undefined ? {...session, current: null} : show(session, next, rest);
}

/** True when the tip shows or waits. */
export function tipIsPending(session: TipsSession, tip: TipId): boolean {
  return session.current === tip || session.waiting.includes(tip);
}

/**
 * The tip became useful: it shows at once when no tip shows, else it waits. Nothing changes
 * when tips are off, the tip was seen, or it already shows or waits.
 */
export function requestTip(session: TipsSession, tip: TipId): TipsSession {
  if (session.stored.off || session.stored.seen.includes(tip) || tipIsPending(session, tip)) return session;
  if (session.current === null) return show(session, tip, session.waiting);
  return {...session, waiting: [...session.waiting, tip]};
}

/**
 * The tip is no longer useful, before it ended (for example Unranked is empty again): it leaves
 * without being seen, and the next waiting tip shows.
 */
export function withdrawTip(session: TipsSession, tip: TipId): TipsSession {
  if (!tipIsPending(session, tip)) return session;
  const waiting = session.waiting.filter(other => other !== tip);
  return session.current === tip ? showNext({...session, waiting}) : {...session, waiting};
}

/**
 * The tip ended: closed, timed out, or its own end (the first drop into a row ends
 * 'first-drag', whether it showed or not). It is seen, and the next waiting tip shows.
 */
export function finishTip(session: TipsSession, tip: TipId): TipsSession {
  const stored = withSeen(session.stored, tip);
  const waiting = session.waiting.filter(other => other !== tip);
  if (session.current === tip) return showNext({stored, current: null, waiting});
  if (stored === session.stored && waiting.length === session.waiting.length) return session;
  return {...session, stored, waiting};
}

/** "Hide tips": every tip is off, and none shows. */
export function hideTips(session: TipsSession): TipsSession {
  return {stored: {...session.stored, off: true}, current: null, waiting: []};
}

/** The page closed: no tip shows or waits. What is stored stays. */
export function endSession(session: TipsSession): TipsSession {
  if (session.current === null && session.waiting.length === 0) return session;
  return {...session, current: null, waiting: []};
}
