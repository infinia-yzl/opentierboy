import {afterEach, describe, expect, it, vi} from 'vitest';
import {IDBFactory, IDBObjectStore, forceCloseDatabase} from 'fake-indexeddb';
import {
  createDeviceImageId,
  createMemoryDeviceStore,
  createObjectUrlRegistry,
  DEFAULT_DEVICE_STORE_LIMITS,
  DEVICE_STORE_DATABASE,
  type DeviceStore,
  isDeviceImageId,
  openDeviceStore,
  type OpenDeviceStoreOptions,
  planEviction,
} from '@/lib/images/deviceStore';
import {avifWithFalseSize, heicStart} from '../../support/avif';

// The smallest headers each format needs, padded to a given size.
const HEADERS = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  gif: [...'GIF89a'].map(c => c.charCodeAt(0)),
  webp: [...'RIFF\0\0\0\0WEBPVP8 '].map(c => c.charCodeAt(0)),
  avif: [0, 0, 0, 0x1c, ...'ftypavif\0\0\0\0avifmif1miaf'].map(c => (typeof c === 'number' ? c : c.charCodeAt(0))),
};

function bytes(header: number[], size = 32, fill = 7): Uint8Array {
  const out = new Uint8Array(Math.max(size, header.length)).fill(fill);
  out.set(header);
  return out;
}

function image(size = 32, kind: keyof typeof HEADERS = 'png', type = `image/${kind}`, fill = 7): Blob {
  return new Blob([bytes(HEADERS[kind], size, fill) as BlobPart], {type});
}

/** Ids that read like their order of creation: img-00000001, img-00000002... */
function sequentialIds() {
  let next = 0;
  return () => `img-${String(++next).padStart(8, '0')}`;
}

/** A clock that ticks one millisecond per call. */
function tickingClock(start = 1_000) {
  let time = start;
  return () => time++;
}

let opened: DeviceStore[] = [];

async function open(options: OpenDeviceStoreOptions = {}): Promise<DeviceStore> {
  const store = await openDeviceStore({indexedDB: new IDBFactory(), now: tickingClock(), createId: sequentialIds(), ...options});
  opened.push(store);
  return store;
}

afterEach(() => {
  for (const store of opened) store.close();
  opened = [];
  vi.restoreAllMocks();
});

function rawRecords(factory: IDBFactory, storeName: 'images' | 'meta'): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DEVICE_STORE_DATABASE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const all = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      all.onsuccess = () => {
        db.close();
        resolve(all.result);
      };
      all.onerror = () => reject(all.error);
    };
  });
}

function writeRaw(factory: IDBFactory, storeName: 'images' | 'meta', record: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DEVICE_STORE_DATABASE);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(record);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

describe('createDeviceImageId', () => {
  it('returns 16 URL-safe characters, a valid device image id, when it gets 12 random bytes', () => {
    const id = createDeviceImageId(buffer => buffer.fill(0xff));
    expect(id).toBe('________________');
    expect(createDeviceImageId(buffer => buffer.fill(0))).toBe('AAAAAAAAAAAAAAAA');
    expect(createDeviceImageId(buffer => buffer.map((_, index) => index * 21))).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const ids = new Set(Array.from({length: 1000}, () => createDeviceImageId()));
    expect(ids.size).toBe(1000);
    for (const created of ids) expect(isDeviceImageId(created)).toBe(true);
  });
});

describe('planEviction', () => {
  const limits = {maxImageBytes: 50, maxTotalBytes: 100, maxImages: 3};
  const entry = (id: string, size: number, usedAt: number, storedAt = usedAt) => ({id, size, usedAt, storedAt});

  it('returns [] when the image fits within the limits', () => {
    expect(planEviction([entry('a', 30, 1), entry('b', 30, 2)], {id: 'c', size: 40}, limits)).toEqual([]);
  });

  it('returns the least recently used ids, until the image fits, when the store is over a limit', () => {
    // 90 bytes in 3 images; the limits are 100 bytes and 3 images.
    const entries = [entry('b', 40, 2), entry('a', 30, 1), entry('c', 20, 3)];
    // One more image needs a free place: removing a (the oldest) is enough.
    expect(planEviction(entries, {id: 'd', size: 40}, limits)).toEqual(['a']);
    // 50 bytes need 60 bytes, so b goes too, although c is smaller.
    expect(planEviction(entries, {id: 'd', size: 50}, limits)).toEqual(['a', 'b']);
  });

  it('returns ids ordered by storedAt, then by id, when usedAt is equal', () => {
    expect(planEviction([entry('b', 50, 1, 2), entry('a', 50, 1, 2), entry('c', 50, 1, 1)], {id: 'd', size: 50}, limits)).toEqual(['c', 'a']);
  });

  it('returns the least recently used id when the store has maxImages images', () => {
    expect(planEviction([entry('a', 1, 1), entry('b', 1, 2), entry('c', 1, 3)], {id: 'd', size: 1}, limits)).toEqual(['a']);
  });

  it('returns [] when the image replaces a stored image with the same id', () => {
    expect(planEviction([entry('a', 50, 1), entry('b', 50, 2)], {id: 'a', size: 50}, limits)).toEqual([]);
  });

  it('returns only ids outside the set {keep}, or null when they free too little room, when {keep} has ids', () => {
    const entries = [entry('a', 50, 1), entry('b', 50, 2)];
    expect(planEviction(entries, {id: 'c', size: 50}, limits, new Set(['a']))).toEqual(['b']);
    expect(planEviction(entries, {id: 'c', size: 50}, limits, new Set(['a', 'b']))).toBeNull();
    expect(planEviction([], {id: 'c', size: 51}, limits)).toBeNull();
  });
});

describe('openDeviceStore with IndexedDB', () => {
  it('returns a persistent store with DEFAULT_DEVICE_STORE_LIMITS (5 MB, 100 MB, 2,000 images) when no limits are given', async () => {
    expect(DEFAULT_DEVICE_STORE_LIMITS).toEqual({maxImageBytes: 5 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024, maxImages: 2000});
    const store = await open();
    expect(store.persistent).toBe(true);
    expect(store.limits).toEqual(DEFAULT_DEVICE_STORE_LIMITS);
  });

  it('writes the image to IndexedDB under a 16-character id when put gets a PNG Blob', async () => {
    const store = await open({createId: undefined});
    const original = bytes(HEADERS.png, 100, 9);
    const result = await store.put(new Blob([original as BlobPart], {type: 'image/png'}));
    expect(result).toMatchObject({ok: true, type: 'image/png', size: 100, evicted: []});
    if (!result.ok) return;
    expect(isDeviceImageId(result.id)).toBe(true);
    expect(result.id).toHaveLength(16);

    const stored = await store.get(result.id);
    expect(stored).toMatchObject({id: result.id, type: 'image/png', size: 100});
    expect(stored!.blob.type).toBe('image/png');
    expect(new Uint8Array(await stored!.blob.arrayBuffer())).toEqual(original);
  });

  it('returns the stored image from get when the store is closed and opened again (tab closed)', async () => {
    const factory = new IDBFactory();
    const first = await open({indexedDB: factory});
    const result = await first.put(image(64, 'webp'));
    first.close();

    const second = await open({indexedDB: factory});
    expect(result.ok && (await second.get(result.id))).toMatchObject({type: 'image/webp', size: 64});
  });

  it('writes an ArrayBuffer and a meta record with no blob: URL to IndexedDB when put stores an image', async () => {
    const factory = new IDBFactory();
    const store = await open({indexedDB: factory});
    await store.put(image(40, 'jpeg'));
    const [imageRecord] = await rawRecords(factory, 'images');
    const [metaRecord] = await rawRecords(factory, 'meta');
    expect(Object.prototype.toString.call((imageRecord as {data: unknown}).data)).toBe('[object ArrayBuffer]');
    expect(metaRecord).toEqual({id: 'img-00000001', type: 'image/jpeg', size: 40, storedAt: 1000, usedAt: 1000});
    expect(JSON.stringify([imageRecord, metaRecord])).not.toContain('blob:');
  });

  it('returns the type sniffed from the bytes, or reason \'unsupported-type\', when the Blob reports another type', async () => {
    const store = await open();
    expect(await store.put(image(32, 'png', 'text/html'))).toMatchObject({ok: true, type: 'image/png'});
    expect(await store.put(image(32, 'gif', ''))).toMatchObject({ok: true, type: 'image/gif'});
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'], {type: 'image/svg+xml'});
    expect(await store.put(svg)).toEqual({ok: false, reason: 'unsupported-type'});
    const html = new Blob(['<!doctype html><script>alert(1)</script>'], {type: 'image/png'});
    expect(await store.put(html)).toEqual({ok: false, reason: 'unsupported-type'});
  });

  it('returns reason \'unsupported-type\' when put gets AVIF or HEIC bytes, in IndexedDB and in memory', async () => {
    for (const store of [await open(), createMemoryDeviceStore({createId: sequentialIds()})]) {
      expect(await store.put(image(64, 'avif'))).toEqual({ok: false, reason: 'unsupported-type'});
      expect(await store.put(new Blob([avifWithFalseSize([100, 100], [9000, 9000])], {type: 'image/png'}))).toEqual({ok: false, reason: 'unsupported-type'});
      expect(await store.put(new Blob([heicStart()], {type: 'image/heic'}))).toEqual({ok: false, reason: 'unsupported-type'});
      expect(await store.list()).toEqual([]);
    }
  });

  it('returns reason \'storage-full\' and evicts no image when put has evict: false and the store or browser is full', async () => {
    const store = await open({limits: {maxImageBytes: 60, maxTotalBytes: 100}});
    await store.put(image(40)); // img-00000001
    await store.put(image(40)); // img-00000002
    // Our own limits: the oldest would have to go.
    expect(await store.put(image(40), {evict: false})).toEqual({ok: false, reason: 'storage-full'});
    // The browser's quota: no room is made, and there is no retry.
    const roomy = await open({limits: {maxImageBytes: 60, maxTotalBytes: 1000}});
    await roomy.put(image(40));
    failNextWrites(1);
    expect(await roomy.put(image(40), {evict: false})).toEqual({ok: false, reason: 'storage-full'});
    expect((await store.list()).map(info => info.id).sort()).toEqual(['img-00000001', 'img-00000002']);
    expect((await roomy.list()).map(info => info.id)).toEqual(['img-00000001']);
    // Where it fits, it is stored as usual.
    expect(await roomy.put(image(40), {evict: false})).toMatchObject({ok: true, evicted: []});
    const memory = createMemoryDeviceStore({limits: {maxImageBytes: 60, maxTotalBytes: 100}, createId: sequentialIds()});
    await memory.put(image(40));
    await memory.put(image(40));
    expect(await memory.put(image(40), {evict: false})).toEqual({ok: false, reason: 'storage-full'});
    expect(await memory.usage()).toEqual({count: 2, totalBytes: 80});
  });

  it('returns reason not-a-blob, empty or too-large when put gets a non-Blob, an empty Blob or a Blob over the limit', async () => {
    const store = await open({limits: {maxImageBytes: 100, maxTotalBytes: 1000}});
    for (const value of [null, undefined, 'image.png', 42, {size: 10}, new Uint8Array(10)]) {
      expect(await store.put(value as unknown as Blob), String(value)).toEqual({ok: false, reason: 'not-a-blob'});
    }
    expect(await store.put(new Blob([]))).toEqual({ok: false, reason: 'empty'});
    expect(await store.put(image(101))).toEqual({ok: false, reason: 'too-large'});
    expect(await store.put(image(100))).toMatchObject({ok: true});
  });

  it('returns reason \'too-large\' without calling arrayBuffer when the Blob size is over maxImageBytes', async () => {
    const store = await open({limits: {maxImageBytes: 100, maxTotalBytes: 1000}});
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    expect(await store.put({size: 10 * 1024 * 1024 * 1024, arrayBuffer} as unknown as Blob)).toEqual({ok: false, reason: 'too-large'});
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('returns reason \'too-large\' or \'storage-error\' when the bytes read are over maxImageBytes or reading fails', async () => {
    const store = await open({limits: {maxImageBytes: 100, maxTotalBytes: 1000}});
    const lying = {size: 10, arrayBuffer: async () => bytes(HEADERS.png, 500).buffer};
    expect(await store.put(lying as unknown as Blob)).toEqual({ok: false, reason: 'too-large'});
    const failing = {size: 10, arrayBuffer: async () => Promise.reject(new Error('NotReadableError'))};
    expect(await store.put(failing as unknown as Blob)).toEqual({ok: false, reason: 'storage-error'});
    const notBytes = {size: 10, arrayBuffer: async () => 'bytes'};
    expect(await store.put(notBytes as unknown as Blob)).toEqual({ok: false, reason: 'storage-error'});
  });

  it('writes the image under options.id, replacing the stored image with that id, when put gets an id', async () => {
    const store = await open();
    expect(await store.put(image(40, 'png'), {id: 'snapshot-id-1'})).toMatchObject({ok: true, id: 'snapshot-id-1'});
    expect(await store.put(image(50, 'gif'), {id: 'snapshot-id-1'})).toMatchObject({ok: true, id: 'snapshot-id-1', type: 'image/gif'});
    expect(await store.usage()).toEqual({count: 1, totalBytes: 50});
    for (const id of ['short', 'has space!', '../../etc', '']) {
      expect(await store.put(image(), {id}), id).toEqual({ok: false, reason: 'invalid-id'});
    }
  });

  it('returns reason \'storage-error\' when createId returns an invalid id or throws', async () => {
    const store = await open({createId: () => 'bad id'});
    expect(await store.put(image())).toEqual({ok: false, reason: 'storage-error'});
    const throwing = await open({createId: () => {
      throw new Error('no randomness');
    }});
    expect(await throwing.put(image())).toEqual({ok: false, reason: 'storage-error'});
  });

  it('returns the least recently used id in evicted, and deletes that image, when the total reaches maxTotalBytes', async () => {
    const store = await open({limits: {maxImageBytes: 60, maxTotalBytes: 100}});
    const a = await store.put(image(40));
    const b = await store.put(image(40));
    expect(a.ok && b.ok).toBe(true);
    // Reading a marks it as used, so b is now the oldest.
    await store.get('img-00000001');
    const c = await store.put(image(40));
    expect(c).toMatchObject({ok: true, id: 'img-00000003', evicted: ['img-00000002']});
    expect(await store.get('img-00000002')).toBeNull();
    expect((await store.list()).map(info => info.id)).toEqual(['img-00000003', 'img-00000001']);
  });

  it('returns the oldest id in evicted when the store has maxImages images', async () => {
    const store = await open({limits: {maxImages: 2}});
    await store.put(image());
    await store.put(image());
    expect(await store.put(image())).toMatchObject({ok: true, evicted: ['img-00000001']});
    expect(await store.usage()).toEqual({count: 2, totalBytes: 64});
  });

  it('returns an id outside {keep} in evicted, or reason \'storage-full\' when only ids in {keep} could make room', async () => {
    const store = await open({limits: {maxImageBytes: 60, maxTotalBytes: 100}});
    await store.put(image(40));
    await store.put(image(40));
    expect(await store.put(image(40), {keep: ['img-00000001']})).toMatchObject({ok: true, evicted: ['img-00000002']});
    expect(await store.put(image(40), {keep: new Set(['img-00000001', 'img-00000003'])})).toEqual({ok: false, reason: 'storage-full'});
    expect(await store.usage()).toEqual({count: 2, totalBytes: 80});
  });

  it('returns ok for each call and 5 images in usage when put is called 20 times at once with maxImages 5', async () => {
    const store = await open({limits: {maxImageBytes: 10, maxTotalBytes: 100, maxImages: 5}});
    const results = await Promise.all(Array.from({length: 20}, () => store.put(image(10))));
    expect(results.every(result => result.ok)).toBe(true);
    expect(await store.usage()).toEqual({count: 5, totalBytes: 50});
  });

  /** A store with 2 images: img-00000001 (32 bytes), then img-00000002 (33 bytes). */
  async function storeWith2Images() {
    const store = await open();
    await store.put(image(32));
    await store.put(image(33));
    return store;
  }

  it('returns the images newest first from list when the store has 2 images', async () => {
    const store = await storeWith2Images();
    expect(await store.list()).toEqual([
      {id: 'img-00000002', type: 'image/png', size: 33, storedAt: 1001, usedAt: 1001},
      {id: 'img-00000001', type: 'image/png', size: 32, storedAt: 1000, usedAt: 1000},
    ]);
  });

  it('returns true from delete once, then false, when the id is in the store', async () => {
    const store = await storeWith2Images();
    expect(await store.delete('img-00000001')).toBe(true);
    expect(await store.delete('img-00000001')).toBe(false);
  });

  it('returns false from delete when the id is not a string', async () => {
    const store = await storeWith2Images();
    expect(await store.delete(42 as unknown as string)).toBe(false);
  });

  it('returns zero usage after clear when the store has 2 images', async () => {
    const store = await storeWith2Images();
    await store.clear();
    expect(await store.usage()).toEqual({count: 0, totalBytes: 0});
  });

  it('returns null from get when the id is unknown or invalid', async () => {
    const store = await open();
    expect(await store.get('img-00000009')).toBeNull();
    expect(await store.get('../x')).toBeNull();
    expect(await store.get(undefined as unknown as string)).toBeNull();
  });

  it('returns null from get, and deletes the records, when image and meta records do not match', async () => {
    const factory = new IDBFactory();
    const store = await open({indexedDB: factory});
    await store.put(image(32));
    // Bytes without details, details without bytes, and details that do not match the bytes.
    await writeRaw(factory, 'images', {id: 'orphan-image', data: new ArrayBuffer(8)});
    await writeRaw(factory, 'meta', {id: 'orphan-meta1', type: 'image/png', size: 8, storedAt: 1, usedAt: 1});
    await writeRaw(factory, 'meta', {id: 'img-00000001', type: 'image/png', size: 999, storedAt: 1, usedAt: 1});
    await writeRaw(factory, 'meta', {id: 'foreign-type', type: 'text/html', size: 8, storedAt: 1, usedAt: 1});
    expect(await store.get('orphan-image')).toBeNull();
    expect(await store.get('orphan-meta1')).toBeNull();
    expect(await store.get('img-00000001')).toBeNull();
    expect((await store.list()).map(info => info.id)).toEqual([]);
    expect(await rawRecords(factory, 'images')).toEqual([]);
  });

  /**
   * Makes the browser report QuotaExceededError for the next `times` writes, the way a full disk
   * fails a write request and aborts the transaction. fake-indexeddb runs each write through its
   * internal _rawObjectStore.storeRecord; the first write of each attempt fails once, and the
   * rollback after the abort uses the normal method again.
   *
   * fake-indexeddb has no quota, so it cannot reproduce what Chrome does on its own: abort the
   * whole transaction with QuotaExceededError, which also undoes the removals made in it. The
   * end-to-end test "when the browser is full, …" in tests/e2e/device-images.spec.ts covers
   * that with a real quota.
   */
  function failNextWrites(times: number) {
    const originalPut = IDBObjectStore.prototype.put;
    let remaining = times;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (remaining > 0 && this.name === 'images') {
        remaining--;
        const raw = (this as unknown as {_rawObjectStore: {storeRecord?: () => never}})._rawObjectStore;
        raw.storeRecord = () => {
          delete raw.storeRecord;
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        };
      }
      return originalPut.apply(this, args);
    });
  }

  it('returns ok with the least recently used id outside {keep} in evicted when the first write hits QuotaExceededError', async () => {
    const store = await open({limits: {maxImageBytes: 60, maxTotalBytes: 1000}});
    await store.put(image(40)); // img-00000001, the oldest
    await store.put(image(40)); // img-00000002
    await store.put(image(40)); // img-00000003
    failNextWrites(1);
    // Our limits leave room, but the browser has none. The oldest image that is not kept goes.
    expect(await store.put(image(40), {keep: ['img-00000001']})).toMatchObject({ok: true, id: 'img-00000004', evicted: ['img-00000002']});
    expect((await store.list()).map(info => info.id).sort()).toEqual(['img-00000001', 'img-00000003', 'img-00000004']);
  });

  it('returns reason \'storage-full\' with the evicted ids, which stay deleted, when the retry also hits QuotaExceededError', async () => {
    const store = await open({limits: {maxImageBytes: 60, maxTotalBytes: 100}});
    await store.put(image(40));
    await store.put(image(40));
    failNextWrites(2);
    // The oldest image was removed before the second write, and is reported with the refusal.
    expect(await store.put(image(40))).toEqual({ok: false, reason: 'storage-full', evicted: ['img-00000001']});
    expect((await store.list()).map(info => info.id)).toEqual(['img-00000002']);
  });

  it('returns reason \'storage-full\' with no retry when the quota is full and {keep} has every image', async () => {
    const store = await open({limits: {maxImageBytes: 60, maxTotalBytes: 1000}});
    await store.put(image(40));
    failNextWrites(2);
    expect(await store.put(image(40), {keep: ['img-00000001']})).toEqual({ok: false, reason: 'storage-full'});
    expect((await store.list()).map(info => info.id)).toEqual(['img-00000001']);
  });

  it('returns a Map of the found images and updates their usedAt when getMany gets several ids', async () => {
    const store = await open();
    await store.put(image(32));
    await store.put(image(33));
    const found = await store.getMany(['img-00000002', 'img-00000001', 'img-00000009', 'bad id', 'img-00000002']);
    expect([...found.keys()]).toEqual(['img-00000002', 'img-00000001']);
    expect(found.get('img-00000001')).toMatchObject({type: 'image/png', size: 32});
    expect(new Uint8Array(await found.get('img-00000002')!.blob.arrayBuffer())).toHaveLength(33);
    expect((await store.list()).every(info => info.usedAt === 1002)).toBe(true);
    expect(await store.getMany([])).toEqual(new Map());
    const memory = createMemoryDeviceStore({createId: sequentialIds()});
    await memory.put(image(10));
    expect([...(await memory.getMany(['img-00000001', 'img-00000002'])).keys()]).toEqual(['img-00000001']);
  });

  it('returns reason \'storage-full\' or \'storage-error\' when IndexedDB put throws QuotaExceededError or DataCloneError', async () => {
    const store = await open();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(await store.put(image())).toEqual({ok: false, reason: 'storage-full'});
    vi.restoreAllMocks();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Cannot clone', 'DataCloneError');
    });
    expect(await store.put(image())).toEqual({ok: false, reason: 'storage-error'});
    vi.restoreAllMocks();
    expect(await store.list()).toEqual([]);
  });

  it('returns reason \'storage-error\', null and empty results when the browser closes the database', async () => {
    const factory = new IDBFactory();
    // The connection the store opens, caught at the factory: the store keeps it private.
    let connection: IDBDatabase | undefined;
    const openConnection = factory.open.bind(factory);
    vi.spyOn(factory, 'open').mockImplementation((...args: Parameters<IDBFactory['open']>) => {
      const opening = openConnection(...args);
      opening.addEventListener('success', () => (connection = opening.result));
      return opening;
    });
    const store = await open({indexedDB: factory});
    await store.put(image());
    // The browser closes the connection, for example when the user clears site data.
    forceCloseDatabase(connection as unknown as Parameters<typeof forceCloseDatabase>[0]);
    expect(await store.put(image())).toEqual({ok: false, reason: 'storage-error'});
    expect(await store.get('img-00000001')).toBeNull();
    expect(await store.list()).toEqual([]);
    expect(await store.usage()).toEqual({count: 0, totalBytes: 0});
    expect(await store.delete('img-00000001')).toBe(false);
    await expect(store.clear()).resolves.toBeUndefined();
    expect(() => store.close()).not.toThrow();
  });

  it('returns the put image from get, getMany, list, usage and delete when they are called detached from the store (A47)', async () => {
    const store = await open();
    expect(store.persistent).toBe(true);
    const {put, get, getMany, list, usage, delete: remove} = store;
    expect(await put(image(40))).toMatchObject({ok: true, id: 'img-00000001', size: 40});
    expect((await get('img-00000001'))?.size).toBe(40);
    expect([...(await getMany(['img-00000001'])).keys()]).toEqual(['img-00000001']);
    expect((await list()).map(info => info.id)).toEqual(['img-00000001']);
    expect(await usage()).toEqual({count: 1, totalBytes: 40});
    expect(await remove('img-00000001')).toBe(true);
  });

  it('returns [] from list, without blocking the upgrade, when another tab opens a newer database version', async () => {
    const factory = new IDBFactory();
    const store = await open({indexedDB: factory});
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(DEVICE_STORE_DATABASE, 2);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked: the store did not close'));
    });
    expect(await store.list()).toEqual([]);
  });

  it('throws RangeError when a limit is zero, fractional or maxImageBytes exceeds maxTotalBytes', async () => {
    await expect(openDeviceStore({indexedDB: null, limits: {maxImageBytes: 0}})).rejects.toThrow(RangeError);
    await expect(openDeviceStore({indexedDB: null, limits: {maxTotalBytes: 1.5}})).rejects.toThrow(RangeError);
    await expect(openDeviceStore({indexedDB: null, limits: {maxImageBytes: 200, maxTotalBytes: 100}})).rejects.toThrow(RangeError);
  });
});

describe('openDeviceStore without IndexedDB', () => {
  it('returns a store with persistent false when indexedDB is null', async () => {
    const store = await open({indexedDB: null});
    expect(store.persistent).toBe(false);
    const result = await store.put(image(48, 'jpeg'));
    expect(result).toMatchObject({ok: true, id: 'img-00000001', type: 'image/jpeg', size: 48});
    expect(await store.get('img-00000001')).toMatchObject({type: 'image/jpeg', size: 48});
  });

  it('returns a store with persistent false when indexedDB.open throws, fails or passes openTimeoutMs', async () => {
    const throwing = {open: () => {
      throw new DOMException('denied', 'SecurityError');
    }} as unknown as IDBFactory;
    expect((await open({indexedDB: throwing})).persistent).toBe(false);

    const failing = {open: () => {
      const request = {error: new DOMException('broken', 'UnknownError')} as unknown as IDBOpenDBRequest;
      setTimeout(() => request.onerror?.(new Event('error')));
      return request;
    }} as unknown as IDBFactory;
    expect((await open({indexedDB: failing})).persistent).toBe(false);

    const silent = {open: () => ({}) as IDBOpenDBRequest} as unknown as IDBFactory;
    expect((await open({indexedDB: silent, openTimeoutMs: 20})).persistent).toBe(false);
  });

  it('returns a store with persistent false, and closes the database, when it opens after openTimeoutMs', async () => {
    const factory = new IDBFactory();
    const close = vi.fn();
    // Passes the real request through, but answers 50 ms late.
    const late = {open: (name: string, version: number) => {
      const request = factory.open(name, version);
      const fake = {} as IDBOpenDBRequest;
      Object.defineProperty(fake, 'result', {get: () => request.result});
      request.onupgradeneeded = () => (fake.onupgradeneeded as (() => void) | null)?.();
      request.onsuccess = () => {
        request.result.close = close;
        setTimeout(() => (fake.onsuccess as (() => void) | null)?.(), 50);
      };
      return fake;
    }} as unknown as IDBFactory;
    const store = await open({indexedDB: late, openTimeoutMs: 10});
    expect(store.persistent).toBe(false);
    await vi.waitFor(() => expect(close).toHaveBeenCalled());
  });

  it('returns a store with persistent false, and the import does not throw, when reading globalThis.indexedDB throws', async () => {
    vi.resetModules();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', {configurable: true, get: () => {
      throw new DOMException('denied', 'SecurityError');
    }});
    try {
      const fresh = await import('@/lib/images/deviceStore');
      const store = await fresh.openDeviceStore();
      expect(store.persistent).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
      else delete (globalThis as {indexedDB?: unknown}).indexedDB;
    }
  });

  it('returns a persistent store when globalThis.indexedDB exists and no indexedDB option is given', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {configurable: true, value: new IDBFactory()});
    try {
      const store = await openDeviceStore();
      opened.push(store);
      expect(store.persistent).toBe(true);
    } finally {
      delete (globalThis as {indexedDB?: unknown}).indexedDB;
    }
  });

  const memoryStore = () => createMemoryDeviceStore({limits: {maxImageBytes: 60, maxTotalBytes: 100}, now: tickingClock(), createId: sequentialIds()});

  it('returns reason too-large or unsupported-type from put when the store is in memory and the image is too big or SVG', async () => {
    const store = memoryStore();
    expect(await store.put(image(61))).toEqual({ok: false, reason: 'too-large'});
    expect(await store.put(new Blob(['<svg/>'.padEnd(40)]))).toEqual({ok: false, reason: 'unsupported-type'});
  });

  it('returns the least recently used id in evicted, or storage-full, when the in-memory store is full', async () => {
    const store = memoryStore();
    await store.put(image(40));
    await store.put(image(40));
    await store.get('img-00000001');
    expect(await store.put(image(40))).toMatchObject({ok: true, evicted: ['img-00000002']});
    expect(await store.put(image(40), {keep: ['img-00000001', 'img-00000003']})).toEqual({ok: false, reason: 'storage-full'});
    expect((await store.list()).map(info => info.id)).toEqual(['img-00000003', 'img-00000001']);
    expect(await store.usage()).toEqual({count: 2, totalBytes: 80});
  });

  it('returns true from delete and an empty list after clear when the in-memory store has images', async () => {
    const store = memoryStore();
    await store.put(image(40));
    await store.put(image(40));
    expect(await store.delete('img-00000002')).toBe(true);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('returns reason storage-error from put and null from get when the in-memory store is closed', async () => {
    const store = memoryStore();
    await store.put(image(40));
    store.close();
    expect(await store.put(image(10))).toEqual({ok: false, reason: 'storage-error'});
    expect(await store.get('img-00000001')).toBeNull();
  });
});

describe('createObjectUrlRegistry', () => {
  function fakeUrlApi() {
    let next = 0;
    const live = new Set<string>();
    return {
      live,
      createObjectURL: vi.fn<(blob: Blob) => string>(() => {
        const url = `blob:test/${++next}`;
        live.add(url);
        return url;
      }),
      revokeObjectURL: vi.fn((url: string) => {
        live.delete(url);
      }),
    };
  }

  it('returns the same URL when urlFor is called twice with one id and Blob', () => {
    const api = fakeUrlApi();
    const registry = createObjectUrlRegistry(api);
    const blob = image();
    expect(registry.urlFor('a', blob, 'image/png')).toBe('blob:test/1');
    expect(registry.urlFor('a', blob, 'image/png')).toBe('blob:test/1');
    expect(api.createObjectURL).toHaveBeenCalledTimes(1);
    expect(registry.peek('a')).toBe('blob:test/1');
    expect(registry.size).toBe(1);
  });

  it('returns a URL made from a Blob of the given type when the file has another type', async () => {
    const api = fakeUrlApi();
    const registry = createObjectUrlRegistry(api);
    // A PNG named evil.html: the browser reports text/html for it.
    const file = new Blob([new Uint8Array(await image().arrayBuffer()), '<script>alert(1)</script>'], {type: 'text/html'});
    registry.urlFor('a', file, 'image/png');
    const made = api.createObjectURL.mock.calls[0][0];
    expect(made.type).toBe('image/png');
    expect(made.size).toBe(file.size);
    // The same blob with another type gets a new URL.
    expect(registry.urlFor('a', file, 'image/webp')).toBe('blob:test/2');
    expect(() => registry.urlFor('b', file, 'text/html' as never)).toThrow(TypeError);
    expect(() => registry.urlFor('b', file, 'image/svg+xml' as never)).toThrow(TypeError);
    expect(() => registry.urlFor('b', file, 'image/avif' as never)).toThrow(TypeError);
    expect(() => registry.urlFor('b', file, 'image/heic' as never)).toThrow(TypeError);
    expect(registry.peek('b')).toBeUndefined();
  });

  it('returns a new URL and revokes the old one when an id gets a new Blob', () => {
    const api = fakeUrlApi();
    const registry = createObjectUrlRegistry(api);
    registry.urlFor('a', image(), 'image/png');
    expect(registry.urlFor('a', image(), 'image/png')).toBe('blob:test/2');
    expect([...api.live]).toEqual(['blob:test/2']);
  });

  it('returns no URL for an id when revoke, retainOnly or revokeAll has removed it', () => {
    const api = fakeUrlApi();
    const registry = createObjectUrlRegistry(api);
    for (const id of ['a', 'b', 'c', 'd']) registry.urlFor(id, image(), 'image/png');
    registry.revoke('a');
    registry.revoke('missing');
    expect(registry.peek('a')).toBeUndefined();
    registry.retainOnly(['c', 'x']);
    expect([...api.live]).toEqual(['blob:test/3']);
    registry.revokeAll();
    expect(api.live.size).toBe(0);
    expect(registry.size).toBe(0);
  });

  it('throws no error, and empties the registry, when revokeObjectURL throws during revokeAll', () => {
    const api = {createObjectURL: () => 'blob:test/1', revokeObjectURL: () => {
      throw new Error('nope');
    }};
    const registry = createObjectUrlRegistry(api);
    registry.urlFor('a', image(), 'image/png');
    expect(() => registry.revokeAll()).not.toThrow();
    expect(registry.size).toBe(0);
  });

  it('returns a blob: URL when no URL API is given', () => {
    const registry = createObjectUrlRegistry();
    const url = registry.urlFor('a', image(), 'image/png');
    expect(url).toMatch(/^blob:/);
    registry.revokeAll();
  });
});
