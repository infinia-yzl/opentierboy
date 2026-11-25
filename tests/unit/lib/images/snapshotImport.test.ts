import {describe, expect, it, vi} from 'vitest';
import {createMemoryDeviceStore, type DeviceStore, type DeviceStoreLimits, isDeviceImageId} from '@/lib/images/deviceStore';
import {DEVICE_IMAGE_REFUSAL_MESSAGES} from '@/lib/images/messages';
import {
  failedSnapshotImport,
  importSnapshotImages,
  sameBytes,
  SNAPSHOT_IMAGE_SIDE,
  type SnapshotDeviceImage,
  type SnapshotImportHooks,
} from '@/lib/images/snapshotImport';
import {snapshotImageId} from '@/lib/snapshot/imageId';
import {avifWithFalseSize} from '../../support/avif';
import {drawnBytes, fakeDrawing, type FakeDrawingOptions, taggedPicture} from '../../support/fake-drawing';

const CAT_ID = 'catImage0001';
const DOG_ID = 'dogImage0002';

const image = (id: string, label: string, blob: Blob = taggedPicture(label)): SnapshotDeviceImage => ({id, label, blob});
const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
/** The id a picture gets once drawn at 512 x 256 (a 1024 x 512 taggedPicture). */
const drawnId = (tag: string) => snapshotImageId(drawnBytes(tag, 512, 256));

/**
 * Hooks like the editor's: handed-out ids are kept from eviction, and every call is recorded.
 * `keepAlso` stands for the images the list on screen shows.
 */
function editorHooks({keepAlso = [], drawing}: {keepAlso?: string[]; drawing?: FakeDrawingOptions} = {}) {
  const handedOut = new Set<string>();
  const {decode, createCanvas, drawn} = fakeDrawing(drawing);
  const handOut = vi.fn<SnapshotImportHooks['handOut']>((id) => void handedOut.add(id));
  const afterWrite = vi.fn<SnapshotImportHooks['afterWrite']>();
  const hooks: SnapshotImportHooks = {
    keep: () => [...keepAlso, ...handedOut],
    handOut,
    afterWrite,
    prepare: {decode, createCanvas},
  };
  return {hooks, handOut, afterWrite, handedOut, decode, drawn};
}

function memoryStore(limits?: Partial<DeviceStoreLimits>): DeviceStore {
  return createMemoryDeviceStore({limits});
}

describe('importSnapshotImages', () => {
  it('returns {ids: empty, errors: []} and reads nothing when the file has no images', async () => {
    const store = memoryStore();
    const get = vi.spyOn(store, 'get');
    const {hooks, handOut, afterWrite} = editorHooks();
    expect(await importSnapshotImages(store, [], hooks)).toEqual({ids: new Map(), errors: []});
    expect(get).not.toHaveBeenCalled();
    expect(handOut).not.toHaveBeenCalled();
    expect(afterWrite).not.toHaveBeenCalled();
  });

  it('writes each picture drawn again as WebP at 512 pixels under its snap- id when the store lacks it', async () => {
    const store = memoryStore();
    const {hooks, handOut, afterWrite, drawn} = editorHooks();
    const result = await importSnapshotImages(store, [image(CAT_ID, 'Cat'), image(DOG_ID, 'Dog')], hooks);

    const catId = await drawnId('Cat');
    const dogId = await drawnId('Dog');
    expect(result).toEqual({ids: new Map([[CAT_ID, catId], [DOG_ID, dogId]]), errors: []});
    expect(catId).toMatch(/^snap-[\w-]{22}$/);
    // The PNG the file holds fits the store, yet it is drawn again (alwaysReencode, A10).
    expect(drawn).toEqual([{tag: 'Cat', width: SNAPSHOT_IMAGE_SIDE, height: 256}, {tag: 'Dog', width: 512, height: 256}]);
    const stored = await store.get(catId);
    expect(stored?.type).toBe('image/webp');
    expect(await bytesOf(stored!.blob)).toEqual(drawnBytes('Cat', 512, 256));
    expect(handOut.mock.calls.map(([id, , type]) => [id, type])).toEqual([[catId, 'image/webp'], [dogId, 'image/webp']]);
    expect(afterWrite.mock.calls).toEqual([[{evicted: [], stored: [catId]}], [{evicted: [], stored: [dogId]}]]);
  });

  it('returns the snap- ids again and writes nothing when the same file opens a second time', async () => {
    const store = memoryStore();
    await importSnapshotImages(store, [image(CAT_ID, 'Cat')], editorHooks().hooks);
    const put = vi.spyOn(store, 'put');
    const {hooks, handOut, afterWrite} = editorHooks();

    const result = await importSnapshotImages(store, [image(CAT_ID, 'Cat')], hooks);
    const catId = await drawnId('Cat');
    expect(result).toEqual({ids: new Map([[CAT_ID, catId]]), errors: []});
    expect(put).not.toHaveBeenCalled();
    expect(afterWrite).not.toHaveBeenCalled();
    expect(handOut).toHaveBeenCalledWith(catId, expect.any(Blob), 'image/webp');
    expect(await store.usage()).toMatchObject({count: 1});
  });

  it('returns the file\'s own id, without drawing or writing, when the store has an image under that id', async () => {
    const store = memoryStore();
    const own = await store.put(taggedPicture('Mine'), {id: CAT_ID});
    expect(own.ok).toBe(true);
    const put = vi.spyOn(store, 'put');
    const {hooks, handOut, decode} = editorHooks();
    // Whatever the file holds is not read: here an AVIF, which opening would otherwise refuse.
    const avif = new Blob([avifWithFalseSize([100, 100], [9000, 9000])]);

    const result = await importSnapshotImages(store, [image(CAT_ID, 'Cat', avif)], hooks);
    expect(result).toEqual({ids: new Map([[CAT_ID, CAT_ID]]), errors: []});
    expect(decode).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    const [[id, blob, type]] = handOut.mock.calls;
    expect([id, type]).toEqual([CAT_ID, 'image/png']);
    expect(await bytesOf(blob)).toEqual(await bytesOf(taggedPicture('Mine')));
  });

  it('returns a new random id and writes the picture there when another picture is stored under its snap- id', async () => {
    const store = memoryStore();
    const catId = await drawnId('Cat');
    // A hash collision: a different picture already stored under the id the cat would get.
    await store.put(taggedPicture('Other'), {id: catId});
    const {hooks, afterWrite} = editorHooks();

    const result = await importSnapshotImages(store, [image(CAT_ID, 'Cat')], hooks);
    const newId = result.ids.get(CAT_ID)!;
    expect(result.errors).toEqual([]);
    expect(newId).not.toBe(catId);
    expect(newId).toHaveLength(16);
    expect(isDeviceImageId(newId)).toBe(true);
    expect(await bytesOf((await store.get(newId))!.blob)).toEqual(drawnBytes('Cat', 512, 256));
    expect(await bytesOf((await store.get(catId))!.blob)).toEqual(await bytesOf(taggedPicture('Other')));
    expect(afterWrite).toHaveBeenCalledWith({evicted: [], stored: [newId]});
  });

  it.each([
    ['empty', new Blob([]), {}],
    ['avif-heic', new Blob([avifWithFalseSize([100, 100], [100, 100])]), {}],
    ['unsupported-type', new Blob(['<html><script>alert(1)</script>'], {type: 'text/html'}), {}],
    ['too-many-pixels', taggedPicture('Huge', {width: 9000, height: 100}), {}],
    ['unreadable', taggedPicture('Broken'), {broken: ['Broken']}],
    ['too-large', taggedPicture('Big'), {bytesFor: (tag: string) => (tag === 'Big' ? 6 * 1024 * 1024 : 0)}],
  ] as const)('returns the %s message for that image, and writes the others, when drawing refuses it', async (reason, blob, drawing) => {
    const store = memoryStore();
    const {hooks, handOut} = editorHooks({drawing});
    const result = await importSnapshotImages(store, [image(CAT_ID, 'Refused', blob), image(DOG_ID, 'Dog')], hooks);
    expect(result.errors).toEqual([`Refused: ${DEVICE_IMAGE_REFUSAL_MESSAGES[reason]}`]);
    expect([...result.ids.keys()]).toEqual([DOG_ID]);
    expect(handOut).toHaveBeenCalledTimes(1);
    expect(await store.usage()).toMatchObject({count: 1});
  });

  it('returns the too-large message when the drawn picture is larger than the store\'s own image cap', async () => {
    const store = memoryStore({maxImageBytes: 1000, maxTotalBytes: 100_000});
    const {hooks} = editorHooks({drawing: {bytesFor: () => 1001}});
    const result = await importSnapshotImages(store, [image(CAT_ID, 'Cat')], hooks);
    expect(result).toEqual({ids: new Map(), errors: [`Cat: ${DEVICE_IMAGE_REFUSAL_MESSAGES['too-large']}`]});
  });

  it('writes the images it removed to make room to afterWrite when the store is full', async () => {
    const store = memoryStore({maxImages: 2});
    const old = await store.put(taggedPicture('Old'));
    await store.put(taggedPicture('Shown'), {id: 'shownImage01'});
    const {hooks, afterWrite} = editorHooks({keepAlso: ['shownImage01']});

    const result = await importSnapshotImages(store, [image(CAT_ID, 'Cat')], hooks);
    const catId = await drawnId('Cat');
    expect(result).toEqual({ids: new Map([[CAT_ID, catId]]), errors: []});
    expect(afterWrite).toHaveBeenCalledWith({evicted: [old.ok && old.id], stored: [catId]});
    expect(await store.get('shownImage01')).not.toBeNull();
  });

  it('returns the storage-full message, and removes no image the list or this file uses, when nothing else can make room', async () => {
    const store = memoryStore({maxImages: 3});
    await store.put(taggedPicture('Shown'), {id: 'shownImage01'});
    const {hooks, afterWrite} = editorHooks({keepAlso: ['shownImage01']});

    const result = await importSnapshotImages(store, [image('fileImage001', 'One'), image('fileImage002', 'Two'), image('fileImage003', 'Three')], hooks);
    expect([...result.ids.keys()]).toEqual(['fileImage001', 'fileImage002']);
    expect(result.errors).toEqual([`Three: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-full']}`]);
    // The refused write removed nothing, so afterWrite is not called for it.
    expect(afterWrite).toHaveBeenCalledTimes(2);
    expect(await store.get('shownImage01')).not.toBeNull();
    expect(await store.usage()).toMatchObject({count: 3});
  });

  it('writes the removed images to afterWrite with stored [] when the write fails after making room', async () => {
    const store = memoryStore();
    vi.spyOn(store, 'put').mockResolvedValue({ok: false, reason: 'storage-full', evicted: ['oldImage0001']});
    const {hooks, afterWrite, handOut} = editorHooks();

    const result = await importSnapshotImages(store, [image(CAT_ID, 'Cat')], hooks);
    expect(result).toEqual({ids: new Map(), errors: [`Cat: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-full']}`]});
    expect(afterWrite).toHaveBeenCalledWith({evicted: ['oldImage0001'], stored: []});
    expect(handOut).not.toHaveBeenCalled();
  });

  it('returns the store\'s own refusal message when the write fails without making room', async () => {
    const store = memoryStore();
    vi.spyOn(store, 'put').mockResolvedValue({ok: false, reason: 'storage-error'});
    const {hooks, afterWrite} = editorHooks();
    const result = await importSnapshotImages(store, [image(CAT_ID, 'Cat')], hooks);
    expect(result).toEqual({ids: new Map(), errors: [`Cat: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-error']}`]});
    expect(afterWrite).not.toHaveBeenCalled();
  });

  it('returns the storage-error message for one image, and writes the next, when the store throws for it', async () => {
    const store = memoryStore();
    const get = store.get.bind(store);
    vi.spyOn(store, 'get').mockImplementation(async (id) => {
      if (id === CAT_ID) throw new Error('The database failed.');
      return get(id);
    });
    const {hooks} = editorHooks();
    const result = await importSnapshotImages(store, [image(CAT_ID, 'Cat'), image(DOG_ID, 'Dog')], hooks);
    expect(result.errors).toEqual([`Cat: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-error']}`]);
    expect([...result.ids.keys()]).toEqual([DOG_ID]);
  });

  it('returns the storage-error message and no id for an image when handing it out throws', async () => {
    const store = memoryStore();
    const {hooks, afterWrite} = editorHooks();
    hooks.handOut = () => {
      throw new TypeError('No object URL.');
    };
    const result = await importSnapshotImages(store, [image(CAT_ID, 'Cat')], hooks);
    expect(result).toEqual({ids: new Map(), errors: [`Cat: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-error']}`]});
    // The picture was written first: opening the file again finds it.
    expect(afterWrite).toHaveBeenCalledOnce();
  });

  it('returns the unreadable message for the image when the canvas throws', async () => {
    const store = memoryStore();
    const {hooks} = editorHooks();
    hooks.prepare = {
      ...hooks.prepare,
      createCanvas: () => {
        throw new Error('No canvas.');
      },
    };
    const result = await importSnapshotImages(store, [image(CAT_ID, 'Cat')], hooks);
    // prepareImageForStore never throws: a canvas that throws makes the file unreadable.
    expect(result).toEqual({ids: new Map(), errors: [`Cat: ${DEVICE_IMAGE_REFUSAL_MESSAGES.unreadable}`]});
  });
});

describe('failedSnapshotImport', () => {
  it('returns no ids and the storage-error message for each image when nothing could be stored', () => {
    expect(failedSnapshotImport([{label: 'Cat'}, {label: 'Dog'}])).toEqual({
      ids: new Map(),
      errors: [`Cat: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-error']}`, `Dog: ${DEVICE_IMAGE_REFUSAL_MESSAGES['storage-error']}`],
    });
    expect(failedSnapshotImport([])).toEqual({ids: new Map(), errors: []});
  });
});

describe('sameBytes', () => {
  it('returns true when both files have the same bytes, whatever their types', async () => {
    expect(await sameBytes(new Blob([new Uint8Array([1, 2, 3])], {type: 'image/png'}), new Blob([new Uint8Array([1, 2, 3])]))).toBe(true);
    expect(await sameBytes(new Blob([]), new Blob([]))).toBe(true);
  });

  it('returns false when the sizes or any byte differ', async () => {
    expect(await sameBytes(new Blob([new Uint8Array([1, 2, 3])]), new Blob([new Uint8Array([1, 2])]))).toBe(false);
    expect(await sameBytes(new Blob([new Uint8Array([1, 2, 3])]), new Blob([new Uint8Array([1, 2, 4])]))).toBe(false);
  });
});
