/**
 * Uploads from before the device image store (#86, #67, amendment A42).
 *
 * The editor used to keep uploads in localStorage under `customItems` as `[{i, c, d}]`: the
 * item id, its label and its image. `d` was the address the browser showed: a `blob:` URL from
 * the file input (dead once the page closed, the reason for #86) or a `data:` URL. v1 and v2
 * links name those items by `i`.
 *
 * migrateLegacyUploads moves every upload with a `data:` image into the device store, under its
 * device image id: the id itself, or `legacy-<id>` when the id is too short for the device id
 * rule (deviceImageIdForUpload). The editor finds the image under that id, both for the old
 * link (which names the old id) and for the v3 link it writes (which names the device id), so
 * old links keep their images. Entries that cannot ever be moved (a dead `blob:` URL, no image,
 * a damaged entry) are dropped. Entries that failed because the browser had no room stay for
 * the next try. localStorage is read and written in try/catch.
 */
import {deviceImageIdForUpload} from '@/lib/state/deviceId';
import type {DevicePutRefusal, DeviceStore} from './deviceStore';
import type {StringStorage} from './localLists';

export const LEGACY_UPLOADS_KEY = 'customItems';
/** The largest localStorage value read: browsers allow about 5 MB per site. */
const MAX_STORED_LENGTH = 12 * 1024 * 1024;

export interface LegacyUpload {
  /** The id in old links. */
  itemId: string;
  /** The key in the device store (A42). */
  deviceId: string;
  label: string;
  /** The `data:` URL of the image. */
  dataUrl: string;
}

export interface ParsedLegacyUploads {
  uploads: LegacyUpload[];
  /** Entries that can never be moved: no image, a `blob:` URL, a damaged entry. */
  dropped: number;
}

const DATA_URL = /^data:(image\/[a-z0-9.+-]+)(?:;[a-z0-9=.+-]*)*;base64,([a-z0-9+/=\s]*)$/i;

/** The image type and bytes of a base64 `data:image/...` URL, or null. Refuses data longer than `maxBytes`. */
export function dataUrlToBytes(dataUrl: string, maxBytes: number): {type: string; bytes: Uint8Array} | null {
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(maxBytes * 4 / 3) + 256) return null;
  const match = DATA_URL.exec(dataUrl);
  if (!match) return null;
  try {
    const binary = atob(match[2].replace(/\s+/g, ''));
    if (binary.length === 0 || binary.length > maxBytes) return null;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return {type: match[1].toLowerCase(), bytes};
  } catch {
    return null;
  }
}

/** Reads the old `customItems` value. Never throws. */
export function parseLegacyUploads(raw: string | null): ParsedLegacyUploads {
  if (raw === null || raw === '') return {uploads: [], dropped: 0};
  let entries: unknown;
  try {
    entries = raw.length > MAX_STORED_LENGTH ? null : JSON.parse(raw);
  } catch {
    entries = null;
  }
  if (!Array.isArray(entries)) return {uploads: [], dropped: 1};
  const uploads: LegacyUpload[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const entry of entries) {
    const record = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {};
    const itemId = record.i;
    const dataUrl = record.d;
    const deviceId = typeof itemId === 'string' ? deviceImageIdForUpload(itemId) : null;
    if (typeof itemId !== 'string' || deviceId === null || typeof dataUrl !== 'string' || !/^data:image\//i.test(dataUrl) || seen.has(deviceId)) {
      dropped++;
      continue;
    }
    seen.add(deviceId);
    uploads.push({itemId, deviceId, label: typeof record.c === 'string' ? record.c : '', dataUrl});
  }
  return {uploads, dropped};
}

/** Turns an image into what the store accepts (re-encodes other formats), or a refusal. */
export type PrepareForStore = (blob: Blob) => Promise<{ok: true; blob: Blob} | {ok: false; reason: string}>;

export interface MigrationResult {
  /** Device ids now in the store. */
  moved: string[];
  /** Uploads left in localStorage for another try (the store was full or failed, or AVIF and HEIC). */
  kept: number;
  /** Entries removed because they can never be moved. */
  dropped: number;
}

const RETRYABLE: readonly DevicePutRefusal[] = ['storage-full', 'storage-error'];

/**
 * Moves the old uploads into the device store, then rewrites `customItems` with the uploads
 * that should be tried again (or removes it). Never throws.
 */
export async function migrateLegacyUploads(
  storage: StringStorage | null,
  store: DeviceStore,
  prepare: PrepareForStore,
): Promise<MigrationResult> {
  const result: MigrationResult = {moved: [], kept: 0, dropped: 0};
  if (!storage) return result;
  let raw: string | null;
  try {
    raw = storage.getItem(LEGACY_UPLOADS_KEY);
  } catch {
    return result;
  }
  const {uploads, dropped} = parseLegacyUploads(raw);
  result.dropped = dropped;
  if (uploads.length === 0 && dropped === 0) return result;

  const keep: {i: string; c: string; d: string}[] = [];
  for (const upload of uploads) {
    const decoded = dataUrlToBytes(upload.dataUrl, store.limits.maxImageBytes * 4);
    if (!decoded) {
      result.dropped++;
      continue;
    }
    const prepared = await prepare(new Blob([decoded.bytes as BlobPart], {type: decoded.type}));
    if (!prepared.ok) {
      // AVIF and HEIC wait in localStorage until the editor can check them: they are not lost.
      if (prepared.reason === 'avif-heic' && store.persistent) keep.push({i: upload.itemId, c: upload.label, d: upload.dataUrl});
      else result.dropped++;
      continue;
    }
    // Never make room: removing an image here could remove one just moved (or one a list shows).
    // A full store leaves the upload in localStorage for the next start.
    const stored = await store.put(prepared.blob, {id: upload.deviceId, evict: false});
    if (stored.ok) {
      result.moved.push(upload.deviceId);
    } else if (RETRYABLE.includes(stored.reason) && store.persistent) {
      keep.push({i: upload.itemId, c: upload.label, d: upload.dataUrl});
    } else {
      result.dropped++;
    }
  }
  result.kept = keep.length;
  // Without IndexedDB the store forgets the images when the page closes, so localStorage keeps them.
  if (!store.persistent) return {...result, kept: uploads.length, dropped: result.dropped};
  try {
    if (keep.length > 0) storage.setItem(LEGACY_UPLOADS_KEY, JSON.stringify(keep));
    else storage.removeItem(LEGACY_UPLOADS_KEY);
  } catch {
    // The old value stays; the next start tries again.
  }
  return result;
}
