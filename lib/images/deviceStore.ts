/**
 * Device images: pictures a person adds from their own device. They stay in the browser
 * (product rule 5: uploaded images never reach the server). This store keeps them in
 * IndexedDB, so they survive closing the tab (#86, #67).
 *
 * - Each image gets a stable local id (`createDeviceImageId`, 16 URL-safe characters). A
 *   v3 link refers to the image as `{d: <id>, c: <label>}`. Other people who open the link
 *   do not have the image and see a label tile instead.
 * - The store keeps the image bytes (an ArrayBuffer plus the image type), never a `blob:`
 *   URL: a `blob:` URL dies with the page that made it. ArrayBuffers also avoid old Safari
 *   bugs with Blobs in IndexedDB.
 * - The image type comes from the file's first bytes (PNG, JPEG, WebP, GIF or AVIF). The
 *   type the browser reports is ignored. SVG and every other format are refused, so the
 *   editor converts them first (lib/images/prepareImage.ts).
 * - Limits: 5 MB per image, 100 MB and 2,000 images in total by default. When a new image
 *   does not fit, the least recently used images are removed first ("evict the oldest").
 *   `put` reports the removed ids. Ids passed in `keep` (for example the images of the list
 *   on screen) are never removed. When the browser runs out of room below these limits
 *   (QuotaExceededError), `put` removes least recently used images (never those in `keep`)
 *   that free at least the new image's size, and tries once more.
 * - Without IndexedDB (server rendering, blocked storage, some private modes, a database
 *   that does not open in time) `openDeviceStore` returns an in-memory store with the same
 *   API and `persistent: false`. Its images last until the page closes.
 * - No method throws. Failures return a refusal, null, false or an empty list.
 *
 * Use it only from effects and event handlers (`useEffect`, onChange), never during
 * rendering: IndexedDB does not exist on the server, and opening it is asynchronous. This
 * module touches no browser API when it is imported.
 *
 * Safari: with Intelligent Tracking Prevention, Safari deletes all script-written storage
 * of a site, IndexedDB included, after 7 days of Safari use without a visit to that site.
 * A web app added to the home screen is exempt. Other browsers may also clear storage when
 * the disk is low, unless `navigator.storage.persist()` was granted. Device images are a
 * convenience: the link stays the only save.
 */

import {isDeviceImageId} from '@/lib/state/deviceId';
import {RASTER_IMAGE_TYPES, type RasterImageType, sniffImageType} from './imageType';

/** Image types the store accepts, detected from the file's first bytes (lib/images/imageType.ts). */
export const DEVICE_IMAGE_TYPES = RASTER_IMAGE_TYPES;
export type DeviceImageType = RasterImageType;
export {sniffImageType};

export interface DeviceStoreLimits {
  /** Largest single image, in bytes. */
  maxImageBytes: number;
  /** Largest total of all images, in bytes. */
  maxTotalBytes: number;
  /** Most images kept at once. */
  maxImages: number;
}

export const DEFAULT_DEVICE_STORE_LIMITS: Readonly<DeviceStoreLimits> = Object.freeze({
  maxImageBytes: 5 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxImages: 2_000,
});

export interface DeviceImageInfo {
  id: string;
  type: DeviceImageType;
  /** Size in bytes. */
  size: number;
  /** When the image was stored (milliseconds since 1970). */
  storedAt: number;
  /** When the image was last stored or read. Eviction removes the smallest values first. */
  usedAt: number;
}

export interface DeviceImage extends DeviceImageInfo {
  blob: Blob;
}

export type DevicePutRefusal =
  /** The value is not a Blob or File. */
  | 'not-a-blob'
  /** The file is empty. */
  | 'empty'
  /** Larger than `maxImageBytes`. */
  | 'too-large'
  /** Not a PNG, JPEG, WebP, GIF or AVIF file. */
  | 'unsupported-type'
  /** `options.id` is not a valid device image id. */
  | 'invalid-id'
  /** No room, even after removing every image that may be removed, or the browser's quota is full. */
  | 'storage-full'
  /** The file could not be read, or the database failed. */
  | 'storage-error';

export type DevicePutResult =
  | {ok: true; id: string; type: DeviceImageType; size: number; evicted: string[]}
  | {ok: false; reason: DevicePutRefusal};

export interface DevicePutOptions {
  /** Store under this id (for example when a snapshot file brings its own ids). Replaces an image with the same id. */
  id?: string;
  /** Ids that eviction must not remove, such as the images in the list on screen. */
  keep?: Iterable<string>;
}

export interface DeviceStore {
  /** True for IndexedDB (images survive closing the tab), false for the in-memory fallback. */
  readonly persistent: boolean;
  readonly limits: Readonly<DeviceStoreLimits>;
  /** Stores an image. Removes least recently used images when it does not fit. */
  put(blob: Blob, options?: DevicePutOptions): Promise<DevicePutResult>;
  /** The image with this id, or null. Marks it as used now. */
  get(id: string): Promise<DeviceImage | null>;
  /** The images with these ids that the store has, marked as used now, read in one transaction. */
  getMany(ids: readonly string[]): Promise<Map<string, DeviceImage>>;
  /** Every image's details without the bytes, most recently used first. */
  list(): Promise<DeviceImageInfo[]>;
  /** Number of images and their total size in bytes. */
  usage(): Promise<{count: number; totalBytes: number}>;
  /** Removes an image. True when it existed. */
  delete(id: string): Promise<boolean>;
  /** Removes every image. */
  clear(): Promise<void>;
  /** Closes the database. Later calls fail softly. */
  close(): void;
}

export interface OpenDeviceStoreOptions {
  /** The IndexedDB factory. Defaults to the browser's `indexedDB`; null forces the in-memory store. */
  indexedDB?: IDBFactory | null;
  limits?: Partial<DeviceStoreLimits>;
  databaseName?: string;
  /** How long to wait for the database to open before using the in-memory store. */
  openTimeoutMs?: number;
  now?: () => number;
  createId?: () => string;
}

export const DEVICE_STORE_DATABASE = 'opentierboy-device-images';
const DATABASE_VERSION = 1;
const IMAGES = 'images';
const META = 'meta';
const DEFAULT_OPEN_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------------------
// Ids

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * The shared device image id rule (amendment A40) lives in lib/state/deviceId.ts, where the v3
 * link decoder uses it: 8 to 64 URL-safe characters, never an Object.prototype member name.
 * New ids have 16 characters.
 */
export {isDeviceImageId};

/**
 * A new random id: 12 random bytes as 16 URL-safe base64 characters (96 bits). Uses
 * `crypto.getRandomValues`, which also works on plain http (unlike `crypto.randomUUID`).
 */
export function createDeviceImageId(
  fillRandom: (bytes: Uint8Array) => Uint8Array = (bytes) => globalThis.crypto.getRandomValues(bytes),
): string {
  const bytes = fillRandom(new Uint8Array(12));
  let id = '';
  for (let index = 0; index < 12; index += 3) {
    const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    id += ID_ALPHABET[(chunk >> 18) & 63] + ID_ALPHABET[(chunk >> 12) & 63] + ID_ALPHABET[(chunk >> 6) & 63] + ID_ALPHABET[chunk & 63];
  }
  return id;
}

// ---------------------------------------------------------------------------------------
// Limits and eviction

function resolveLimits(limits: Partial<DeviceStoreLimits> = {}): Readonly<DeviceStoreLimits> {
  const resolved = {...DEFAULT_DEVICE_STORE_LIMITS, ...limits};
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`Device store limit ${name} must be a positive integer.`);
  }
  if (resolved.maxImageBytes > resolved.maxTotalBytes) throw new RangeError('maxImageBytes must not exceed maxTotalBytes.');
  return Object.freeze(resolved);
}

interface EvictionEntry {
  id: string;
  size: number;
  usedAt: number;
  storedAt: number;
}

/**
 * Which images to remove so that `incoming` fits, least recently used first, or null when
 * it cannot fit. An entry with the incoming id is being replaced, so it does not count.
 */
export function planEviction(
  entries: readonly EvictionEntry[],
  incoming: {id: string; size: number},
  limits: DeviceStoreLimits,
  keep: ReadonlySet<string> = new Set(),
): string[] | null {
  if (incoming.size > limits.maxImageBytes) return null;
  const others = entries.filter((entry) => entry.id !== incoming.id);
  let total = others.reduce((sum, entry) => sum + entry.size, 0);
  let count = others.length;
  const fits = () => total + incoming.size <= limits.maxTotalBytes && count + 1 <= limits.maxImages;
  const candidates = others
    .filter((entry) => !keep.has(entry.id))
    .sort((a, b) => a.usedAt - b.usedAt || a.storedAt - b.storedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const evicted: string[] = [];
  for (const entry of candidates) {
    if (fits()) break;
    evicted.push(entry.id);
    total -= entry.size;
    count -= 1;
  }
  return fits() ? evicted : null;
}

// ---------------------------------------------------------------------------------------
// Shared checks

interface PreparedImage {
  id: string;
  type: DeviceImageType;
  data: ArrayBuffer;
  keep: Set<string>;
}

interface BlobLike {
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function isBlobLike(value: unknown): value is BlobLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as BlobLike).size === 'number' &&
    typeof (value as BlobLike).arrayBuffer === 'function'
  );
}

const isArrayBuffer = (value: unknown): value is ArrayBuffer =>
  Object.prototype.toString.call(value) === '[object ArrayBuffer]';
const isDeviceImageType = (value: unknown): value is DeviceImageType =>
  typeof value === 'string' && (DEVICE_IMAGE_TYPES as readonly string[]).includes(value);

/** Validates and reads an image before it is stored. Reads no bytes of a file that is too large. */
async function prepareImage(
  blob: unknown,
  options: DevicePutOptions,
  limits: DeviceStoreLimits,
  createId: () => string,
): Promise<PreparedImage | {ok: false; reason: DevicePutRefusal}> {
  if (!isBlobLike(blob)) return {ok: false, reason: 'not-a-blob'};
  if (options.id !== undefined && !isDeviceImageId(options.id)) return {ok: false, reason: 'invalid-id'};
  if (!Number.isFinite(blob.size) || blob.size <= 0) return {ok: false, reason: 'empty'};
  if (blob.size > limits.maxImageBytes) return {ok: false, reason: 'too-large'};
  let data: ArrayBuffer;
  try {
    data = await blob.arrayBuffer();
  } catch {
    return {ok: false, reason: 'storage-error'};
  }
  if (!isArrayBuffer(data)) return {ok: false, reason: 'storage-error'};
  if (data.byteLength === 0) return {ok: false, reason: 'empty'};
  if (data.byteLength > limits.maxImageBytes) return {ok: false, reason: 'too-large'};
  const type = sniffImageType(new Uint8Array(data, 0, Math.min(64, data.byteLength)));
  if (!type) return {ok: false, reason: 'unsupported-type'};
  let id = options.id;
  if (id === undefined) {
    try {
      id = createId();
    } catch {
      return {ok: false, reason: 'storage-error'};
    }
    if (!isDeviceImageId(id)) return {ok: false, reason: 'storage-error'};
  }
  const keep = new Set<string>();
  try {
    for (const keepId of options.keep ?? []) if (typeof keepId === 'string') keep.add(keepId);
  } catch {
    // An iterable that fails to iterate protects nothing.
  }
  return {id, type, data, keep};
}

const byMostRecentUse = (a: DeviceImageInfo, b: DeviceImageInfo) => b.usedAt - a.usedAt || b.storedAt - a.storedAt;

// ---------------------------------------------------------------------------------------
// In-memory store (fallback)

interface MemoryRecord extends DeviceImageInfo {
  data: ArrayBuffer;
}

/** A store that keeps images in memory until the page closes. Same API as the IndexedDB store. */
export function createMemoryDeviceStore(options: Omit<OpenDeviceStoreOptions, 'indexedDB' | 'databaseName' | 'openTimeoutMs'> = {}): DeviceStore {
  const limits = resolveLimits(options.limits);
  const now = options.now ?? Date.now;
  const createId = options.createId ?? (() => createDeviceImageId());
  const records = new Map<string, MemoryRecord>();
  let closed = false;
  const read = (id: unknown): DeviceImage | null => {
    const record = closed || typeof id !== 'string' ? undefined : records.get(id);
    if (!record) return null;
    record.usedAt = now();
    const {data, ...info} = record;
    return {...info, blob: new Blob([data], {type: record.type})};
  };

  return {
    persistent: false,
    limits,
    async put(blob, putOptions = {}) {
      const prepared = await prepareImage(blob, putOptions, limits, createId);
      if ('ok' in prepared) return prepared;
      if (closed) return {ok: false, reason: 'storage-error'};
      const evicted = planEviction([...records.values()], {id: prepared.id, size: prepared.data.byteLength}, limits, prepared.keep);
      if (!evicted) return {ok: false, reason: 'storage-full'};
      for (const id of evicted) records.delete(id);
      const time = now();
      const size = prepared.data.byteLength;
      records.set(prepared.id, {id: prepared.id, type: prepared.type, size, storedAt: time, usedAt: time, data: prepared.data});
      return {ok: true, id: prepared.id, type: prepared.type, size, evicted};
    },
    async get(id) {
      return read(id);
    },
    async getMany(ids) {
      const found = new Map<string, DeviceImage>();
      for (const id of ids) {
        const image = read(id);
        if (image) found.set(id, image);
      }
      return found;
    },
    async list() {
      if (closed) return [];
      return [...records.values()].map(({data: _data, ...info}) => info).sort(byMostRecentUse);
    },
    async usage() {
      if (closed) return {count: 0, totalBytes: 0};
      let totalBytes = 0;
      records.forEach((record) => (totalBytes += record.size));
      return {count: records.size, totalBytes};
    },
    async delete(id) {
      return !closed && typeof id === 'string' && records.delete(id);
    },
    async clear() {
      records.clear();
    },
    close() {
      closed = true;
      records.clear();
    },
  };
}

// ---------------------------------------------------------------------------------------
// IndexedDB store

type MetaRecord = DeviceImageInfo;

interface ImageRecord {
  id: string;
  data: ArrayBuffer;
}

function isMetaRecord(value: unknown): value is MetaRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isDeviceImageId(record.id) &&
    isDeviceImageType(record.type) &&
    Number.isSafeInteger(record.size) &&
    (record.size as number) > 0 &&
    Number.isFinite(record.storedAt) &&
    Number.isFinite(record.usedAt)
  );
}

const metaOnly = ({id, type, size, storedAt, usedAt}: MetaRecord): DeviceImageInfo => ({id, type, size, storedAt, usedAt});

interface TransactionTools<T> {
  images: IDBObjectStore;
  meta: IDBObjectStore;
  /** The value the promise resolves with when the transaction commits. */
  setResult(value: T): void;
  /** Rolls the transaction back, and resolves the promise with `value`. */
  abortWith(value: T): void;
}

/**
 * Runs one transaction. `body` queues requests and calls `setResult`; the promise resolves
 * with that result when the transaction commits, and rejects when it aborts on its own.
 */
function transact<T>(db: IDBDatabase, mode: IDBTransactionMode, body: (tools: TransactionTools<T>) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let result: T | undefined;
    let abortedOnPurpose = false;
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction([IMAGES, META], mode);
    } catch (error) {
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result as T);
    transaction.onabort = () => {
      if (abortedOnPurpose) resolve(result as T);
      else reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    };
    try {
      body({
        images: transaction.objectStore(IMAGES),
        meta: transaction.objectStore(META),
        setResult: (value) => (result = value),
        abortWith: (value) => {
          result = value;
          abortedOnPurpose = true;
          transaction.abort();
        },
      });
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // Already finished.
      }
      reject(error);
    }
  });
}

const isQuotaError = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as {name?: unknown}).name === 'QuotaExceededError';

class IndexedDbDeviceStore implements DeviceStore {
  readonly persistent = true;

  constructor(
    private readonly db: IDBDatabase,
    readonly limits: Readonly<DeviceStoreLimits>,
    private readonly now: () => number,
    private readonly createId: () => string,
  ) {}

  async put(blob: Blob, options: DevicePutOptions = {}): Promise<DevicePutResult> {
    const prepared = await prepareImage(blob, options, this.limits, this.createId);
    if ('ok' in prepared) return prepared;
    const {id, type, data, keep} = prepared;
    const size = data.byteLength;
    const first = await this.write(id, type, data, keep, false);
    // The browser ran out of room below our limits: make room for this image once, and retry.
    if (first.ok || first.reason !== 'quota') return first.ok ? first : {ok: false, reason: first.reason};
    const second = await this.write(id, type, data, keep, true);
    return second.ok ? second : {ok: false, reason: second.reason === 'quota' ? 'storage-full' : second.reason};
  }

  /**
   * One attempt to store an image. With `freeRoom`, also removes least recently used images
   * (not in `keep`) that add up to at least the image's size.
   */
  private async write(id: string, type: DeviceImageType, data: ArrayBuffer, keep: ReadonlySet<string>, freeRoom: boolean)
    : Promise<DevicePutResult | {ok: false; reason: 'quota'}> {
    const size = data.byteLength;
    try {
      return await transact<DevicePutResult | {ok: false; reason: 'quota'}>(this.db, 'readwrite', ({images, meta, setResult, abortWith}) => {
        const all = meta.getAll();
        all.onsuccess = () => {
          const entries = (all.result as unknown[]).filter(isMetaRecord);
          let limits: DeviceStoreLimits = this.limits;
          if (freeRoom) {
            const othersTotal = entries.reduce((sum, entry) => sum + (entry.id === id ? 0 : entry.size), 0);
            limits = {...this.limits, maxTotalBytes: Math.max(size, Math.min(this.limits.maxTotalBytes, othersTotal))};
          }
          const evicted = planEviction(entries, {id, size}, limits, keep);
          if (!evicted) {
            setResult({ok: false, reason: 'storage-full'});
            return;
          }
          try {
            for (const evictedId of evicted) {
              images.delete(evictedId);
              meta.delete(evictedId);
            }
            const time = this.now();
            images.put({id, data} satisfies ImageRecord);
            meta.put({id, type, size, storedAt: time, usedAt: time} satisfies MetaRecord);
            setResult({ok: true, id, type, size, evicted});
          } catch (error) {
            // Nothing is removed when the new image cannot be written.
            abortWith({ok: false, reason: isQuotaError(error) ? 'quota' : 'storage-error'});
          }
        };
      });
    } catch (error) {
      return {ok: false, reason: isQuotaError(error) ? 'quota' : 'storage-error'};
    }
  }

  async get(id: string): Promise<DeviceImage | null> {
    if (!isDeviceImageId(id)) return null;
    try {
      return await transact<DeviceImage | null>(this.db, 'readwrite', ({images, meta, setResult}) => {
        setResult(null);
        const metaRequest = meta.get(id);
        const imageRequest = images.get(id);
        imageRequest.onsuccess = () => {
          const record = metaRequest.result as unknown;
          const image = imageRequest.result as Partial<ImageRecord> | undefined;
          const valid = isMetaRecord(record) && record.id === id && image !== undefined && isArrayBuffer(image.data) && image.data.byteLength === record.size;
          if (!valid) {
            // Half-written or foreign data: remove both parts.
            if (record !== undefined || image !== undefined) {
              images.delete(id);
              meta.delete(id);
            }
            return;
          }
          const updated: MetaRecord = {...metaOnly(record), usedAt: this.now()};
          meta.put(updated);
          setResult({...updated, blob: new Blob([image.data as ArrayBuffer], {type: record.type})});
        };
      });
    } catch {
      return null;
    }
  }

  async getMany(ids: readonly string[]): Promise<Map<string, DeviceImage>> {
    const wanted = Array.from(new Set(ids.filter((id) => isDeviceImageId(id))));
    if (wanted.length === 0) return new Map();
    try {
      return await transact<Map<string, DeviceImage>>(this.db, 'readwrite', ({images, meta, setResult}) => {
        const found = new Map<string, DeviceImage>();
        setResult(found);
        const time = this.now();
        for (const id of wanted) {
          const metaRequest = meta.get(id);
          const imageRequest = images.get(id);
          imageRequest.onsuccess = () => {
            const record = metaRequest.result as unknown;
            const image = imageRequest.result as Partial<ImageRecord> | undefined;
            const valid = isMetaRecord(record) && record.id === id && image !== undefined && isArrayBuffer(image.data) && image.data.byteLength === record.size;
            if (!valid) {
              if (record !== undefined || image !== undefined) {
                images.delete(id);
                meta.delete(id);
              }
              return;
            }
            const updated: MetaRecord = {...metaOnly(record), usedAt: time};
            meta.put(updated);
            found.set(id, {...updated, blob: new Blob([image.data as ArrayBuffer], {type: record.type})});
          };
        }
      });
    } catch {
      return new Map();
    }
  }

  async list(): Promise<DeviceImageInfo[]> {
    try {
      return await transact<DeviceImageInfo[]>(this.db, 'readonly', ({meta, setResult}) => {
        const all = meta.getAll();
        all.onsuccess = () => setResult((all.result as unknown[]).filter(isMetaRecord).map(metaOnly).sort(byMostRecentUse));
      });
    } catch {
      return [];
    }
  }

  async usage(): Promise<{count: number; totalBytes: number}> {
    const images = await this.list();
    return {count: images.length, totalBytes: images.reduce((sum, image) => sum + image.size, 0)};
  }

  async delete(id: string): Promise<boolean> {
    if (typeof id !== 'string') return false;
    try {
      return await transact<boolean>(this.db, 'readwrite', ({images, meta, setResult}) => {
        const count = meta.count(id);
        count.onsuccess = () => {
          setResult(count.result > 0);
          images.delete(id);
          meta.delete(id);
        };
      });
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      await transact<void>(this.db, 'readwrite', ({images, meta}) => {
        images.clear();
        meta.clear();
      });
    } catch {
      // Nothing more to do.
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // Already closed.
    }
  }
}

function defaultIndexedDb(): IDBFactory | null {
  try {
    // Reading `indexedDB` can throw (SecurityError) when storage is blocked.
    return typeof globalThis.indexedDB === 'undefined' ? null : globalThis.indexedDB ?? null;
  } catch {
    return null;
  }
}

function openDatabase(factory: IDBFactory, name: string, timeoutMs: number): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('IndexedDB did not open in time'));
    }, timeoutMs);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, DATABASE_VERSION);
    } catch (error) {
      finish(() => reject(error));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGES)) db.createObjectStore(IMAGES, {keyPath: 'id'});
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, {keyPath: 'id'});
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        // Opened after the timeout: the in-memory store is already in use.
        db.close();
        return;
      }
      // Another tab wants to upgrade the database: let it.
      db.onversionchange = () => db.close();
      finish(() => resolve(db));
    };
    request.onerror = (event) => {
      event.preventDefault?.();
      finish(() => reject(request.error ?? new Error('IndexedDB failed to open')));
    };
    // onblocked: wait. The timeout decides.
  });
}

/**
 * Opens the device image store. Falls back to the in-memory store when IndexedDB is missing,
 * blocked or slow. Never rejects (invalid `limits` throw a RangeError: a programming error).
 */
export async function openDeviceStore(options: OpenDeviceStoreOptions = {}): Promise<DeviceStore> {
  const limits = resolveLimits(options.limits);
  const now = options.now ?? Date.now;
  const createId = options.createId ?? (() => createDeviceImageId());
  const factory = options.indexedDB === undefined ? defaultIndexedDb() : options.indexedDB;
  if (factory) {
    try {
      const db = await openDatabase(factory, options.databaseName ?? DEVICE_STORE_DATABASE, options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS);
      return new IndexedDbDeviceStore(db, limits, now, createId);
    } catch {
      // Fall through to memory.
    }
  }
  return createMemoryDeviceStore({limits, now, createId});
}

// ---------------------------------------------------------------------------------------
// Object URLs

export interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

/**
 * Keeps one object URL per device image and revokes URLs that are no longer needed, so that
 * images do not leak memory. Create one per editor and call `revokeAll` when it unmounts.
 */
export interface ObjectUrlRegistry {
  /** The object URL for this image. Created on first use; a new blob for the same id replaces (and revokes) the old URL. */
  urlFor(id: string, blob: Blob): string;
  /** The current URL for this id, if any. */
  peek(id: string): string | undefined;
  /** Revokes the URL for this id. */
  revoke(id: string): void;
  /** Revokes every URL whose id is not in `ids`, for example after the list changed. */
  retainOnly(ids: Iterable<string>): void;
  /** Revokes every URL. */
  revokeAll(): void;
  /** Number of live URLs. */
  readonly size: number;
}

export function createObjectUrlRegistry(api: ObjectUrlApi = URL): ObjectUrlRegistry {
  const urls = new Map<string, {blob: Blob; url: string}>();
  const revoke = (id: string) => {
    const entry = urls.get(id);
    if (!entry) return;
    urls.delete(id);
    try {
      api.revokeObjectURL(entry.url);
    } catch {
      // Revoking never matters enough to fail.
    }
  };
  return {
    urlFor(id, blob) {
      const entry = urls.get(id);
      if (entry && entry.blob === blob) return entry.url;
      if (entry) revoke(id);
      const url = api.createObjectURL(blob);
      urls.set(id, {blob, url});
      return url;
    },
    peek: (id) => urls.get(id)?.url,
    revoke,
    retainOnly(ids) {
      const keep = new Set(ids);
      for (const id of [...urls.keys()]) if (!keep.has(id)) revoke(id);
    },
    revokeAll() {
      for (const id of [...urls.keys()]) revoke(id);
    },
    get size() {
      return urls.size;
    },
  };
}
