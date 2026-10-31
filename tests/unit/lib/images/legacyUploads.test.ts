import {describe, expect, it} from 'vitest';
import {createMemoryDeviceStore, type DeviceStore} from '@/lib/images/deviceStore';
import {dataUrlToBytes, LEGACY_UPLOADS_KEY, migrateLegacyUploads, parseLegacyUploads} from '@/lib/images/legacyUploads';
import type {StringStorage} from '@/lib/images/localLists';
import {avifWithFalseSize} from '../../support/avif';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8];
const pngDataUrl = (extra = 0) => `data:image/png;base64,${Buffer.from([...PNG, ...new Array(extra).fill(9)]).toString('base64')}`;

function memoryStorage(initial: Record<string, string> = {}): StringStorage & {data: Map<string, string>} {
  const data = new Map(Object.entries(initial));
  return {data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value), removeItem: (key) => void data.delete(key)};
}

const keepAsIs = async (blob: Blob) => ({ok: true as const, blob});

describe('dataUrlToBytes', () => {
  it('returns the type and bytes when the value is a base64 image data URL', () => {
    expect(dataUrlToBytes(pngDataUrl(), 100)).toEqual({type: 'image/png', bytes: new Uint8Array(PNG)});
    expect(dataUrlToBytes('data:image/svg+xml;charset=utf-8;base64,PHN2Zz4=', 100)).toEqual({type: 'image/svg+xml', bytes: new TextEncoder().encode('<svg>')});
  });

  it('returns null when the value is not a base64 image data URL, is damaged or is over the byte cap', () => {
    for (const value of ['data:text/html;base64,PGh0bWw+', 'data:image/png,%89PNG', 'blob:https://opentierboy.com/x', 'data:image/png;base64,!!!', 'data:image/png;base64,', '']) {
      expect(dataUrlToBytes(value, 100), value).toBeNull();
    }
    expect(dataUrlToBytes(pngDataUrl(100), 50)).toBeNull();
    expect(dataUrlToBytes(`data:image/png;base64,${'A'.repeat(10_000)}`, 100)).toBeNull();
  });
});

describe('parseLegacyUploads', () => {
  it('returns data: image uploads under device ids (legacy-<id> for short ids) and drops the rest when entries are mixed (A42)', () => {
    const raw = JSON.stringify([
      {i: 'k3j9x0a1b', c: 'Cat', d: pngDataUrl()},
      {i: 'ab3c9', c: 'Short', d: pngDataUrl()},
      {i: 'dead12345', c: 'Gone', d: 'blob:https://opentierboy.com/7d1c0a52'},
      {i: 'empty1234', c: 'Empty', d: ''},
      {i: 'image-overwatch-mau.webp', c: 'Dot', d: pngDataUrl()},
      {i: 'k3j9x0a1b', c: 'Again', d: pngDataUrl()},
      'junk',
      {c: 'no id', d: pngDataUrl()},
    ]);
    const {uploads, dropped} = parseLegacyUploads(raw);
    expect(uploads.map(({itemId, deviceId, label}) => ({itemId, deviceId, label}))).toEqual([
      {itemId: 'k3j9x0a1b', deviceId: 'k3j9x0a1b', label: 'Cat'},
      {itemId: 'ab3c9', deviceId: 'legacy-ab3c9', label: 'Short'},
    ]);
    expect(dropped).toBe(6);
  });

  it('returns {uploads: [], dropped: 1} when the value is not a JSON array', () => {
    expect(parseLegacyUploads(null)).toEqual({uploads: [], dropped: 0});
    expect(parseLegacyUploads('not json')).toEqual({uploads: [], dropped: 1});
    expect(parseLegacyUploads('{"i":"x"}')).toEqual({uploads: [], dropped: 1});
  });
});

describe('migrateLegacyUploads', () => {
  const persistentStore = (limits?: {maxImageBytes: number; maxTotalBytes: number}): DeviceStore => ({...createMemoryDeviceStore({limits}), persistent: true});

  it('writes the uploads to the store and removes customItems from localStorage when every upload fits', async () => {
    const storage = memoryStorage({[LEGACY_UPLOADS_KEY]: JSON.stringify([
      {i: 'k3j9x0a1b', c: 'Cat', d: pngDataUrl()},
      {i: 'ab3c9', c: 'Short', d: pngDataUrl(4)},
      {i: 'dead12345', c: 'Gone', d: 'blob:https://opentierboy.com/7d1c0a52'},
    ])});
    const store = persistentStore();
    expect(await migrateLegacyUploads(storage, store, keepAsIs)).toEqual({moved: ['k3j9x0a1b', 'legacy-ab3c9'], kept: 0, dropped: 1});
    expect(storage.data.has(LEGACY_UPLOADS_KEY)).toBe(false);
    expect(await store.get('legacy-ab3c9')).toMatchObject({type: 'image/png', size: PNG.length + 4});
    expect(await migrateLegacyUploads(storage, store, keepAsIs)).toEqual({moved: [], kept: 0, dropped: 0});
  });

  it('writes the uploads that did not fit back to localStorage, and drops unprepared ones, when the store is full', async () => {
    const storage = memoryStorage({[LEGACY_UPLOADS_KEY]: JSON.stringify([
      {i: 'k3j9x0a1b', c: 'Fits', d: pngDataUrl()},
      {i: 'm0n9b8v7c', c: 'Too big for the room left', d: pngDataUrl(10)},
      {i: 'q8w7e6r5t', c: 'Not an image', d: 'data:image/png;base64,PGh0bWw+'},
    ])});
    const store = persistentStore({maxImageBytes: 30, maxTotalBytes: 30});
    await store.put(new Blob([new Uint8Array([...PNG, 0, 0])]), {id: 'keep-this-one'});
    const prepare = async (blob: Blob) => (blob.size < 10 ? {ok: false as const, reason: 'unreadable'} : {ok: true as const, blob});
    const result = await migrateLegacyUploads(storage, {...store, put: (blob, options) => store.put(blob, {...options, keep: ['keep-this-one']})}, prepare);
    expect(result).toEqual({moved: [], kept: 2, dropped: 1});
    expect(JSON.parse(storage.data.get(LEGACY_UPLOADS_KEY)!).map((entry: {i: string}) => entry.i)).toEqual(['k3j9x0a1b', 'm0n9b8v7c']);
  });

  it('writes the uploads past the free room back to localStorage, and evicts no image, when the store fills up', async () => {
    const storage = memoryStorage({[LEGACY_UPLOADS_KEY]: JSON.stringify([
      {i: 'first1234', c: 'One', d: pngDataUrl(4)},
      {i: 'second123', c: 'Two', d: pngDataUrl(4)},
      {i: 'third1234', c: 'Three', d: pngDataUrl(4)},
    ])});
    // Room for two of the three uploads (20 bytes each).
    const store = persistentStore({maxImageBytes: 30, maxTotalBytes: 45});
    expect(await migrateLegacyUploads(storage, store, keepAsIs)).toEqual({moved: ['first1234', 'second123'], kept: 1, dropped: 0});
    expect((await store.list()).map((info) => info.id).sort()).toEqual(['first1234', 'second123']);
    expect(JSON.parse(storage.data.get(LEGACY_UPLOADS_KEY)!).map((entry: {i: string}) => entry.i)).toEqual(['third1234']);
  });

  it('writes an AVIF upload back to localStorage when prepare returns reason avif-heic', async () => {
    const avif = `data:image/avif;base64,${Buffer.from(avifWithFalseSize([100, 100], [9000, 9000])).toString('base64')}`;
    const storage = memoryStorage({[LEGACY_UPLOADS_KEY]: JSON.stringify([
      {i: 'k3j9x0a1b', c: 'Cat', d: pngDataUrl()},
      {i: 'a1v1f2x3y', c: 'Photo', d: avif},
    ])});
    const prepare = async (blob: Blob) => (blob.type === 'image/avif' ? {ok: false as const, reason: 'avif-heic'} : {ok: true as const, blob});
    expect(await migrateLegacyUploads(storage, persistentStore(), prepare)).toEqual({moved: ['k3j9x0a1b'], kept: 1, dropped: 0});
    expect(JSON.parse(storage.data.get(LEGACY_UPLOADS_KEY)!)).toEqual([{i: 'a1v1f2x3y', c: 'Photo', d: avif}]);
  });

  it('writes nothing to localStorage when the store is not persistent', async () => {
    const value = JSON.stringify([{i: 'k3j9x0a1b', c: 'Cat', d: pngDataUrl()}]);
    const storage = memoryStorage({[LEGACY_UPLOADS_KEY]: value});
    const store = createMemoryDeviceStore();
    expect(await migrateLegacyUploads(storage, store, keepAsIs)).toEqual({moved: ['k3j9x0a1b'], kept: 1, dropped: 0});
    expect(storage.data.get(LEGACY_UPLOADS_KEY)).toBe(value);
    expect(await store.get('k3j9x0a1b')).not.toBeNull();
  });

  it('returns {moved: [], kept: 0, dropped: 0} when storage is null or getItem throws', async () => {
    const store = persistentStore();
    expect(await migrateLegacyUploads(null, store, keepAsIs)).toEqual({moved: [], kept: 0, dropped: 0});
    const blocked: StringStorage = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(await migrateLegacyUploads(blocked, store, keepAsIs)).toEqual({moved: [], kept: 0, dropped: 0});
  });
});
