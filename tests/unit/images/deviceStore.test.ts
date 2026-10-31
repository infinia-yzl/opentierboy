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
  sniffImageType,
} from '@/lib/images/deviceStore';
import {avifWithFalseSize, heicStart} from '../support/avif';

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

describe('device store ids', () => {
  it('creates 16 URL-safe characters from 12 random bytes', () => {
    const id = createDeviceImageId(buffer => buffer.fill(0xff));
    expect(id).toBe('________________');
    expect(createDeviceImageId(buffer => buffer.fill(0))).toBe('AAAAAAAAAAAAAAAA');
    expect(createDeviceImageId(buffer => buffer.map((_, index) => index * 21))).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const ids = new Set(Array.from({length: 1000}, () => createDeviceImageId()));
    expect(ids.size).toBe(1000);
    for (const created of ids) expect(isDeviceImageId(created)).toBe(true);
  });

  it('accepts 8 to 64 URL-safe characters as an id', () => {
    for (const id of ['abcdefgh', 'A-_09zZx', 'a'.repeat(64)]) expect(isDeviceImageId(id), id).toBe(true);
    for (const id of ['', 'abcdefg', 'a'.repeat(65), 'abcd efgh', 'abcd/efgh', 'abcd.efgh', 'blob:https://x', '__proto__', 'constructor', 'hasOwnProperty', 42, null, undefined, ['abcdefgh']]) {
      expect(isDeviceImageId(id), String(id)).toBe(false);
    }
  });
});

describe('sniffImageType', () => {
  it('detects PNG, JPEG, GIF, WebP and AVIF from the first bytes', () => {
    expect(sniffImageType(bytes(HEADERS.png))).toBe('image/png');
    expect(sniffImageType(bytes(HEADERS.jpeg))).toBe('image/jpeg');
    expect(sniffImageType(bytes(HEADERS.gif))).toBe('image/gif');
    expect(sniffImageType(bytes([...'GIF87a'].map(c => c.charCodeAt(0))))).toBe('image/gif');
    expect(sniffImageType(bytes(HEADERS.webp))).toBe('image/webp');
    expect(sniffImageType(bytes(HEADERS.avif))).toBe('image/avif');
    // AVIF listed as a compatible brand after another major brand.
    const mif1 = [0, 0, 0, 0x20, ...[...'ftypmif1\0\0\0\0mif1miafMA1Bavif'].map(c => c.charCodeAt(0))];
    expect(sniffImageType(bytes(mif1))).toBe('image/avif');
  });

  it('refuses SVG, HTML, HEIC, other files and short input', () => {
    const text = (value: string) => new TextEncoder().encode(value.padEnd(32, ' '));
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(text('<?xml version="1.0"?><svg>'))).toBeNull();
    expect(sniffImageType(text('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageType(text('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(bytes([0, 0, 0, 0x18, ...[...'ftypheic\0\0\0\0mif1heic'].map(c => c.charCodeAt(0))]))).toBeNull();
    // "avif" as the minor version field is not a brand.
    expect(sniffImageType(bytes([0, 0, 0, 0x14, ...[...'ftypmif1avifmif1'].map(c => c.charCodeAt(0))]))).toBeNull();
    expect(sniffImageType(bytes([...'RIFF\0\0\0\0WAVE'].map(c => c.charCodeAt(0))))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('planEviction', () => {
  const limits = {maxImageBytes: 50, maxTotalBytes: 100, maxImages: 3};
  const entry = (id: string, size: number, usedAt: number, storedAt = usedAt) => ({id, size, usedAt, storedAt});

  it('removes nothing when the image fits', () => {
    expect(planEviction([entry('a', 30, 1), entry('b', 30, 2)], {id: 'c', size: 40}, limits)).toEqual([]);
  });

  it('removes the least recently used images first, until the image fits', () => {
    // 90 bytes in 3 images; the limits are 100 bytes and 3 images.
    const entries = [entry('b', 40, 2), entry('a', 30, 1), entry('c', 20, 3)];
    // One more image needs a free place: removing a (the oldest) is enough.
    expect(planEviction(entries, {id: 'd', size: 40}, limits)).toEqual(['a']);
    // 50 bytes need 60 bytes, so b goes too, although c is smaller.
    expect(planEviction(entries, {id: 'd', size: 50}, limits)).toEqual(['a', 'b']);
  });

  it('breaks ties by store time, then by id', () => {
    expect(planEviction([entry('b', 50, 1, 2), entry('a', 50, 1, 2), entry('c', 50, 1, 1)], {id: 'd', size: 50}, limits)).toEqual(['c', 'a']);
  });

  it('respects the image count limit', () => {
    expect(planEviction([entry('a', 1, 1), entry('b', 1, 2), entry('c', 1, 3)], {id: 'd', size: 1}, limits)).toEqual(['a']);
  });

  it('does not count an image that is being replaced', () => {
    expect(planEviction([entry('a', 50, 1), entry('b', 50, 2)], {id: 'a', size: 50}, limits)).toEqual([]);
  });

  it('never removes kept images, and gives up when the rest is not enough', () => {
    const entries = [entry('a', 50, 1), entry('b', 50, 2)];
    expect(planEviction(entries, {id: 'c', size: 50}, limits, new Set(['a']))).toEqual(['b']);
    expect(planEviction(entries, {id: 'c', size: 50}, limits, new Set(['a', 'b']))).toBeNull();
    expect(planEviction([], {id: 'c', size: 51}, limits)).toBeNull();
  });
});

describe('openDeviceStore with IndexedDB', () => {
  it('uses the default limits: 5 MB per image, 100 MB and 2,000 images in total', async () => {
    expect(DEFAULT_DEVICE_STORE_LIMITS).toEqual({maxImageBytes: 5 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024, maxImages: 2000});
    const store = await open();
    expect(store.persistent).toBe(true);
    expect(store.limits).toEqual(DEFAULT_DEVICE_STORE_LIMITS);
  });

  it('stores an image and gives it back with a stable id', async () => {
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

  it('keeps the images after the store is closed and opened again (tab closed)', async () => {
    const factory = new IDBFactory();
    const first = await open({indexedDB: factory});
    const result = await first.put(image(64, 'webp'));
    first.close();

    const second = await open({indexedDB: factory});
    expect(result.ok && (await second.get(result.id))).toMatchObject({type: 'image/webp', size: 64});
  });

  it('stores the bytes, never a blob: URL', async () => {
    const factory = new IDBFactory();
    const store = await open({indexedDB: factory});
    await store.put(image(40, 'jpeg'));
    const [imageRecord] = await rawRecords(factory, 'images');
    const [metaRecord] = await rawRecords(factory, 'meta');
    expect(Object.prototype.toString.call((imageRecord as {data: unknown}).data)).toBe('[object ArrayBuffer]');
    expect(metaRecord).toEqual({id: 'img-00000001', type: 'image/jpeg', size: 40, storedAt: 1000, usedAt: 1000});
    expect(JSON.stringify([imageRecord, metaRecord])).not.toContain('blob:');
  });

  it('takes the type from the bytes and ignores the type the browser reports', async () => {
    const store = await open();
    expect(await store.put(image(32, 'png', 'text/html'))).toMatchObject({ok: true, type: 'image/png'});
    expect(await store.put(image(32, 'gif', ''))).toMatchObject({ok: true, type: 'image/gif'});
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'], {type: 'image/svg+xml'});
    expect(await store.put(svg)).toEqual({ok: false, reason: 'unsupported-type'});
    const html = new Blob(['<!doctype html><script>alert(1)</script>'], {type: 'image/png'});
    expect(await store.put(html)).toEqual({ok: false, reason: 'unsupported-type'});
  });

  it('refuses AVIF and HEIC itself, whatever the caller checked: their declared size can lie', async () => {
    for (const store of [await open(), createMemoryDeviceStore({createId: sequentialIds()})]) {
      expect(await store.put(image(64, 'avif'))).toEqual({ok: false, reason: 'unsupported-type'});
      expect(await store.put(new Blob([avifWithFalseSize([100, 100], [9000, 9000])], {type: 'image/png'}))).toEqual({ok: false, reason: 'unsupported-type'});
      expect(await store.put(new Blob([heicStart()], {type: 'image/heic'}))).toEqual({ok: false, reason: 'unsupported-type'});
      expect(await store.list()).toEqual([]);
    }
  });

  it('never removes an image with evict: false: a full store or browser gives storage-full', async () => {
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

  it('refuses values that are not files, empty files and files over the image limit', async () => {
    const store = await open({limits: {maxImageBytes: 100, maxTotalBytes: 1000}});
    for (const value of [null, undefined, 'image.png', 42, {size: 10}, new Uint8Array(10)]) {
      expect(await store.put(value as unknown as Blob), String(value)).toEqual({ok: false, reason: 'not-a-blob'});
    }
    expect(await store.put(new Blob([]))).toEqual({ok: false, reason: 'empty'});
    expect(await store.put(image(101))).toEqual({ok: false, reason: 'too-large'});
    expect(await store.put(image(100))).toMatchObject({ok: true});
  });

  it('does not read a file that is too large', async () => {
    const store = await open({limits: {maxImageBytes: 100, maxTotalBytes: 1000}});
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    expect(await store.put({size: 10 * 1024 * 1024 * 1024, arrayBuffer} as unknown as Blob)).toEqual({ok: false, reason: 'too-large'});
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('checks the size of the bytes it read as well as the reported size', async () => {
    const store = await open({limits: {maxImageBytes: 100, maxTotalBytes: 1000}});
    const lying = {size: 10, arrayBuffer: async () => bytes(HEADERS.png, 500).buffer};
    expect(await store.put(lying as unknown as Blob)).toEqual({ok: false, reason: 'too-large'});
    const failing = {size: 10, arrayBuffer: async () => Promise.reject(new Error('NotReadableError'))};
    expect(await store.put(failing as unknown as Blob)).toEqual({ok: false, reason: 'storage-error'});
    const notBytes = {size: 10, arrayBuffer: async () => 'bytes'};
    expect(await store.put(notBytes as unknown as Blob)).toEqual({ok: false, reason: 'storage-error'});
  });

  it('stores under a given id and replaces an image with the same id', async () => {
    const store = await open();
    expect(await store.put(image(40, 'png'), {id: 'snapshot-id-1'})).toMatchObject({ok: true, id: 'snapshot-id-1'});
    expect(await store.put(image(50, 'gif'), {id: 'snapshot-id-1'})).toMatchObject({ok: true, id: 'snapshot-id-1', type: 'image/gif'});
    expect(await store.usage()).toEqual({count: 1, totalBytes: 50});
    for (const id of ['short', 'has space!', '../../etc', '']) {
      expect(await store.put(image(), {id}), id).toEqual({ok: false, reason: 'invalid-id'});
    }
  });

  it('refuses an id from createId that is not valid', async () => {
    const store = await open({createId: () => 'bad id'});
    expect(await store.put(image())).toEqual({ok: false, reason: 'storage-error'});
    const throwing = await open({createId: () => {
      throw new Error('no randomness');
    }});
    expect(await throwing.put(image())).toEqual({ok: false, reason: 'storage-error'});
  });

  it('removes the least recently used images when the total is full', async () => {
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

  it('removes images when the count is full', async () => {
    const store = await open({limits: {maxImages: 2}});
    await store.put(image());
    await store.put(image());
    expect(await store.put(image())).toMatchObject({ok: true, evicted: ['img-00000001']});
    expect(await store.usage()).toEqual({count: 2, totalBytes: 64});
  });

  it('never removes kept images, and refuses when only kept images are left', async () => {
    const store = await open({limits: {maxImageBytes: 60, maxTotalBytes: 100}});
    await store.put(image(40));
    await store.put(image(40));
    expect(await store.put(image(40), {keep: ['img-00000001']})).toMatchObject({ok: true, evicted: ['img-00000002']});
    expect(await store.put(image(40), {keep: new Set(['img-00000001', 'img-00000003'])})).toEqual({ok: false, reason: 'storage-full'});
    expect(await store.usage()).toEqual({count: 2, totalBytes: 80});
  });

  it('handles several images stored at the same time', async () => {
    const store = await open({limits: {maxImageBytes: 10, maxTotalBytes: 100, maxImages: 5}});
    const results = await Promise.all(Array.from({length: 20}, () => store.put(image(10))));
    expect(results.every(result => result.ok)).toBe(true);
    expect(await store.usage()).toEqual({count: 5, totalBytes: 50});
  });

  it('lists, deletes and clears images', async () => {
    const store = await open();
    await store.put(image(32));
    await store.put(image(33));
    expect(await store.list()).toEqual([
      {id: 'img-00000002', type: 'image/png', size: 33, storedAt: 1001, usedAt: 1001},
      {id: 'img-00000001', type: 'image/png', size: 32, storedAt: 1000, usedAt: 1000},
    ]);
    expect(await store.delete('img-00000001')).toBe(true);
    expect(await store.delete('img-00000001')).toBe(false);
    expect(await store.delete(42 as unknown as string)).toBe(false);
    await store.clear();
    expect(await store.usage()).toEqual({count: 0, totalBytes: 0});
  });

  it('returns null for unknown and invalid ids', async () => {
    const store = await open();
    expect(await store.get('img-00000009')).toBeNull();
    expect(await store.get('../x')).toBeNull();
    expect(await store.get(undefined as unknown as string)).toBeNull();
  });

  it('ignores and removes damaged records', async () => {
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
   * end-to-end test "when the browser is full, …" in tests/e2e/custom-images.spec.ts covers
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

  it('on a full browser quota, removes least recently used images that are not kept, and tries once more', async () => {
    const store = await open({limits: {maxImageBytes: 60, maxTotalBytes: 1000}});
    await store.put(image(40)); // img-00000001, the oldest
    await store.put(image(40)); // img-00000002
    await store.put(image(40)); // img-00000003
    failNextWrites(1);
    // Our limits leave room, but the browser has none. The oldest image that is not kept goes.
    expect(await store.put(image(40), {keep: ['img-00000001']})).toMatchObject({ok: true, id: 'img-00000004', evicted: ['img-00000002']});
    expect((await store.list()).map(info => info.id).sort()).toEqual(['img-00000001', 'img-00000003', 'img-00000004']);
  });

  it('makes room in a transaction of its own, so the room stays made when the retry fails too', async () => {
    const store = await open({limits: {maxImageBytes: 60, maxTotalBytes: 100}});
    await store.put(image(40));
    await store.put(image(40));
    failNextWrites(2);
    // The oldest image was removed before the second write, and is reported with the refusal.
    expect(await store.put(image(40))).toEqual({ok: false, reason: 'storage-full', evicted: ['img-00000001']});
    expect((await store.list()).map(info => info.id)).toEqual(['img-00000002']);
  });

  it('does not retry when nothing can make room', async () => {
    const store = await open({limits: {maxImageBytes: 60, maxTotalBytes: 1000}});
    await store.put(image(40));
    failNextWrites(2);
    expect(await store.put(image(40), {keep: ['img-00000001']})).toEqual({ok: false, reason: 'storage-full'});
    expect((await store.list()).map(info => info.id)).toEqual(['img-00000001']);
  });

  it('reads many images in one go, and marks them as used', async () => {
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

  it('reports errors that the browser throws while writing', async () => {
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

  it('fails softly after it was closed, or after the browser closed the database', async () => {
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

  it('works when its functions are called on their own (a factory with closures, A47)', async () => {
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

  it('closes itself when another tab upgrades the database', async () => {
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

  it('refuses limits that make no sense', async () => {
    await expect(openDeviceStore({indexedDB: null, limits: {maxImageBytes: 0}})).rejects.toThrow(RangeError);
    await expect(openDeviceStore({indexedDB: null, limits: {maxTotalBytes: 1.5}})).rejects.toThrow(RangeError);
    await expect(openDeviceStore({indexedDB: null, limits: {maxImageBytes: 200, maxTotalBytes: 100}})).rejects.toThrow(RangeError);
  });
});

describe('openDeviceStore without IndexedDB', () => {
  it('falls back to memory when there is no IndexedDB', async () => {
    const store = await open({indexedDB: null});
    expect(store.persistent).toBe(false);
    const result = await store.put(image(48, 'jpeg'));
    expect(result).toMatchObject({ok: true, id: 'img-00000001', type: 'image/jpeg', size: 48});
    expect(await store.get('img-00000001')).toMatchObject({type: 'image/jpeg', size: 48});
  });

  it('falls back to memory when opening throws, fails or takes too long', async () => {
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

  it('closes a database that opens after the timeout', async () => {
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

  it('falls back to memory when reading indexedDB throws, and touches nothing on import', async () => {
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

  it('uses the browser indexedDB by default when there is one', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {configurable: true, value: new IDBFactory()});
    try {
      const store = await openDeviceStore();
      opened.push(store);
      expect(store.persistent).toBe(true);
    } finally {
      delete (globalThis as {indexedDB?: unknown}).indexedDB;
    }
  });

  it('applies the same limits, eviction and checks in memory', async () => {
    const store = createMemoryDeviceStore({limits: {maxImageBytes: 60, maxTotalBytes: 100}, now: tickingClock(), createId: sequentialIds()});
    expect(await store.put(image(61))).toEqual({ok: false, reason: 'too-large'});
    expect(await store.put(new Blob(['<svg/>'.padEnd(40)]))).toEqual({ok: false, reason: 'unsupported-type'});
    await store.put(image(40));
    await store.put(image(40));
    await store.get('img-00000001');
    expect(await store.put(image(40))).toMatchObject({ok: true, evicted: ['img-00000002']});
    expect(await store.put(image(40), {keep: ['img-00000001', 'img-00000003']})).toEqual({ok: false, reason: 'storage-full'});
    expect((await store.list()).map(info => info.id)).toEqual(['img-00000003', 'img-00000001']);
    expect(await store.usage()).toEqual({count: 2, totalBytes: 80});
    expect(await store.delete('img-00000003')).toBe(true);
    await store.clear();
    expect(await store.list()).toEqual([]);
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

  it('creates one URL per image and reuses it', () => {
    const api = fakeUrlApi();
    const registry = createObjectUrlRegistry(api);
    const blob = image();
    expect(registry.urlFor('a', blob, 'image/png')).toBe('blob:test/1');
    expect(registry.urlFor('a', blob, 'image/png')).toBe('blob:test/1');
    expect(api.createObjectURL).toHaveBeenCalledTimes(1);
    expect(registry.peek('a')).toBe('blob:test/1');
    expect(registry.size).toBe(1);
  });

  it('makes every URL from a blob of the given image type, whatever type the file had', async () => {
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

  it('revokes the old URL when an id gets a new blob', () => {
    const api = fakeUrlApi();
    const registry = createObjectUrlRegistry(api);
    registry.urlFor('a', image(), 'image/png');
    expect(registry.urlFor('a', image(), 'image/png')).toBe('blob:test/2');
    expect([...api.live]).toEqual(['blob:test/2']);
  });

  it('revokes URLs one by one, all but some, or all', () => {
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

  it('keeps going when revoking fails', () => {
    const api = {createObjectURL: () => 'blob:test/1', revokeObjectURL: () => {
      throw new Error('nope');
    }};
    const registry = createObjectUrlRegistry(api);
    registry.urlFor('a', image(), 'image/png');
    expect(() => registry.revokeAll()).not.toThrow();
    expect(registry.size).toBe(0);
  });

  it('uses the standard URL API by default', () => {
    const registry = createObjectUrlRegistry();
    const url = registry.urlFor('a', image(), 'image/png');
    expect(url).toMatch(/^blob:/);
    registry.revokeAll();
  });
});
