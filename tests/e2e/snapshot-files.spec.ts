/**
 * Freeze Frame: capturing the list as a picture, downloading it as a snapshot file with the list
 * inside, and opening snapshot files and other pictures (A10). Golden files: tests/fixtures/snapshots.
 */
import zlib from 'node:zlib';
import type {BrowserContext, Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {letToastTimeOut} from '../support/page-clock';
import {expect, expectTierList, test} from '../support/test';
import {packageItemId, rankingState, templateItemCount, v3LinkJson, v3State} from '../support/links';
import {BLUE_SQUARE, imageFile, noisePng, RED_SQUARE, serveImageSite} from '../support/image-sites';
import {pngDeclaring, pngFile, pngWithSnapshotText, snapshotTextOf} from '../support/snapshot-files';
import {messageNamesHost} from '../support/console';
import {SCRIPTED_PASTE_SKIP, type TierListPage} from '../pages/tier-list-page';
import {type HeldRankPages} from '../pages/snapshot-files';
import {type CaptureMethod, type FreezeFrame} from '../pages/share-panel';
import {SitePage} from '../pages/site-page';
import fs from 'node:fs';
import path from 'node:path';
import golden from '../fixtures/snapshots/snapshots.json';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {snapshotFilesModel, snapshotFilesViewOf, snapshotFilesWithoutPasteModel, type SnapshotFilesEvent, type SnapshotFilesSnapshot, type SnapshotFilesView} from '../models/snapshot-files';
import {freezeFrameLoadModel, freezeFrameLoadViewOf, type FreezeFrameLoadEvent, type FreezeFrameLoadSnapshot} from '../models/freeze-frame-load';

const TANKS = '/rank/overwatch/tank';
/** Another template page of the same set. */
const SUPPORTS = '/rank/overwatch/sup';

const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

/** A 2 x 2 green BMP picture (24 bits per pixel), which browsers show but the store does not keep as it is. */
function greenBmp(): Buffer {
  const file = Buffer.alloc(70);
  file.write('BM', 0, 'latin1');
  file.writeUInt32LE(70, 2);
  file.writeUInt32LE(54, 10);
  file.writeUInt32LE(40, 14);
  file.writeInt32LE(2, 18);
  file.writeInt32LE(2, 22);
  file.writeUInt16LE(1, 26);
  file.writeUInt16LE(24, 28);
  file.writeUInt32LE(16, 34);
  for (const row of [0, 1]) {
    for (const column of [0, 1]) file.writeUIntLE(0x00ff00, 54 + row * 8 + column * 3, 3); // blue, green, red bytes
  }
  return file;
}

/** A small AVIF or HEIC file: an ISO base media "ftyp" box with that brand, then filler. */
function isoMedia(brand: string): Buffer {
  return Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from(`ftyp${brand}\0\0\0\0mif1${brand}`, 'latin1'), Buffer.alloc(64)]);
}

/** The refusal of "From your device" for AVIF and HEIC images. */
const AVIF_HEIC_REFUSAL = 'AVIF and HEIC images cannot be added yet. Save the image as PNG, JPEG or WebP and add it again.';

/** A snapshot file as another browser could write it: these device images in row S. */
function listFile(name: string, {title, path, images}: {title: string; path?: string; images: {id: string; label: string; png: Buffer}[]}) {
  const state = v3State({t: title, tp: 3, r: [['S', images.map(({id, label}) => ({d: id, c: label}))], ['A', []], ['B', []], ['', []]]});
  const payload = {
    version: 1,
    state,
    ...(path ? {path} : {}),
    images: images.map(({id, label, png}) => ({id, label, dataUrl: `data:image/png;base64,${png.toString('base64')}`})),
  };
  return pngFile(name, pngWithSnapshotText(RED_SQUARE, JSON.stringify(payload)));
}

/** Seeded random text from the id alphabet: it compresses badly, as long real lists do. */
function randomText(seed: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let state = seed;
  return (length: number) => Array.from({length}, () => {
    // A 32-bit linear congruential generator; its high bits are the random ones.
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return alphabet[state >>> 26];
  }).join('');
}

type V3Json = {r: unknown[][]};

/**
 * The `state` value of a v3 list with filler items (ids no image set has, random labels) added to
 * its first row, as many as fit under `limit` characters.
 */
function stateNearCap(json: V3Json, limit: number, seed = 5): string {
  const text = randomText(seed);
  const copy = JSON.parse(JSON.stringify(json)) as V3Json;
  const row = copy.r[0];
  const items = row[row.length - 1] as unknown[];
  let state = v3State(copy);
  for (let step = 16; step >= 1; step = Math.floor(step / 2)) {
    for (;;) {
      const added = Array.from({length: step}, () => ({i: `x-${text(14)}`, c: text(48)}));
      items.push(...added);
      const next = v3State(copy);
      if (next.length > limit) {
        items.splice(items.length - step, step);
        break;
      }
      state = next;
    }
  }
  return state;
}

/** The device images (`{d}` items) of a v3 link in the address bar. */
function deviceItemsOf(url: string): number {
  return (v3LinkJson(url) as V3Json).r.flatMap((row) => row[row.length - 1] as object[]).filter((item) => 'd' in item).length;
}

/**
 * Makes a snapshot file the way people do: a list with a device image, Capture Preview, Download.
 * Without a method or a frame, the app's defaults are used.
 */
async function downloadSnapshotOf(tierList: TierListPage, {method, frame}: {method?: CaptureMethod; frame?: FreezeFrame} = {}): Promise<Buffer> {
  await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}, 'Tanks with a cat'));
  await tierList.addItemsFromDevice([imageFile('red-square.png')]);
  await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
  await tierList.share.capturePreview(method, frame);
  // Download says what the file carries before anyone sends it on (owner decision, 2026-10-31).
  await expect(tierList.share.sharePanel).toContainText(
    'The file keeps your list and your own pictures. Anyone you send it to can open it here and edit the list.');
  const file = await tierList.share.downloadCapturedImage();
  expect(file.name).toBe('tanks-with-a-cat.png');
  return file.buffer;
}

const SNAPSHOT_LIST = {
  title: 'Tanks with a cat',
  tiers: [
    {name: 'S', items: ['Mauga']},
    {name: 'A', items: ['Winston']},
    {name: 'B', items: []},
    {name: 'C', items: []},
    {name: 'F', items: []},
    {name: 'Unranked', items: ['red-square']},
  ],
};

const METHODS: CaptureMethod[] = ['html2canvas-pro', 'Original html2canvas'];

/** Freeze Frame's picture frames and their sizes in pixels (the canvas boards "Picture"...). */
const FRAMES: {frame: FreezeFrame; width: number; height: number}[] = [
  {frame: 'Landscape 1200×675', width: 1200, height: 675},
  {frame: 'Square 1080×1080', width: 1080, height: 1080},
  {frame: 'Portrait 1080×1350', width: 1080, height: 1350},
];

/** Width and height of a PNG file, from its IHDR chunk. */
function pngSize(png: Buffer): {width: number; height: number} {
  return {width: png.readUInt32BE(16), height: png.readUInt32BE(20)};
}

/**
 * Freeze Frame files that earlier versions saved keep opening (tests/fixtures/snapshots). Each
 * golden file opens in an empty editor, as for a friend who receives it.
 */
const DIR = path.resolve(__dirname, '../fixtures/snapshots');

test.describe('snapshot files', () => {
  test.describe('Download and Open a Freeze Frame (A10)', () => {
    // Each test builds a list, captures and downloads it, then opens the file, often in a second
    // browser: on a busy machine that takes longer than the default 30 seconds.
    test.slow();

    test('writes the v3 state and the device images into the PNG when the user clicks Download in the share panel', async ({tierList}) => {
      const snapshot = await downloadSnapshotOf(tierList);
      // Still an ordinary PNG, with the list inside.
      expect(snapshot.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const payload = JSON.parse(snapshotTextOf(snapshot) ?? 'null');
      expect(payload).toMatchObject({version: 1, path: TANKS, state: expect.stringMatching(/^3\./)});
      expect(payload.images).toHaveLength(1);
      expect(payload.images[0].dataUrl).toMatch(/^data:image\/(webp|png);base64,/);
    });

    test('renders the list and its device image, also after a reload, when a visitor opens the downloaded snapshot file', async ({tierList, openAsVisitor}) => {
      const snapshot = await downloadSnapshotOf(tierList);

      // A friend without the image opens the file in an empty list.
      const friend = await openAsVisitor('/rank');
      await friend.files.openFile(pngFile('tanks-with-a-cat.png', snapshot));
      await expect(friend.files.openListDialog).toContainText('Your current list stays one Back step away.');
      await friend.files.confirmOpenList();

      await expect(friend.page).toHaveURL(new RegExp(`${TANKS}\\?state=3\\.`));
      await expectTierList(friend, SNAPSHOT_LIST);
      await expect.poll(async () => {
        const color = await friend.itemImageCenterColor('red-square');
        return color !== null && color[0] > 200 && color[1] < 60 && color[2] < 60;
      }, {message: 'the item image is red'}).toBe(true);
      // The image is in the friend's device store now: it survives a reload.
      await friend.reload();
      await expect.poll(() => friend.itemImageHasLoaded('red-square')).toBe(true);
    });

    test('renders an error toast, and the image on the next open, when the object URL fails while opening a snapshot file', async ({tierList, openAsVisitor}) => {
      const snapshot = await downloadSnapshotOf(tierList);
      const friend = await openAsVisitor('/rank');
      await friend.files.openFile(pngFile('snapshot.png', snapshot));
      await expect(friend.files.openListDialog).toBeVisible();
      // The first URL is the one the editor draws the image through; the second one shows the tile.
      await friend.failObjectUrl({skip: 1});
      await friend.files.confirmOpenList();

      await expect(friend.toast('Some images could not be added')).toContainText('red-square: Your browser could not save the image.');
      await expect(friend.itemsIn(friend.unranked)).toHaveText(['red-square']);
      // The image was not stored: the tile shows the placeholder of a device image this browser lacks.
      await expect.poll(() => friend.itemShowsPlaceholder('red-square')).toBe(true);

      // Nothing is stuck: the same file opens again, with its image.
      await friend.files.openFile(pngFile('snapshot.png', snapshot));
      await friend.files.confirmOpenList();
      await expect.poll(() => friend.itemShowsUpload('red-square')).toBe(true);
    });

    test('writes 1 history entry when the user opens a snapshot file', async ({tierList, openAsVisitor}) => {
      const snapshot = await downloadSnapshotOf(tierList);
      const friend = await openAsVisitor(`${TANKS}?state=${rankingState('image-overwatch', {B: ['D.Va']}, 'Before')}`);
      const before = friend.page.url();
      const length = await friend.historyLength();

      await friend.files.openFile(pngFile('snapshot.png', snapshot));
      await friend.files.confirmOpenList();

      await expect(friend.title).toHaveText('Tanks with a cat');
      await expect.poll(() => friend.historyLength()).toBe(length + 1);
      await friend.goBack();
      await expect(friend.page).toHaveURL(before);
      await expect(friend.title).toHaveText('Before');
      await expect(friend.itemsIn('B')).toHaveText(['D.Va']);
      await friend.goForward();
      await expect(friend.title).toHaveText('Tanks with a cat');
    });

    test('writes no history entry and no new URL when the user clicks Cancel in the dialog "Open the list in this file?"', async ({tierList, page}) => {
      const snapshot = await downloadSnapshotOf(tierList);
      await page.keyboard.press('Escape');
      const before = page.url();
      const length = await tierList.historyLength();

      await tierList.files.openFile(pngFile('snapshot.png', snapshot));
      await expect(tierList.files.openListDialog).toBeVisible();
      await tierList.files.cancelOpenList();

      await tierList.settled();
      expect(page.url()).toBe(before);
      expect(await tierList.historyLength()).toBe(length);
      expect(await tierList.itemNamesIn('Unranked')).toEqual(['red-square']);
      // The dialog has no trigger of its own: focus goes back to Add images, whose menu opened the file.
      await expect(tierList.manageItemsButton).toBeFocused();
    });

    test('writes the state of the file and no new IndexedDB image when the user opens a snapshot file in its own browser', async ({tierList}) => {
      const snapshot = await downloadSnapshotOf(tierList);
      const state = JSON.parse(snapshotTextOf(snapshot) ?? 'null').state;
      await expect.poll(() => tierList.deviceImageCount()).toBe(1);
      await tierList.goto('/rank');

      await tierList.files.openFile(pngFile('snapshot.png', snapshot));
      await tierList.files.confirmOpenList();

      // The link is the file's own, and no copy of the image was stored.
      await expect(tierList.page).toHaveURL(new URL(`${TANKS}?state=${state}`, tierList.page.url()).href);
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
      expect(await tierList.deviceImageCount()).toBe(1);
    });

    test('renders the stored copy and no error toast when the user opens a snapshot file with an AVIF under a stored id', async ({tierList}) => {
      const snapshot = await downloadSnapshotOf(tierList);
      // The file, edited: its image is now an AVIF file under the same id.
      const payload = JSON.parse(snapshotTextOf(snapshot) ?? 'null');
      payload.images[0].dataUrl = `data:image/avif;base64,${isoMedia('avif').toString('base64')}`;
      await tierList.goto('/rank');

      await tierList.files.openFile(pngFile('edited.png', pngWithSnapshotText(RED_SQUARE, JSON.stringify(payload))));
      await tierList.files.confirmOpenList();

      // The AVIF is never read: the tile shows the stored copy, and no message says otherwise.
      await expect.poll(() => tierList.itemShowsUpload('red-square')).toBe(true);
      await expect(tierList.toast('Some images could not be added')).toHaveCount(0);
      await expect.poll(() => tierList.deviceImageCount()).toBe(1);
    });

    test('writes no new image, URL or Recently viewed entry when the user opens the same snapshot file again', async ({tierList, openAsVisitor}) => {
      const snapshot = await downloadSnapshotOf(tierList);
      const friend = await openAsVisitor('/rank');

      await friend.files.openFile(pngFile('snapshot.png', snapshot));
      await friend.files.confirmOpenList();
      const link = friend.page.url();
      const images = await friend.deviceImageCount();
      const length = await friend.historyLength();
      expect(images).toBe(1);

      await friend.files.openFile(pngFile('snapshot.png', snapshot));
      await friend.files.confirmOpenList({newAddress: false});
      await expect(friend.page).toHaveURL(link);
      await expect.poll(() => friend.itemImageHasLoaded('red-square')).toBe(true);
      expect(await friend.historyLength()).toBe(length);

      // A third time from another list: the same link again. Its image loads once the import is
      // done, so the count after it covers the second open too.
      await friend.goto('/rank');
      await friend.files.openFile(pngFile('snapshot.png', snapshot));
      await friend.files.confirmOpenList();
      await expect(friend.page).toHaveURL(link);
      await expect.poll(() => friend.itemImageHasLoaded('red-square')).toBe(true);
      expect(await friend.deviceImageCount()).toBe(images);
      const friendSite = new SitePage(friend.page);
      await friendSite.gotoHome();
      await expect(friendSite.recentLinks).toHaveText(['Tanks with a cat']);
    });

    test('writes the list as captured into the file when the user changes the list after Capture Preview and clicks Download', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}, 'As captured'));
      await tierList.share.capturePreview();
      await page.keyboard.press('Escape');
      await tierList.renameTier('S', 'Best');
      await tierList.setTitle('Changed later');

      await tierList.share.openImageTab();
      const file = await tierList.share.downloadCapturedImage();

      expect(file.name).toBe('as-captured.png');
      const payload = JSON.parse(snapshotTextOf(file.buffer) ?? 'null');
      const list = v3LinkJson(`https://example.com${TANKS}?state=${payload.state}`) as {t?: string; r: unknown[][]};
      expect(list.t).toBe('As captured');
      expect(list.r.map((row) => row[row.length - 2])).toEqual(['S', 'A', 'B', 'C', 'F', '']);
    });

    test('renders the link image and the device image when the user opens a snapshot file that has both', async ({tierList, page, openAsVisitor}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS, v3State({t: 'Link and device', tp: 3, r: [
        ['S', [packageItemId('image-overwatch', 'Mauga'), {u: 'https://i.imgur.com/red.png', c: 'Link image'}]],
        ['A', []], ['B', []], ['', []],
      ]}));
      await tierList.addItemsFromDevice([imageFile('blue-square.png', BLUE_SQUARE)]);
      await expect.poll(() => tierList.itemImageHasLoaded('Link image')).toBe(true);
      await expect.poll(() => tierList.itemImageHasLoaded('blue-square')).toBe(true);
      await tierList.share.capturePreview();
      const file = await tierList.share.downloadCapturedImage();

      const friend = await openAsVisitor('/rank');
      await serveImageSite(friend.page, 'i.imgur.com');
      await friend.files.openFile(pngFile(file.name, file.buffer));
      await friend.files.confirmOpenList();

      await expect(friend.itemsIn('S')).toHaveText(['Mauga', 'Link image']);
      await expect(friend.itemsIn(friend.unranked)).toHaveText(['blue-square']);
      await expect.poll(() => friend.itemImageHasLoaded('Link image')).toBe(true);
      await expect.poll(() => friend.itemImageHasLoaded('blue-square')).toBe(true);
    });

    test('renders the dialog "Open the list in this file?" and writes 1 history entry when the user drops a snapshot file', async ({tierList, openAsVisitor}) => {
      const snapshot = await downloadSnapshotOf(tierList);
      const friend = await openAsVisitor('/rank/overwatch/tank');
      await friend.settled();
      const before = friend.page.url();
      const entries = await friend.historyLength();

      await friend.files.dropFile(pngFile('snapshot.png', snapshot));
      await expect(friend.files.openListDialog).toBeVisible();
      await friend.files.confirmOpenList();
      await expectTierList(friend, SNAPSHOT_LIST);
      await expect.poll(() => friend.historyLength()).toBe(entries + 1);

      await friend.goBack();
      await expect(friend.page).toHaveURL(before);
      await expect(friend.itemsIn(friend.unranked)).toHaveCount(TANK_COUNT);
      await friend.goForward();
      await expectTierList(friend, SNAPSHOT_LIST);
    });

    test('renders the dialog "Open the list in this file?" when the user pastes a snapshot file', async ({tierList, openAsVisitor, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      const snapshot = await downloadSnapshotOf(tierList);
      const friend = await openAsVisitor('/rank');

      await friend.pasteImages([pngFile('snapshot.png', snapshot)]);
      await expect(friend.files.openListDialog).toBeVisible();
      await friend.files.cancelOpenList();
      await expect(friend.page).toHaveURL(/\/rank$/);

      await friend.pasteImages([pngFile('snapshot.png', snapshot)]);
      await friend.files.confirmOpenList();
      await expectTierList(friend, SNAPSHOT_LIST);
    });
  });

  test.describe('links near the cap of 13,000 characters', () => {
    test.slow();

    test('writes no device image when the user opens a snapshot file whose state passes 13,000 characters with local ids', async ({tierList}) => {
      await tierList.goto('/rank');
      const text = randomText(11);
      // 50 images with 16-character ids, as the store makes them; here they would get 27 characters.
      const images = Array.from({length: 50}, (_, index) => ({id: `img${String(index).padStart(3, '0')}${text(10)}`, label: `Image ${index}`, png: RED_SQUARE}));
      const json = {t: 'Near the cap', tp: 3, r: [['A', []], ['S', images.map(({id, label}) => ({d: id, c: label}))], ['B', []], ['', []]]};
      const state = stateNearCap(json, 13_000);
      expect(state.length).toBeGreaterThan(12_800);
      const payload = {version: 1, state, images: images.map(({id, label, png}) => ({id, label, dataUrl: `data:image/png;base64,${png.toString('base64')}`}))};

      await tierList.files.openFile(pngFile('near-cap.png', pngWithSnapshotText(RED_SQUARE, JSON.stringify(payload))));

      await expect(tierList.toast('Could not open the file')).toContainText('This file is too large to open as a list.');
      await tierList.settled();
      await expect(tierList.files.openListDialog).toHaveCount(0);
      expect(await tierList.deviceImageCount()).toBe(0);
    });

    /** Uploads 30 pictures and returns the v3 JSON of the list that holds them. */
    async function listOf30Uploads(tierList: TierListPage): Promise<V3Json> {
      await tierList.goto('/rank');
      const files = Array.from({length: 30}, (_, index) => imageFile(`pic${String(index).padStart(2, '0')}.png`, noisePng(12, 12, index + 1)));
      await tierList.addItemsFromDevice(files);
      await tierList.settled();
      expect(deviceItemsOf(tierList.page.url())).toBe(30);
      return v3LinkJson(tierList.page.url()) as V3Json;
    }

    test('writes no list into the downloaded PNG when the state would pass 13,000 characters with the ids of another browser', async ({tierList}) => {
      const json = await listOf30Uploads(tierList);

      // Just under the cap as written: opened elsewhere, the images' longer ids would pass it.
      const written = stateNearCap(json, 13_000);
      expect(written.length).toBeGreaterThan(12_800);
      await tierList.goto('/rank', written);
      await expect.poll(() => tierList.itemShowsUpload('pic00')).toBe(true);
      await tierList.share.capturePreview();
      const picture = await tierList.share.downloadCapturedImageWithoutList();
      expect(snapshotTextOf(picture.buffer)).toBeNull();
    });

    test('writes the list into the PNG, and renders its 30 device images for a visitor, when the state is 12,300 characters', async ({tierList, openAsVisitor}) => {
      const json = await listOf30Uploads(tierList);

      // Further under the cap: the file keeps the list, and a friend opens it with its images.
      await tierList.goto('/rank', stateNearCap(json, 12_300));
      await expect.poll(() => tierList.itemShowsUpload('pic00')).toBe(true);
      await tierList.share.capturePreview();
      const file = await tierList.share.downloadCapturedImage();
      expect(snapshotTextOf(file.buffer)).not.toBeNull();
      const friend = await openAsVisitor('/rank');
      await friend.files.openFile(pngFile(file.name, file.buffer));
      await friend.files.confirmOpenList();
      await expect.poll(() => deviceItemsOf(friend.page.url())).toBe(30);
      await expect.poll(() => friend.itemShowsUpload('pic29')).toBe(true);
    });
  });

  /**
   * A list file of another template path opens on another page (router.push), which asks the
   * server. A list of the same page opens in place, without a request (the other tests).
   */
  test.describe('slow server', () => {
    test.slow();

    /**
     * Opens a snapshot file of the tank template over the list "Old list" of the support template,
     * and clicks Open list with the server's answer held: the dialog says "Opening the list…"
     * until the test releases the answer.
     */
    async function startOpeningWithServerHeld(tierList: TierListPage): Promise<{before: number; hold: HeldRankPages}> {
      await tierList.goto(SUPPORTS, rankingState('image-overwatch', {S: ['Mauga']}, 'Old list'));
      const before = await tierList.historyLength();
      await tierList.files.openFile(listFile('snapshot.png', {title: 'Snapshot list', path: TANKS, images: [{id: 'snapImage001', label: 'From the file', png: RED_SQUARE}]}));
      const hold = await tierList.files.clickOpenListWithServerHeld();
      if (!hold) throw new Error('The list of the file should go to a new address.');
      return {before, hold};
    }

    test('renders the dialog "Opening the list…" until the URL has the list when the user clicks Open list on a slow server', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      const {hold} = await startOpeningWithServerHeld(tierList);

      // Meanwhile a paste (it lands in the dialog) adds nothing, and Escape does not close it.
      await tierList.pasteImages([imageFile('early.png', BLUE_SQUARE)], tierList.files.openListDialog);
      await page.keyboard.press('Escape');
      await expect(tierList.files.openListDialog).toContainText('Opening the list…');
      await hold.release();
      await expect(tierList.files.openListDialog).toBeHidden();
      await expect(tierList.page).toHaveURL(/\?state=3\./);
      await expect(tierList.itemsIn('S')).toHaveText(['From the file']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
      await expect(tierList.title).toHaveText('Snapshot list');
    });

    test('writes 1 history entry for the paste when the user pastes right after a snapshot file opens on a slow server', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      const {before, hold} = await startOpeningWithServerHeld(tierList);
      await hold.release();
      await expect(tierList.files.openListDialog).toBeHidden();

      await tierList.pasteImages([imageFile('late.png', BLUE_SQUARE)]);

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['late']);
      await tierList.settled();
      expect(await tierList.historyLength()).toBe(before + 2);
      await tierList.goBack();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
      await expect(tierList.itemsIn('S')).toHaveText(['From the file']);
      await tierList.goBack();
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.title).toHaveText('Old list');
    });

    test('writes the list of the file to Recently viewed when the user opens a snapshot file on a slow server', async ({tierList, page}) => {
      const {hold} = await startOpeningWithServerHeld(tierList);
      await hold.release();
      await expect(tierList.files.openListDialog).toBeHidden();
      await expect(tierList.title).toHaveText('Snapshot list');

      // Recorded once the list is in the address.
      const site = new SitePage(page);
      await site.gotoHome();
      await expect(site.recentLink('Snapshot list')).toHaveCount(1);
    });
  });

  test.describe('file queue', () => {
    test.slow();

    test('writes 55 history entries when the user pastes 55 images at once on a slow disk', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await tierList.goto('/rank');
      await tierList.settled();
      // More than the 50 writes the editor follows until the router has shown them: none may be
      // merged. The device store is held until all 55 pastes have arrived, so they all wait.
      const hold = await tierList.holdDeviceStore();
      const newEntries = await tierList.countNewHistoryEntries();
      const groups = Array.from({length: 55}, (_, index) => [imageFile(`q${String(index).padStart(2, '0')}.png`, noisePng(8, 8, index + 1))]);

      await tierList.pasteImagesAtOnce(groups);
      await hold.release();

      // The 55 writes land one after another. Each must land while the page is still busy with
      // the rest: the test waits for progress, never for a total time.
      for (let landed = await newEntries(); landed < 55; landed = await newEntries()) {
        await expect.poll(newEntries, {message: `a write after the first ${landed} should land`}).toBeGreaterThan(landed);
      }
      await tierList.settled();
      expect(await newEntries()).toBe(55);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(55);
      await expect.poll(() => deviceItemsOf(page.url())).toBe(55);
      // Back undoes the last paste only.
      await tierList.goBack();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(54);
    });

    test('renders the toast "Files not added" and writes no new forward entry when the user goes Back while pastes wait', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      const before = await tierList.historyLength();
      // The first picture is tiny; the second is large, so it is still being stored at Back.
      await tierList.pasteImagesAtOnce([
        [imageFile('b00.png', noisePng(8, 8, 1))],
        [imageFile('b01.png', noisePng(1600, 1600, 2))],
        [imageFile('b02.png', noisePng(8, 8, 3))],
        [imageFile('b03.png', noisePng(8, 8, 4))],
      ]);
      await expect.poll(() => tierList.historyLength(), {intervals: [50]}).toBe(before + 1);

      await tierList.goBack();

      const notAdded = tierList.toast('Files not added');
      await expect(notAdded).toContainText('You went Back or Forward before they were added:');
      await expect(notAdded).toContainText('b03.png');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      // Nothing replaced the Forward entry: it holds the first picture only.
      await tierList.goForward();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['b00']);
      await expect.poll(() => tierList.historyLength()).toBe(before + 1);
    });

    test('writes the list to Recently viewed once when the user leaves the editor while pastes wait', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Leaving'));
      const before = await tierList.historyLength();
      // Each picture takes a moment to store, so most still wait when the visitor leaves.
      await tierList.pasteImagesAtOnce(Array.from({length: 8}, (_, index) => [imageFile(`l${index}.png`, noisePng(700, 700, index + 1))]));
      await expect.poll(() => tierList.historyLength()).toBeGreaterThan(before);

      await tierList.leaveForHome();

      const site = new SitePage(page);
      await expect(site.recentLink('Leaving')).toHaveCount(1);
      await expect(page).toHaveURL(/^[^?]*\/$/);
    });

    test('renders Home and no new item when the user pastes an image while the trip home still loads', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      const tripHome = await tierList.holdTripHome();
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Leaving'));
      await tierList.settled();
      const listAddress = page.url();

      try {
        await tierList.homeLink.click();
        // A paste after the click, without a key: the editor still shows, and the picture is
        // dropped quietly. Adding it would write the address and cancel the trip home.
        await tierList.files.pasteFileNow(imageFile('late.png', BLUE_SQUARE));
        await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
        expect(page.url()).toBe(listAddress);
      } finally {
        await tripHome.release();
      }

      await expect(page).toHaveURL(/^[^?]*\/$/);
      await tierList.goBack();
      await expect(page).toHaveURL(listAddress);
    });

    test('renders the toast "Files not added" when the user pastes an image right after dropping a list file', async ({tierList, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await tierList.goto('/rank');
      const snapshot = listFile('list.png', {title: 'A list', images: [{id: 'listImage001', label: 'In the file', png: RED_SQUARE}]});
      await tierList.settled();
      // A paste, a dropped list file and another paste, all at once.
      await tierList.files.sendFileEventsAtOnce([
        {event: 'paste', file: imageFile('first.png', BLUE_SQUARE)},
        {event: 'drop', file: snapshot},
        {event: 'paste', file: imageFile('second.png', RED_SQUARE)},
      ]);

      await expect(tierList.files.openListDialog).toBeVisible();
      await expect(tierList.toast('Files not added')).toContainText('A list file was being opened, so they were not added: second.png.');
      await tierList.files.cancelOpenList();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['first']);
    });
  });

  test.describe('other files', () => {
    test('renders a PNG without a list as an item when the user opens it with Open a Freeze Frame or drops it', async ({tierList}) => {
      await tierList.goto('/rank');

      await tierList.files.openFile(imageFile('red-square.png'));
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
      await expect(tierList.toast('Items Added')).toBeVisible();
      await expect(tierList.files.openListDialog).toHaveCount(0);

      await tierList.files.dropFile(imageFile('blue-square.png', BLUE_SQUARE));
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square', 'blue-square']);
      await expect.poll(() => tierList.itemImageHasLoaded('blue-square')).toBe(true);
    });

    test('writes 1 history entry when the user drops a picture', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.settled();
      const before = page.url();
      const entries = await tierList.historyLength();

      await tierList.files.dropFile(imageFile('blue-square.png', BLUE_SQUARE));
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['blue-square']);
      await expect(page).not.toHaveURL(before);
      await expect.poll(() => tierList.historyLength()).toBe(entries + 1);

      await tierList.goBack();
      await expect(page).toHaveURL(before);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
      await tierList.goForward();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['blue-square']);
      await expect.poll(() => tierList.itemImageHasLoaded('blue-square')).toBe(true);
    });

    test('renders the item when the user opens a PNG with a tEXt chunk of a wrong CRC', async ({tierList}) => {
      await tierList.goto('/rank');
      // A tEXt chunk with a wrong CRC, just before IEND: picture viewers still show the image.
      const text = Buffer.from('Comment\0hello', 'latin1');
      const broken = Buffer.alloc(12 + text.length);
      broken.writeUInt32BE(text.length, 0);
      broken.write('tEXt', 4, 'latin1');
      text.copy(broken, 8);
      broken.writeUInt32BE(0xdeadbeef, 8 + text.length);
      const file = Buffer.concat([RED_SQUARE.subarray(0, RED_SQUARE.length - 12), broken, RED_SQUARE.subarray(RED_SQUARE.length - 12)]);

      await tierList.files.openFile(pngFile('damaged-chunk.png', file));

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['damaged-chunk']);
      await expect.poll(() => tierList.itemImageHasLoaded('damaged-chunk')).toBe(true);
    });

    test('renders the damaged-file and newer-version toasts when the user opens a broken or version 2 snapshot file', async ({tierList}) => {
      await tierList.goto('/rank');

      await tierList.files.openFile(pngFile('broken.png', pngWithSnapshotText(RED_SQUARE, 'this is not JSON')));
      await expect(tierList.toast('Could not open the file')).toContainText('This file is damaged, or it was not made by OpenTierBoy.');

      await tierList.files.openFile(pngFile('newer.png', pngWithSnapshotText(RED_SQUARE, JSON.stringify({version: 2, state: '3.abc'}))));
      await expect(tierList.toastAbout('Could not open the file', 'newer version')).toBeVisible();

      await expect(tierList.files.openListDialog).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders the AVIF and HEIC refusal and the PNG image when the user opens a snapshot file with AVIF, HEIC and PNG images', async ({tierList}) => {
      await tierList.goto('/rank');
      const state = v3State({t: 'Mixed images', tp: 3, r: [
        ['S', [{d: 'pngImage0001', c: 'Red'}, {d: 'avifImage001', c: 'Photo'}, {d: 'heicImage001', c: 'Phone'}]],
        ['A', []], ['B', []], ['', []],
      ]});
      const payload = {version: 1, state, images: [
        {id: 'pngImage0001', label: 'Red', dataUrl: `data:image/png;base64,${RED_SQUARE.toString('base64')}`},
        {id: 'avifImage001', label: 'Photo', dataUrl: `data:image/avif;base64,${isoMedia('avif').toString('base64')}`},
        // HEIC bytes that claim to be a PNG: the bytes decide.
        {id: 'heicImage001', label: 'Phone', dataUrl: `data:image/png;base64,${isoMedia('heic').toString('base64')}`},
      ]};

      await tierList.files.openFile(pngFile('mixed.png', pngWithSnapshotText(RED_SQUARE, JSON.stringify(payload))));
      await tierList.files.confirmOpenList();

      const refused = tierList.toast('Some images could not be added');
      await expect(refused).toContainText(`Photo: ${AVIF_HEIC_REFUSAL}`);
      await expect(refused).toContainText(`Phone: ${AVIF_HEIC_REFUSAL}`);
      await expect(tierList.itemsIn('S')).toHaveText(['Red', 'Photo', 'Phone']);
      await expect.poll(() => tierList.itemShowsUpload('Red')).toBe(true);
      // Only the PNG was stored; the refused images show the placeholder of a missing device image.
      await expect.poll(() => tierList.itemShowsPlaceholder('Photo')).toBe(true);
      await expect.poll(() => tierList.itemShowsPlaceholder('Phone')).toBe(true);
      await tierList.settled();
      expect(await tierList.deviceImageCount()).toBe(1);
    });

    test('renders the damaged-file toast within 1 s when the user opens a snapshot file with a 12,000 x 12,000 PNG image', async ({tierList}) => {
      await tierList.goto('/rank');
      // A tiny PNG that declares 12000 x 12000 pixels: decoding it would take seconds and gigabytes.
      const bomb = pngDeclaring(RED_SQUARE, 12_000, 12_000);
      const payload = {version: 1, state: '3.abc', images: [{id: 'bombImage001', label: 'Bomb', dataUrl: `data:image/png;base64,${bomb.toString('base64')}`}]};
      const file = pngWithSnapshotText(RED_SQUARE, JSON.stringify(payload));

      const time = await tierList.files.timeToOpenFile(pngFile('image-bomb.png', file), 'This file is damaged, or it was not made by OpenTierBoy.');

      // Measured in the page from receiving the file to the message.
      expect(time).toBeLessThan(1_000);
      await expect(tierList.files.openListDialog).toHaveCount(0);
    });

    test('renders the too-large toast when the user opens a snapshot file whose state passes 13,000 characters', async ({tierList}) => {
      await tierList.goto('/rank');
      // Labels that do not compress: add items until the link passes the 13,000-character cap. It
      // stays under the ~15,850 characters at which the server itself would refuse the address.
      let seed = 7;
      const noise = () => Array.from({length: 40}, () => String.fromCharCode(97 + ((seed = (seed * 48271) % 2147483647) % 26))).join('');
      const items: {i: string; c: string}[] = [];
      let state = '';
      while (state.length <= 13_200) {
        items.push({i: `x-${noise()}`, c: noise()});
        state = v3State({t: 'Long', r: [['S', items], ['', []]]});
      }
      expect(state.length).toBeLessThan(15_000);

      await tierList.files.openFile(pngFile('long.png', pngWithSnapshotText(RED_SQUARE, JSON.stringify({version: 1, state, images: []}))));

      await expect(tierList.toast('Could not open the file')).toContainText('This file is too large to open as a list.');
      await expect(tierList.files.openListDialog).toHaveCount(0);
    });

    test('renders the not-a-picture toast and no item when the user drops a text file or opens a PDF', async ({tierList}) => {
      await tierList.goto('/rank');
      const text = {name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture')};
      const pdf = {name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%âãÏÓ\n')};

      await tierList.files.dropFile(text);
      await expect(tierList.toast('Could not open the file')).toContainText('notes.txt: This file is not a picture.');
      await tierList.files.openFile(pdf);
      await expect(tierList.toastAbout('Could not open the file', 'scan.pdf')).toBeVisible();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders SVG and BMP files as raster items when the user opens or drops them', async ({tierList}) => {
      await tierList.goto('/rank');
      const svg = {
        name: 'drawing.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#00f"/><script>alert(1)</script></svg>'),
      };

      await tierList.files.openFile(svg);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['drawing']);
      await tierList.files.dropFile({name: 'tiny.bmp', mimeType: 'image/bmp', buffer: greenBmp()});
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['drawing', 'tiny']);

      // Both were drawn again as plain pictures: the SVG's script never runs.
      await expect.poll(async () => (await tierList.itemImageCenterColor('drawing'))?.[2] ?? 0).toBeGreaterThan(200);
      await expect.poll(async () => (await tierList.itemImageCenterColor('tiny'))?.[1] ?? 0).toBeGreaterThan(200);
    });

    test('renders the AVIF and HEIC refusal and writes no IndexedDB image when the user drops or opens AVIF or HEIC files', async ({tierList}) => {
      await tierList.goto('/rank');

      await tierList.files.dropFile({name: 'photo.heic', mimeType: 'image/heic', buffer: isoMedia('heic')});
      await expect(tierList.toastAbout('Some images could not be added', 'photo')).toContainText(AVIF_HEIC_REFUSAL);
      await tierList.files.openFile({name: 'picture.avif', mimeType: 'image/avif', buffer: isoMedia('avif')});
      await expect(tierList.toastAbout('Some images could not be added', 'picture')).toContainText(AVIF_HEIC_REFUSAL);
      // A browser may give a .heic file no type at all: its bytes decide.
      await tierList.files.dropFile({name: 'IMG_0001.HEIC', mimeType: '', buffer: isoMedia('heic')});
      await expect(tierList.toastAbout('Some images could not be added', 'IMG_0001')).toContainText(AVIF_HEIC_REFUSAL);

      await tierList.settled();
      expect(await tierList.itemNamesIn('Unranked')).toEqual([]);
      expect(await tierList.deviceImageCount()).toBe(0);
    });

    test('renders no new item when the user drops a picture on an open menu', async ({tierList}) => {
      await tierList.goto('/rank');
      await tierList.items.openManageItemsMenu();

      await tierList.files.dropFile(imageFile('red-square.png'), {onto: tierList.openMenu});

      await tierList.pressKey('Escape');
      // A file that the editor took would keep the page busy until it is added.
      await tierList.settled();
      expect(await tierList.itemNamesIn('Unranked')).toEqual([]);
      await expect(tierList.toast('Items Added')).toHaveCount(0);
      // The same drop with the menu closed adds the picture, so nothing above was missed by timing.
      await tierList.files.dropFile(imageFile('red-square.png'));
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
    });

    test('renders no new item when the user drops a picture on an open dialog', async ({tierList}) => {
      await tierList.goto('/rank');
      await tierList.openUploadDialog();

      await tierList.files.dropFile(imageFile('red-square.png'), {onto: tierList.uploadDialog});

      await expect(tierList.uploadDialog).toBeVisible();
      await tierList.pressKey('Escape');
      await expect(tierList.uploadDialog).toBeHidden();
      await tierList.settled();
      expect(await tierList.itemNamesIn('Unranked')).toEqual([]);
      await expect(tierList.toast('Items Added')).toHaveCount(0);
      // The same drop with the dialog closed adds the picture.
      await tierList.files.dropFile(imageFile('red-square.png'));
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
    });

    test('renders the too-large toast within 5 s when the user opens a PNG with 64 MB of compressed zeros', async ({tierList}) => {
      await tierList.goto('/rank');
      // 64 MB of zeros in about 64 KB: far over the 10 MB text cap.
      const bomb = pngWithSnapshotText(RED_SQUARE, '', {compressedText: zlib.deflateSync(Buffer.alloc(64 * 1024 * 1024))});
      expect(bomb.length).toBeLessThan(100_000);

      const time = await tierList.files.timeToOpenFile(pngFile('bomb.png', bomb), 'This file is too large to open as a list.');
      expect(time).toBeLessThan(5_000);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });
  });

  // "Freeze Frame" draws the list card (components/ListCard.tsx, the layout link previews use)
  // with html2canvas. These tests guard it against styling changes that the capture libraries
  // cannot read, for example new CSS colour functions in a framework upgrade.
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`Freeze Frame in ${colorScheme} mode`, () => {
      // The site follows the system colour scheme until a visitor picks a theme.
      test.use({colorScheme});

      for (const method of METHODS) {
        test(`renders a 1200 px wide image of the list when the user clicks Capture Preview with ${method}`, {tag: '@mobile'}, async ({
          tierList,
          consoleErrors,
        }) => {
          await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston', 'D.Va']}));
          const tile = await tierList.share.tileColorsOnScreen('Mauga');

          await tierList.share.capturePreview(method);

          await expect(tierList.toast('Failed to capture image')).toHaveCount(0);
          await expect(tierList.toast('Image captured successfully')).toBeVisible();
          const image = await tierList.share.capturedImageDetails();
          // The card is 1200 CSS pixels wide, drawn at twice the size on screens with dense pixels.
          const scale = image.devicePixelRatio >= 2 ? 2 : 1;
          expect(image.width, 'image width').toBe(1200 * scale);
          expect(image.height, 'image height').toBeGreaterThanOrEqual(300 * scale);
          expect(image.height, 'image height').toBeLessThanOrEqual(1200 * scale);
          // A real picture of the list has many colours (tier gradients, item images).
          expect(image.distinctColors, 'colours in the image').toBeGreaterThan(50);
          // The gradients alone have that many, so also look inside the first tile: Mauga's image
          // and name must be in the capture, about as colourful as on the page.
          const tileColors = await tierList.share.capturedCardTileColors();
          expect(tileColors, `colours in the "Mauga" tile (page shows ${tile.colors})`)
            .toBeGreaterThanOrEqual(tile.colors * 0.5);
          // The card has its own dark background in both colour schemes.
          expect(image.cornerBrightness, 'dark card background').toBeLessThan(40);
          expect(consoleErrors, 'errors in the browser console').toEqual([]);
        });
      }
    });
  }

  // Freeze Frame's picture frames (the canvas boards "Picture", "PictureSquare" and
  // "PicturePortrait") draw the list card in a fixed size, at exactly that many pixels, and their
  // Download is a snapshot file like the whole list's.
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`Freeze Frame picture frames in ${colorScheme} mode`, () => {
      test.use({colorScheme});
      // Each test captures, downloads and opens the file in a second browser.
      test.slow();

      for (const {frame, width, height} of FRAMES) {
        for (const method of METHODS) {
          test(`writes a ${width}×${height} PNG that opens as the list when the user captures ${frame.split(' ')[0]} with ${method}`, {tag: '@mobile'}, async ({
            tierList,
            openAsVisitor,
            consoleErrors,
          }) => {
            const snapshot = await downloadSnapshotOf(tierList, {method, frame});

            await expect(tierList.toast('Failed to capture image')).toHaveCount(0);
            const image = await tierList.share.capturedImageDetails();
            expect({width: image.width, height: image.height}, 'captured image size').toEqual({width, height});
            expect(pngSize(snapshot), 'downloaded file size').toEqual({width, height});
            expect(image.distinctColors, 'colours in the image').toBeGreaterThan(50);
            // The frame has the card's own dark background in both colour schemes.
            expect(image.cornerBrightness, 'dark card background').toBeLessThan(40);
            expect(JSON.parse(snapshotTextOf(snapshot) ?? 'null'), 'the list in the file').toMatchObject({version: 1, path: TANKS});

            const friend = await openAsVisitor('/rank');
            await friend.files.openFile(pngFile('tanks-with-a-cat.png', snapshot));
            await friend.files.confirmOpenList();
            await expect(friend.page).toHaveURL(new RegExp(`${TANKS}\\?state=3\\.`));
            await expectTierList(friend, SNAPSHOT_LIST);
            await expect.poll(() => friend.itemImageHasLoaded('red-square')).toBe(true);
            expect(consoleErrors, 'errors in the browser console').toEqual([]);
          });
        }
      }
    });
  }

  // Link images come from other sites. A canvas that draws an image without its site's consent
  // (CORS) cannot be exported, so the capture draws such images as label tiles (A10).
  test.describe('Freeze Frame with link images', () => {
    for (const method of METHODS) {
      test(`renders a captured image of over 50 colours when the user clicks Capture Preview with ${method} and link images`, async ({tierList, page, consoleErrors}) => {
        await serveImageSite(page, 'i.imgur.com');
        await serveImageSite(page, 'upload.wikimedia.org', {cors: false});
        await tierList.goto(TANKS, v3State({t: 'Link images', tp: 3, r: [
          ['S', [packageItemId('image-overwatch', 'Mauga'), {u: 'https://i.imgur.com/red.png', c: 'With CORS'}]],
          ['A', [{u: 'https://upload.wikimedia.org/red.png', c: 'Without CORS'}]], ['B', []], ['', []],
        ]}));
        await expect.poll(() => tierList.itemImageHasLoaded('With CORS')).toBe(true);
        await expect.poll(() => tierList.itemImageHasLoaded('Without CORS')).toBe(true);

        await tierList.share.capturePreview(method);

        await expect(tierList.toast('Failed to capture image')).toHaveCount(0);
        await expect(tierList.toast('Image captured successfully')).toBeVisible();
        const image = await tierList.share.capturedImageDetails();
        expect(image.distinctColors, 'colours in the image').toBeGreaterThan(50);
        // The browser reports the refused CORS check of the site without CORS; nothing else may fail.
        expect(consoleErrors.filter((error) => !messageNamesHost(error, 'upload.wikimedia.org') && !error.includes('net::ERR_FAILED')), 'errors in the browser console').toEqual([]);
      });
    }
  });

  test.describe('golden snapshot files', () => {
    for (const entry of golden) {
      test(`renders the list, its pictures and its link images when the user opens ${entry.file}`, async ({openAsVisitor}) => {
        const friend = await openAsVisitor('/rank');
        for (const site of new Set(entry.linkImages.map((url) => new URL(url).hostname))) await serveImageSite(friend.page, site);

        await friend.files.openFile(pngFile(entry.file, fs.readFileSync(path.join(DIR, entry.file))));
        await friend.files.confirmOpenList();

        await expect(friend.page).toHaveURL(new RegExp(`${entry.path}\\?state=3\\.`));
        await expectTierList(friend, {title: entry.title, tiers: entry.tiers});
        for (const label of entry.pictures) {
          await expect.poll(() => friend.itemImageHasLoaded(label), {message: `the picture ${label} shows`}).toBe(true);
        }
        // The pictures are saved in this browser: they still show after a reload.
        await friend.reload();
        for (const label of entry.pictures) {
          await expect.poll(() => friend.itemImageHasLoaded(label)).toBe(true);
        }
      });
    }
  });

  test.describe('model', () => {
    const BEFORE = rankingState('image-overwatch', {S: ['Mauga']}, 'Before');
    const DAMAGED = 'This file is damaged, or it was not made by OpenTierBoy.';
    const LIST_FILE = listFile('list.png', {title: 'Snapshot list', path: TANKS, images: [{id: 'snapImage001', label: 'From the file', png: RED_SQUARE}]});

    /**
     * The snapshot files machine's events and checks (modelSut). Each run starts on the
     * list "Before" (Mauga in S). File names that a message shows are new on each send, so a
     * message from an earlier step never stands in for the one a step expects.
     *
     * A message closes by itself after 4 s of page time, and page time stands still
     * (`pageTime: 'paused'`): it moves only in TOAST_TIMES_OUT, which moves the pointer off and
     * checks that the message closes after exactly 4 s (letToastTimeOut). Over the list, the step
     * that shows a message rests the pointer on it (restOnMessage), as a visitor reading it would:
     * Sonner holds the toasts while the pointer is over them. Each state checks every message on
     * screen: the message of the state, or none (the toasts "Items Added" of the pictures added
     * are not messages).
     */
    const snapshotFilesSut = (tierList: TierListPage, site: SitePage, page: Page, testInfo: TestInfo) => {
      let sent = 0;
      let textFile = '';
      let waitingPicture = '';
      let leavingPictures: string[] = [];
      /** The state on screen, as the last check saw it: TOAST_TIMES_OUT ends its message. */
      let onScreen: SnapshotFilesSnapshot | null = null;
      /** The message of a state, by what it says: each names its own file, but a damaged file's does not. */
      const messageToast = (message: SnapshotFilesView['message']) => {
        if (message === 'brokenFile') return tierList.toastAbout('Could not open the file', DAMAGED);
        if (message === 'notAPicture') return tierList.toastAbout('Could not open the file', `${textFile}: This file is not a picture.`);
        if (message === 'filesNotAdded') return tierList.toastAbout('Files not added', waitingPicture);
        throw new Error('No message shows');
      };
      return modelSut<SnapshotFilesSnapshot, SnapshotFilesEvent>(page, {
        pageTime: 'paused',
        reset: async () => {
          onScreen = null;
          await tierList.goto(TANKS, BEFORE);
        },
        events: {
          OPEN_PICTURE_FILE: () => tierList.files.openFileAndWaitForLink(imageFile('picture.png', BLUE_SQUARE)),
          DROP_PICTURE_FILE: () => tierList.files.dropFileWherePointed(imageFile('picture.png', BLUE_SQUARE)),
          PASTE_PICTURE_FILE: () => tierList.files.pasteFileWhereFocused(imageFile('picture.png', BLUE_SQUARE)),
          PASTE_TWO_PICTURES_AT_ONCE: async () => {
            await tierList.pasteImagesAtOnce([[imageFile('picture.png', BLUE_SQUARE)], [imageFile('second.png', RED_SQUARE)]]);
            // Each picture is its own write: the second one reaches the address last. The list as
            // opened has a link of an older format, without pictures.
            const link = () => (new URL(page.url()).searchParams.get('state')?.startsWith('3.') ? JSON.stringify(v3LinkJson(page.url())) : '');
            await tierList.settled();
            expect(link()).toContain('"c":"second"');
          },
          OPEN_LIST_FILE: async () => {
            await tierList.files.openFile(LIST_FILE);
            await expect(tierList.files.openListDialog).toBeVisible();
          },
          DROP_LIST_FILE: async () => {
            await tierList.files.dropFile(LIST_FILE);
            await expect(tierList.files.openListDialog).toBeVisible();
          },
          PASTE_LIST_FILE: async () => {
            await tierList.pasteImages([LIST_FILE]);
            await expect(tierList.files.openListDialog).toBeVisible();
          },
          DROP_LIST_FILE_AND_PASTE_PICTURE: async () => {
            waitingPicture = `waiting-${++sent}.png`;
            await tierList.files.sendFileEventsAtOnce([{event: 'drop', file: LIST_FILE}, {event: 'paste', file: imageFile(waitingPicture, BLUE_SQUARE)}]);
            await expect(tierList.files.openListDialog).toBeVisible();
            await expect(tierList.toastAbout('Files not added', waitingPicture)).toBeVisible();
          },
          OPEN_BROKEN_FILE: async () => {
            // The message of an earlier broken file says the same: the state before shows none.
            await expect(messageToast('brokenFile')).toHaveCount(0);
            await tierList.files.openFile(pngFile(`broken-${++sent}.png`, pngWithSnapshotText(RED_SQUARE, 'this is not JSON')));
            await tierList.restOnMessage(messageToast('brokenFile'));
          },
          DROP_TEXT_FILE: async () => {
            textFile = `notes-${++sent}.txt`;
            await tierList.files.dropFile({name: textFile, mimeType: 'text/plain', buffer: Buffer.from('not a picture')});
            await tierList.restOnMessage(messageToast('notAPicture'));
          },
          PASTE_TEXT_FILE: () => tierList.pasteImages([{name: `pasted-${++sent}.txt`, mimeType: 'text/plain', buffer: Buffer.from('not a picture')}]),
          CANCEL: () => tierList.files.chooseCancelInOpenListDialog(),
          PRESS_ESCAPE: () => tierList.files.pressEscapeInOpenListDialog(),
          // The list of the file is a list of this page: it opens in place, without a request, and
          // the dialog closes once it shows. Asked again, the address shows it already.
          OPEN_LIST: () => tierList.files.confirmOpenList({newAddress: false}),
          BROWSER_BACK: () => tierList.goBack(),
          LEAVE_WHILE_PICTURES_WAIT: async () => {
            const at = ++sent;
            leavingPictures = [0, 1, 2].map((index) => `leaving-${at}-${index}.png`);
            await tierList.leaveWhilePastesWait(leavingPictures.map((name, index) => [imageFile(name, noisePng(8, 8, index + 1))]));
          },
          TOAST_TIMES_OUT: async () => {
            if (!onScreen) throw new Error('No state was checked yet');
            await letToastTimeOut(page, messageToast(snapshotFilesViewOf(onScreen).message));
          },
        },
        states: {
          '*': async (_page, snapshot) => {
            onScreen = snapshot;
            const {list, dialog, message} = snapshotFilesViewOf(snapshot);
            // Every message on screen: the one of the state, or none.
            await expect(tierList.files.messageToasts).toHaveCount(message ? 1 : 0);
            if (list === null && dialog === null) {
              // The landing page: nothing brought the visitor back, and the waiting pictures were
              // dropped quietly. Recently viewed holds the list as opened, once.
              await expect(page).toHaveURL(/^[^?]*\/$/);
              await expect(site.recentLink('Before')).toHaveCount(1);
              return;
            }
            if (message === 'filesNotAdded') await expect(messageToast(message)).toContainText('A list file was being opened, so they were not added:');
            else if (message) await expect(messageToast(message)).toBeVisible();
            if (dialog === 'asking') await expect(tierList.files.openListDialog).toContainText('Your current list stays one Back step away.');
            if (dialog === null) await expect(tierList.files.openListDialog).toHaveCount(0);
            if (list === 'fileList') {
              await expect(tierList.title).toHaveText('Snapshot list');
              await expect(tierList.itemsIn('S')).toHaveText(['From the file']);
              await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
            } else if (list !== null) {
              await expect(tierList.title).toHaveText('Before');
              await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
              await expect(tierList.itemsIn(tierList.unranked)).toHaveText(
                {ownList: [], withPicture: ['picture'], withTwoPictures: ['picture', 'second']}[list]);
            }
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(snapshotFilesModel)) {
      test(`renders each state of the snapshot files machine when the user walks every transition (${part.name})`, async ({tierList, page, browserName}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
        const coverage = await walkModel(snapshotFilesModel, snapshotFilesSut(tierList, new SitePage(page), page, testInfo), part);
        await attachCoverage(testInfo, snapshotFilesModel, coverage, part);
      });
    }
    // Firefox cannot take pasted files from a test, so there the walk of the same machine without
    // the paste events runs: every state that opening and dropping files reach.
    for (const part of walkParts(snapshotFilesWithoutPasteModel)) {
      test(`renders each state of the snapshot files machine when the user walks every transition without pasting (${part.name})`, async ({tierList, page, browserName}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        test.skip(browserName !== 'firefox', 'The other browsers walk the whole machine, with the paste events, above.');
        const coverage = await walkModel(snapshotFilesWithoutPasteModel, snapshotFilesSut(tierList, new SitePage(page), page, testInfo), part);
        await attachCoverage(testInfo, snapshotFilesWithoutPasteModel, coverage, part);
      });
    }
  });

  test.describe('model: loading a Freeze Frame', () => {
    const MIXED_BAG = 'Mixed bag';
    const CHANGED_TITLE = 'Changed later';
    const TRUSTED_SITE = 'i.imgur.com';
    const OTHER_SITE = 'images.example.org';
    const TRUSTED_IMAGE = {label: 'Imgur red', url: `https://${TRUSTED_SITE}/red.png`};
    const OTHER_IMAGE = {label: 'Example red', url: `https://${OTHER_SITE}/red.png`};
    /** The picture from the device: a blue square, so its colour tells it from the red link images. */
    const PICTURE = 'cat';
    /** The list as each run opens it: OVERWATCH items and the two link images. The run adds the picture. */
    const MIXED_STATE = v3State({t: MIXED_BAG, tp: 3, r: [
      ['S', [packageItemId('image-overwatch', 'Mauga'), {u: TRUSTED_IMAGE.url, c: TRUSTED_IMAGE.label}]],
      ['A', [packageItemId('image-overwatch', 'Winston'), {u: OTHER_IMAGE.url, c: OTHER_IMAGE.label}]],
      ['B', []],
      ['', []],
    ]});
    /** The rows of Mixed bag. While its site waits, the label tile of the other site's image also names the site. */
    const mixedTiers = (otherSite: 'loads' | 'waits' | null) => [
      {name: 'S', items: ['Mauga', TRUSTED_IMAGE.label]},
      {name: 'A', items: ['Winston', otherSite === 'waits' ? `${OTHER_IMAGE.label}${OTHER_SITE}` : OTHER_IMAGE.label]},
      {name: 'B', items: []},
      {name: 'Unranked', items: [PICTURE]},
    ];

    /** The ids of the device images (`{d}` items) in a v3 link. */
    const deviceIdsOf = (url: string) => (v3LinkJson(url) as V3Json).r
      .flatMap((row) => row[row.length - 1] as unknown[])
      .flatMap((item) => (typeof item === 'object' && item !== null && 'd' in item ? [(item as {d: string}).d] : []));

    type OpenAsVisitor = (link: string, options?: {beforeOpen?: (context: BrowserContext) => Promise<unknown>}) => Promise<TierListPage>;

    /**
     * The freeze frame load machine's events and checks (modelSut). Each run starts in
     * the first browser, with its local storage cleared, on Mixed bag: the visitor clicks Load in
     * the notice and adds the picture from the device. Download keeps the real downloaded file,
     * which the later steps open. The device store keeps the pictures of earlier runs, so the
     * checks compare with its count right after Download. A new browser is a new context
     * (openAsVisitor), closed by the next reset.
     */
    const freezeFrameLoadSut = (tierList: TierListPage, site: SitePage, page: Page, testInfo: TestInfo, openAsVisitor: OpenAsVisitor, otherSite: {requests: string[]}) => {
      /** The machine's state before the step that runs, as the last check saw it (null right after a reset). */
      let at: FreezeFrameLoadSnapshot | null = null;
      let file: {name: string; mimeType: string; buffer: Buffer} | null = null;
      let fileState = '';
      let pictureId = '';
      let storedAfterDownload = 0;
      let historyAfterDownload = 0;
      let visitor: TierListPage | null = null;
      let visitorOtherSite: {requests: string[]} = {requests: []};
      /** The requests to images.example.org before the last page load of the browser on screen. */
      let loadedAt = 0;
      const inNewBrowser = () => at?.matches('newBrowser') ?? false;
      const here = () => {
        if (!inNewBrowser()) return tierList;
        if (!visitor) throw new Error('No new browser is open');
        return visitor;
      };
      const savedFile = () => {
        if (!file) throw new Error('No file was downloaded');
        return file;
      };
      return modelSut<FreezeFrameLoadSnapshot, FreezeFrameLoadEvent>(page, {
        pages: () => [visitor?.page],
        reset: async () => {
          at = null;
          file = null;
          if (visitor) await visitor.page.context().close();
          visitor = null;
          loadedAt = otherSite.requests.length;
          await tierList.openAsNewBrowser(TANKS, MIXED_STATE);
          await tierList.settled();
          await tierList.linkImages.loadImagesFromOtherSites();
          await tierList.addItemsFromDeviceAndWaitForLink([imageFile(`${PICTURE}.png`, BLUE_SQUARE)]);
          [pictureId] = deviceIdsOf(page.url());
        },
        events: {
          CAPTURE_PREVIEW: async () => {
            await tierList.share.openImageTab();
            await tierList.share.captureInOpenPanel();
          },
          DOWNLOAD: async () => {
            const saved = await tierList.share.downloadCapturedImage();
            expect(saved.name).toBe('mixed-bag.png');
            const payload = JSON.parse(snapshotTextOf(saved.buffer) ?? 'null') as {state: string; path: string; images: {id: string}[]};
            expect(payload.path).toBe(TANKS);
            expect(payload.images.map((image) => image.id), 'the file holds the picture under its id here').toEqual([pictureId]);
            file = pngFile(saved.name, saved.buffer);
            fileState = payload.state;
            await tierList.share.closeSharePanelWithEscape();
            storedAfterDownload = await tierList.deviceImageCount();
            historyAfterDownload = await tierList.historyLength();
          },
          OPEN_FILE_IN_EDITOR: () => here().files.openFileAndWaitForDialog(savedFile()),
          OPEN_FILE_ON_HOME: () => site.openFreezeFrameAndWaitForDialog(savedFile()),
          CHANGE_TITLE: () => tierList.setTitle(CHANGED_TITLE),
          GO_HOME: async () => {
            loadedAt = otherSite.requests.length;
            await tierList.leaveForHome();
            await expect(site.openFreezeFrameButton).toBeVisible();
          },
          OPEN_NEW_BROWSER: async () => {
            visitor = await openAsVisitor('/rank', {beforeOpen: async (context) => {
              await serveImageSite(context, TRUSTED_SITE);
              visitorOtherSite = await serveImageSite(context, OTHER_SITE);
            }});
            loadedAt = 0;
            await visitor.settled();
          },
          CANCEL: () => here().files.cancelOpenList(),
          OPEN_LIST: async () => {
            if (at?.matches('sameBrowser.home.asking')) await site.confirmOpenList();
            else await here().files.confirmOpenList({newAddress: !at?.matches('sameBrowser.editor.askingOverSameList')});
          },
          BROWSER_BACK: async () => {
            // The list on screen leaves: a list that waits for the other site later counts only
            // the requests sent after this step.
            loadedAt = (inNewBrowser() ? visitorOtherSite : otherSite).requests.length;
            await here().goBack();
          },
          RELOAD: async () => {
            loadedAt = visitorOtherSite.requests.length;
            await here().reload();
          },
          LOAD_IMAGES: () => here().linkImages.loadImagesFromOtherSites(),
        },
        states: {
          '*': async (_page, snapshot) => {
            at = snapshot;
            const view = freezeFrameLoadViewOf(snapshot);
            const shown = here();
            const requests = view.browser === 'new' ? visitorOtherSite.requests : otherSite.requests;
            if (view.dialog === 'editor') await expect(shown.files.openListDialog).toContainText('Your current list stays one Back step away.');
            else if (view.dialog === 'home') await expect(shown.files.openListDialog).toContainText('This page stays one Back step away.');
            else await expect(shown.files.openListDialog).toHaveCount(0);
            if (view.captured) {
              await expect(tierList.share.capturedImage).toBeVisible();
              await expect(tierList.share.downloadButton).toBeVisible();
            }
            if (view.list === null && view.dialog === null && !view.captured) {
              await expect(page).toHaveURL(/^[^?]*\/$/);
              await expect(site.openFreezeFrameButton).toBeVisible();
            }
            if (view.list === 'blank') {
              await expect(shown.page).toHaveURL(/\/rank$/);
              await expect(shown.allItems).toHaveCount(0);
            }
            if (view.list === 'mixedBag' || view.list === 'changed') {
              await expectTierList(shown, {title: view.list === 'mixedBag' ? MIXED_BAG : CHANGED_TITLE, tiers: mixedTiers(view.otherSite)});
              await expect.poll(async () => {
                const color = await shown.itemImageCenterColor(PICTURE);
                return color !== null && color[2] > 200 && color[0] < 60;
              }, {message: 'the picture shows, blue'}).toBe(true);
              await expect.poll(() => shown.itemShowsUpload(PICTURE), {message: 'the picture comes from the device store'}).toBe(true);
              await expect.poll(() => shown.itemImageHasLoaded(TRUSTED_IMAGE.label), {message: `${TRUSTED_SITE} loads`}).toBe(true);
              if (view.otherSite === 'loads') {
                await expect(shown.linkImages.imageSitesNotice).toHaveCount(0);
                await expect.poll(() => shown.itemImageHasLoaded(OTHER_IMAGE.label), {message: `${OTHER_SITE} loads`}).toBe(true);
              } else {
                await expect(shown.linkImages.imageSitesNoticeHosts).toHaveText([OTHER_SITE]);
                await expect(shown.item(OTHER_IMAGE.label)).toContainText(OTHER_SITE);
                await expect(shown.itemImage(OTHER_IMAGE.label)).toHaveCount(0);
                expect(requests.slice(loadedAt), `no request should reach ${OTHER_SITE} while its image waits`).toEqual([]);
              }
            }
            if (view.link === 'fileOwn') await expect(shown.page).toHaveURL(new URL(`${TANKS}?state=${fileState}`, shown.page.url()).href);
            if (view.link === 'newPictureId') {
              const [id, ...others] = deviceIdsOf(shown.page.url());
              expect(others, 'the link holds one picture').toEqual([]);
              expect(id, 'the picture was drawn again and stored under a new id').toMatch(/^snap-/);
            }
            if (view.list === 'mixedBag' && view.browser === 'new') expect(await shown.deviceImageCount(), 'the new browser stored the picture').toBe(1);
            if (file && view.browser === 'same') expect(await tierList.deviceImageCount(), 'opening the file stored no new picture').toBe(storedAfterDownload);
            if (snapshot.matches('sameBrowser.editor.fileSaved')) expect(await tierList.historyLength(), 'no history entry since Download').toBe(historyAfterDownload);
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(freezeFrameLoadModel)) {
      test(`renders each state of the freeze frame load machine when the user walks every transition (${part.name})`, async ({tierList, page, openAsVisitor}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        await serveImageSite(page, TRUSTED_SITE);
        const otherSite = await serveImageSite(page, OTHER_SITE);
        const sut = freezeFrameLoadSut(tierList, new SitePage(page), page, testInfo, openAsVisitor, otherSite);
        const coverage = await walkModel(freezeFrameLoadModel, sut, part);
        await attachCoverage(testInfo, freezeFrameLoadModel, coverage, part);
      });
    }
  });
});
