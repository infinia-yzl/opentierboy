/**
 * Small lists the editor keeps in this browser's localStorage:
 * - the image sites a visitor chose to always allow ([Always allow these sites]);
 * - the device images that the device store removed to make room, so their tiles show a label
 *   tile in place of the placeholder image.
 *
 * localStorage can be missing or throw (private modes, blocked storage, the server), and what it
 * holds may be damaged or written by someone else, so every read validates and every access is
 * wrapped in try/catch. Use these only from effects and event handlers.
 */
import {isDeviceImageId} from '@/lib/state/deviceId';
import {checkLinkImageUrl} from './linkImage';
import type {TrustedImageSite} from './trustedSites';

export const ALLOWED_IMAGE_SITES_KEY = 'allowedImageSites';
export const EVICTED_DEVICE_IMAGES_KEY = 'evictedDeviceImages';
/** Most sites kept. The oldest go first. */
export const MAX_ALLOWED_IMAGE_SITES = 200;
/** Most removed image ids kept. The oldest go first. */
export const MAX_EVICTED_DEVICE_IMAGES = 1_000;

/** The part of Storage these lists use. */
export type StringStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The browser's localStorage, or null when it is missing or blocked. */
export function browserLocalStorage(): StringStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readList(storage: StringStorage | null, key: string, isValid: (value: string) => boolean, max: number): string[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw.length > 200_000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const values = parsed.filter((value): value is string => typeof value === 'string' && isValid(value));
    return Array.from(new Set(values)).slice(-max);
  } catch {
    return [];
  }
}

function writeList(storage: StringStorage | null, key: string, values: string[]): boolean {
  if (!storage) return false;
  try {
    if (values.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}

/** A host in its normal form (lowercase punycode), as checkLinkImageUrl gives it. */
const isImageHost = (host: string) => {
  const check = checkLinkImageUrl(`https://${host}/`);
  return check.ok && check.host === host;
};

/** The image sites this browser always allows. */
export function readAllowedImageSites(storage: StringStorage | null = browserLocalStorage()): string[] {
  return readList(storage, ALLOWED_IMAGE_SITES_KEY, isImageHost, MAX_ALLOWED_IMAGE_SITES);
}

/** Adds sites to the always-allowed list. Returns the list as stored (or as it would be, if storage fails). */
export function rememberAllowedImageSites(hosts: readonly string[], storage: StringStorage | null = browserLocalStorage()): string[] {
  const current = readAllowedImageSites(storage);
  const added = hosts.filter(isImageHost);
  const next = [...current.filter((host) => !added.includes(host)), ...added].slice(-MAX_ALLOWED_IMAGE_SITES);
  writeList(storage, ALLOWED_IMAGE_SITES_KEY, next);
  return next;
}

/** Allowed sites as trusted site entries for isTrustedHost (exact hosts only). */
export function allowedSitesAsTrusted(hosts: readonly string[]): TrustedImageSite[] {
  return hosts.map((host) => ({host, subdomains: false, reason: 'Allowed in this browser'}));
}

/** The device image ids that the store removed to make room. */
export function readEvictedDeviceImages(storage: StringStorage | null = browserLocalStorage()): string[] {
  return readList(storage, EVICTED_DEVICE_IMAGES_KEY, isDeviceImageId, MAX_EVICTED_DEVICE_IMAGES);
}

/**
 * Updates the list of removed device images: adds `evicted`, and drops `stored` (an image stored
 * again under the same id). Returns the new list.
 */
export function updateEvictedDeviceImages(
  {evicted = [], stored = []}: {evicted?: readonly string[]; stored?: readonly string[]},
  storage: StringStorage | null = browserLocalStorage(),
): string[] {
  const current = readEvictedDeviceImages(storage);
  const drop = new Set([...evicted, ...stored]);
  const next = [...current.filter((id) => !drop.has(id)), ...evicted.filter(isDeviceImageId)].slice(-MAX_EVICTED_DEVICE_IMAGES);
  if (next.length !== current.length || next.some((id, index) => id !== current[index])) {
    writeList(storage, EVICTED_DEVICE_IMAGES_KEY, next);
  }
  return next;
}
