import {describe, expect, it, vi} from 'vitest';
import {
  type Capture,
  MAX_SNAPSHOT_DOWNLOAD_IMAGE_BYTES,
  SNAPSHOT_DOWNLOAD_IMAGE_SIDES,
  SNAPSHOT_DOWNLOAD_MESSAGES,
  snapshotDownloadFile,
  snapshotDownloadImages,
} from '@/lib/images/snapshotDownload';
import {readSnapshotFile, SNAPSHOT_PAYLOAD_LIMITS} from '@/lib/snapshot';
import {MAX_SNAPSHOT_LINK_CHARS, snapshotOpenedLinkLength} from '@/lib/snapshot/open';
import {decodeState, encodeState, type EncodableState} from '@/lib/state';
import {drawnBytes, fakeDrawing, type FakeDrawingOptions, taggedPicture} from '../../support/fake-drawing';
import {dataUrlOf} from '../../support/image-headers';
import {chunk, decodePng, insertBeforeIend, makePng} from '../../support/png-helpers';

const CAT = 'catImage0001';
const DOG = 'dogImage0002';
const FOX = 'foxImage0003';
const MiB = 1024 * 1024;

const LIST: EncodableState = {
  title: 'My Pets!',
  rowTemplate: '3rows',
  labelPosition: 'top',
  showLabels: true,
  tiers: [
    {id: 'S', name: 'S', items: [{kind: 'device', id: CAT, content: 'Cat'}, {id: 'image-overwatch-ana.webp'}]},
    {id: 'A', name: 'A', items: [{kind: 'link', id: 'https://i.imgur.com/a.png', url: 'https://i.imgur.com/a.png', content: 'Link'}]},
    {id: 'B', name: 'B', items: [{kind: 'device', id: DOG, content: 'Dog'}, {kind: 'device', id: CAT, content: 'Cat again'}]},
    {id: 'unranked', name: '', items: []},
  ],
};
const STATE = encodeState(LIST, {format: 3});

const pictureOf = (bytes: Uint8Array) => new Blob([new Uint8Array(bytes)], {type: 'image/png'});
const capture = (overrides: Partial<Capture> = {}): Capture => ({
  picture: pictureOf(makePng(40, 30)),
  state: STATE,
  path: '/rank/overwatch/tank/',
  title: 'My Pets!',
  ...overrides,
});

/** The device image store, as Download reads it: the images it has, by id. */
function storeWith(images: Record<string, Blob>) {
  return vi.fn(async (ids: string[]) => new Map(ids.filter((id) => id in images).map((id) => [id, images[id]] as const)));
}

/** The webp data URL the fake canvas writes for a 1024 x 512 picture drawn at `side`. */
const drawnDataUrl = (tag: string, side = 512, bytes = 0) => dataUrlOf('image/webp', drawnBytes(tag, side, side / 2, bytes));

async function download(capturing: Capture, images: Record<string, Blob>, drawing?: FakeDrawingOptions) {
  const {decode, createCanvas, drawn} = fakeDrawing(drawing);
  const readDeviceImages = storeWith(images);
  const result = await snapshotDownloadFile(capturing, {readDeviceImages, prepare: {decode, createCanvas}});
  return {result, readDeviceImages, drawn};
}

async function payloadOf(file: Blob) {
  const read = await readSnapshotFile(await file.arrayBuffer());
  if (!read.ok) throw new Error(read.reason);
  return read.payload;
}

/** Seeded random text, so every run builds the same list. */
function randomText(seed: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let state = seed;
  return (length: number) => Array.from({length}, () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return alphabet[state >>> 26];
  }).join('');
}

/**
 * A link within MAX_SNAPSHOT_LINK_CHARS whose 10 device images, once they get the longer ids of
 * another browser, take it past the cap: random filler items (which compress badly) are added
 * until the link is just under the cap.
 */
function nearCapLink(): {state: string; ids: string[]} {
  const text = randomText(11);
  const ids = Array.from({length: 10}, () => text(16));
  const filler: {id: string; content: string}[] = [];
  for (;;) {
    const state = encodeState({
      ...LIST,
      tiers: [
        {id: 'S', name: 'S', items: ids.map((id, index) => ({kind: 'device' as const, id, content: `Image ${index}`}))},
        {id: 'A', name: 'A', items: filler},
        {id: 'unranked', name: '', items: []},
      ],
    }, {format: 3});
    if (state.length > MAX_SNAPSHOT_LINK_CHARS) throw new Error('No link found just under the cap.');
    if (snapshotOpenedLinkLength(decodeState(state)!, new Set(ids)) > MAX_SNAPSHOT_LINK_CHARS) return {state, ids};
    filler.push({id: `x-${text(14)}`, content: text(12)});
  }
}

describe('snapshotDownloadFile', () => {
  it('returns a PNG with the share link, the path and each device image at 512 when the list has device images', async () => {
    const {result, readDeviceImages, drawn} = await download(capture(), {[CAT]: taggedPicture('Cat'), [DOG]: taggedPicture('Dog')});
    expect(result).toMatchObject({ok: true, fileName: 'my-pets.png'});
    if (!result.ok) return;
    expect(result.file.type).toBe('image/png');
    // The picture is the one captured, with the list added to it.
    expect(decodePng(new Uint8Array(await result.file.arrayBuffer()))).toMatchObject({width: 40, height: 30});
    // Each device image once, in list order: the cat's second item is the same image.
    expect(readDeviceImages).toHaveBeenCalledExactlyOnceWith([CAT, DOG]);
    expect(drawn).toEqual([{tag: 'Cat', width: 512, height: 256}, {tag: 'Dog', width: 512, height: 256}]);
    expect(await payloadOf(result.file)).toEqual({
      version: 1,
      state: STATE,
      path: '/rank/overwatch/tank',
      images: [{id: CAT, label: 'Cat', dataUrl: drawnDataUrl('Cat')}, {id: DOG, label: 'Dog', dataUrl: drawnDataUrl('Dog')}],
    });
  });

  it('returns a file without the images the store lacks or the browser cannot draw when some images are missing or broken', async () => {
    const state = encodeState({
      ...LIST,
      tiers: [{id: 'S', name: 'S', items: [CAT, DOG, FOX].map((id) => ({kind: 'device' as const, id, content: id.slice(0, 3)}))}, {id: 'unranked', name: '', items: []}],
    }, {format: 3});
    const {result} = await download(capture({state}), {[DOG]: taggedPicture('Dog'), [FOX]: taggedPicture('Fox')}, {broken: ['Dog']});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = await payloadOf(result.file);
    expect(payload.state).toBe(state);
    expect(payload.images).toEqual([{id: FOX, label: 'fox', dataUrl: drawnDataUrl('Fox')}]);
  });

  it('returns a file without images, after reading no image, when the list has no device images', async () => {
    const state = encodeState({...LIST, tiers: [{id: 'S', name: 'S', items: [{id: 'image-overwatch-ana.webp'}]}, {id: 'unranked', name: '', items: []}]}, {format: 3});
    const {result, readDeviceImages} = await download(capture({state}), {});
    expect(readDeviceImages).toHaveBeenCalledWith([]);
    expect(result.ok && (await payloadOf(result.file)).images).toEqual([]);
  });

  it('returns a file without a path when the editor page is not a /rank path', async () => {
    for (const path of ['/about', 'https://example.com/rank/x', '/rank/../about', '']) {
      const {result} = await download(capture({path}), {});
      expect(result.ok && (await payloadOf(result.file)).path, path).toBeUndefined();
    }
  });

  it('returns the file name tier-list.png when the title has no letters or digits', async () => {
    const {result} = await download(capture({title: '★ ★'}), {});
    expect(result).toMatchObject({ok: true, fileName: 'tier-list.png'});
  });

  it('returns images drawn again at 256 pixels when at 512 they pass the payload\'s total cap', async () => {
    const tags = ['A', 'B', 'C', 'D', 'E'];
    const ids = tags.map((tag) => `image${tag}000001`);
    const state = encodeState({
      ...LIST,
      tiers: [{id: 'S', name: 'S', items: ids.map((id, index) => ({kind: 'device' as const, id, content: tags[index]}))}, {id: 'unranked', name: '', items: []}],
    }, {format: 3});
    // 1.5 MB at 512 (about 2 million data URL characters each, 10 million together); small at 256.
    const bytesFor = (_tag: string, side: number) => (side === 512 ? 1_500_000 : 1000);
    const {result, drawn} = await download(capture({state}), Object.fromEntries(ids.map((id, index) => [id, taggedPicture(tags[index])])), {bytesFor});
    expect(SNAPSHOT_DOWNLOAD_IMAGE_SIDES).toEqual([512, 256]);
    // At 512 the fifth image passes the cap; then every image is drawn again at 256.
    expect(drawn.map(({tag, width}) => `${tag}${width}`)).toEqual(['A512', 'B512', 'C512', 'D512', 'E512', 'A256', 'B256', 'C256', 'D256', 'E256']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await payloadOf(result.file)).images.map((image) => image.dataUrl)).toEqual(tags.map((tag) => drawnDataUrl(tag, 256, 1000)));
  });

  it('returns reason \'too-large\' when the images pass the payload\'s total cap at 256 pixels too', async () => {
    const tags = ['A', 'B', 'C', 'D', 'E', 'F'];
    const ids = tags.map((tag) => `image${tag}000001`);
    const state = encodeState({
      ...LIST,
      tiers: [{id: 'S', name: 'S', items: ids.map((id, index) => ({kind: 'device' as const, id, content: tags[index]}))}, {id: 'unranked', name: '', items: []}],
    }, {format: 3});
    const {result} = await download(capture({state}), Object.fromEntries(ids.map((id, index) => [id, taggedPicture(tags[index])])), {bytesFor: () => 1_500_000});
    expect(result).toEqual({ok: false, reason: 'too-large', fileName: 'my-pets.png'});
  });

  it('returns reason \'too-large\', without reading the picture or the store, when the share link is over 13,000 characters', async () => {
    const picture = pictureOf(makePng(4, 3));
    const arrayBuffer = vi.spyOn(picture, 'arrayBuffer');
    const {result, readDeviceImages} = await download(capture({picture, state: `3.${'A'.repeat(MAX_SNAPSHOT_LINK_CHARS)}`}), {});
    expect(result).toEqual({ok: false, reason: 'too-large', fileName: 'my-pets.png'});
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(readDeviceImages).not.toHaveBeenCalled();
  });

  it('returns reason \'too-large\' when the share link does not decode', async () => {
    const {result} = await download(capture({state: 'not a link'}), {});
    expect(result).toEqual({ok: false, reason: 'too-large', fileName: 'my-pets.png'});
  });

  it('returns reason \'too-large\' when the link would pass 13,000 characters once its images get the ids of another browser', async () => {
    const {state, ids} = nearCapLink();
    expect(state.length).toBeLessThanOrEqual(MAX_SNAPSHOT_LINK_CHARS);
    const all = Object.fromEntries(ids.map((id, index) => [id, taggedPicture(`Image ${index}`)]));
    expect((await download(capture({state}), all)).result).toEqual({ok: false, reason: 'too-large', fileName: 'my-pets.png'});
    // Images the store lacks keep their ids when the file opens, so the same link fits without them.
    const {result} = await download(capture({state}), {});
    expect(result.ok && (await payloadOf(result.file)).state).toBe(state);
  });

  it('returns reason \'too-large\' when the file would be larger than 25 MiB', async () => {
    const big = insertBeforeIend(makePng(4, 3), [chunk('prVa', new Uint8Array(13 * MiB)), chunk('prVb', new Uint8Array(13 * MiB))]);
    const {result} = await download(capture({picture: pictureOf(big)}), {});
    expect(result).toEqual({ok: false, reason: 'too-large', fileName: 'my-pets.png'});
  });

  it('returns reason \'failed\' when the captured picture is not a PNG', async () => {
    const {result} = await download(capture({picture: new Blob(['<html></html>'], {type: 'image/png'})}), {});
    expect(result).toEqual({ok: false, reason: 'failed', fileName: 'my-pets.png'});
  });

  it('returns reason \'failed\' when reading the store or the picture throws', async () => {
    const readDeviceImages = vi.fn(async () => {
      throw new Error('The database failed.');
    });
    expect(await snapshotDownloadFile(capture(), {readDeviceImages})).toEqual({ok: false, reason: 'failed', fileName: 'my-pets.png'});

    const picture = pictureOf(makePng(4, 3));
    vi.spyOn(picture, 'arrayBuffer').mockRejectedValue(new Error('Not read.'));
    expect(await snapshotDownloadFile(capture({picture}), {readDeviceImages: storeWith({})})).toEqual({ok: false, reason: 'failed', fileName: 'my-pets.png'});
  });

  it('returns a file without the images when the canvas throws', async () => {
    const {decode} = fakeDrawing();
    const createCanvas = () => {
      throw new Error('No canvas.');
    };
    const result = await snapshotDownloadFile(capture(), {readDeviceImages: storeWith({[CAT]: taggedPicture('Cat')}), prepare: {decode, createCanvas}});
    expect(result.ok && (await payloadOf(result.file)).images).toEqual([]);
  });
});

describe('snapshotDownloadImages', () => {
  it('returns [] when there are no images', async () => {
    expect(await snapshotDownloadImages([], 512)).toEqual([]);
  });

  it('returns labels cut to 1,000 characters when a label is longer', async () => {
    const {decode, createCanvas} = fakeDrawing();
    const label = 'x'.repeat(SNAPSHOT_PAYLOAD_LIMITS.maxLabelChars + 5);
    const [kept] = (await snapshotDownloadImages([{id: CAT, label, blob: taggedPicture('Cat')}], 512, {decode, createCanvas}))!;
    expect(kept.label).toBe('x'.repeat(1000));
  });

  it('returns images drawn again at `side` pixels, also when the store would accept the file as it is', async () => {
    const {decode, createCanvas, drawn} = fakeDrawing();
    const images = await snapshotDownloadImages([{id: CAT, label: 'Cat', blob: taggedPicture('Cat', {width: 100, height: 400})}], 256, {decode, createCanvas});
    expect(drawn).toEqual([{tag: 'Cat', width: 64, height: 256}]);
    expect(images).toEqual([{id: CAT, label: 'Cat', dataUrl: dataUrlOf('image/webp', drawnBytes('Cat', 64, 256))}]);
  });

  it('returns no image for a picture when it is drawn larger than the per-image cap', async () => {
    const {decode, createCanvas} = fakeDrawing({bytesFor: (tag) => (tag === 'Big' ? MAX_SNAPSHOT_DOWNLOAD_IMAGE_BYTES + 1 : 0)});
    const images = await snapshotDownloadImages([
      {id: CAT, label: 'Big', blob: taggedPicture('Big')},
      {id: DOG, label: 'Dog', blob: taggedPicture('Dog')},
    ], 512, {decode, createCanvas});
    expect(images?.map((image) => image.id)).toEqual([DOG]);
    // The largest image that fits makes a data URL within the payload's per-image cap.
    expect(dataUrlOf('image/webp', new Uint8Array(MAX_SNAPSHOT_DOWNLOAD_IMAGE_BYTES)).length).toBeLessThanOrEqual(SNAPSHOT_PAYLOAD_LIMITS.maxImageDataUrlChars);
  });

  it('returns null when the images together pass the payload\'s total cap', async () => {
    const {decode, createCanvas} = fakeDrawing({bytesFor: () => 1_500_000});
    const images = ['A', 'B', 'C', 'D', 'E'].map((tag) => ({id: `image${tag}000001`, label: tag, blob: taggedPicture(tag)}));
    expect(await snapshotDownloadImages(images, 512, {decode, createCanvas})).toBeNull();
    expect(await snapshotDownloadImages(images.slice(0, 4), 512, {decode, createCanvas})).toHaveLength(4);
  });
});

describe('SNAPSHOT_DOWNLOAD_MESSAGES', () => {
  it('returns the message Download writes for each reason when the list cannot go into the picture', () => {
    expect(SNAPSHOT_DOWNLOAD_MESSAGES).toEqual({
      'too-large': 'This list is too large to keep in the picture',
      failed: 'The list could not be kept in the picture',
    });
  });
});
