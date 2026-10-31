/** Device images: pictures uploaded or pasted from the device, kept in this browser (IndexedDB). */
import {expect, test} from '../support/test';
import {BLOB_TAB_SKIP, SCRIPTED_PASTE_SKIP, TierListPage} from '../pages/TierListPage';
import {FIVE_ROW_TIERS, packageItemId, rawState, v3LinkJson, v3State} from '../support/links';
import {avifWithFalseSize} from '../unit/support/avif';
import {BLUE_SQUARE, imageFile, noisePng, RED_SQUARE} from '../support/imageSites';
import fs from 'node:fs';
import path from 'node:path';

const TANKS = '/rank/overwatch/tank';

/** A v3 link of a 3-row list: Mauga in S, `items` in Unranked. */
function listWith(items: unknown[]): string {
  return v3State({t: 'Images', tp: 3, r: [['S', [packageItemId('image-overwatch', 'Mauga')]], ['A', []], ['B', []], ['', items]]});
}

const IMAGES = path.join(__dirname, '..', 'fixtures', 'images');

/** The red test square as a data: URL, as an upload kept in localStorage holds its image. */
function redSquareDataUrl(): string {
  return `data:image/png;base64,${fs.readFileSync(path.join(IMAGES, 'red-square.png')).toString('base64')}`;
}

/** Keeps an upload in this browser's localStorage, as the app kept uploads before Phase 5c. */
async function keepUploadInThisBrowser(page: import('@playwright/test').Page, upload: {i: string; c: string; d: string}) {
  await page.addInitScript((stored) => localStorage.setItem('customItems', stored), JSON.stringify([upload]));
}

/** A v2 link with the upload and Mauga in Unranked. */
function linkWithUpload(id: string, label: string): string {
  return rawState({tiers: FIVE_ROW_TIERS.map((tier) => ({
    i: tier.id,
    n: tier.name,
    t: tier.id === 'uncategorized' ? [{i: id, c: label}, {i: packageItemId('image-overwatch', 'Mauga')}] : [],
  }))});
}

function isRed(color: [number, number, number] | null) {
  return color !== null && color[0] > 200 && color[1] < 60 && color[2] < 60;
}

test.describe('device images', () => {
  test.describe('uploads', () => {
    test('writes a {d, c} item to the link and no customItems to localStorage when the user uploads an image', async ({tierList, page}) => {
      await tierList.goto('/rank');
      await tierList.addItemsFromDevice([imageFile('red-square.png')]);
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);

      await expect.poll(() => page.evaluate(() => localStorage.getItem('customItems'))).toBeNull();
      const link = await tierList.shareLink();
      expect(JSON.stringify(v3LinkJson(link))).toMatch(/\{"d":"[A-Za-z0-9_-]{16}","c":"red-square"\}/);
    });

    test('renders the preview and the item image as image/png when the user uploads a PNG with a script named evil.html', async ({tierList, browserName}) => {
      test.skip(browserName === 'webkit', BLOB_TAB_SKIP);
      // A PNG followed by a script, named evil.html: the browser reports text/html for it.
      const script = Buffer.from('<script>localStorage.setItem("pwned", "yes")</script>');
      const evil = imageFile('evil.html', Buffer.concat([RED_SQUARE, script]), 'text/html');
      await tierList.goto('/rank');

      const dialog = await tierList.chooseFilesFromDevice([evil]);
      const preview = tierList.uploadPreview('evil');
      await expect(preview).toBeVisible();
      expect(await tierList.openImageInNewTab(preview)).toEqual({contentType: 'image/png', pwned: null});
      await tierList.uploadAddButton.click();
      await expect(dialog).toBeHidden();

      await expect.poll(() => tierList.itemImageHasLoaded('evil')).toBe(true);
      expect(await tierList.openImageInNewTab(tierList.itemImage('evil'))).toEqual({contentType: 'image/png', pwned: null});
      await tierList.page.reload();
      await expect.poll(() => tierList.itemImageHasLoaded('evil')).toBe(true);
      expect(await tierList.openImageInNewTab(tierList.itemImage('evil'))).toEqual({contentType: 'image/png', pwned: null});
    });

    test('renders No preview, the too-large error and no item when the user uploads a PNG header of 12,000 x 12,000 pixels', async ({tierList}) => {
      // A PNG header that declares 12,000 x 12,000 pixels: decoding a real one takes seconds and GBs.
      const huge = Buffer.alloc(688);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(huge);
      huge.writeUInt32BE(12_000, 16);
      huge.writeUInt32BE(12_000, 20);
      Buffer.from([8, 6, 0, 0, 0]).copy(huge, 24);
      await tierList.goto('/rank');

      const dialog = await tierList.chooseFilesFromDevice([imageFile('huge.png', huge)]);
      await expect(tierList.uploadNoPreview).toBeVisible();
      await expect(tierList.uploadPreview('huge')).toHaveCount(0);
      await tierList.uploadAddButton.click();
      await expect(tierList.uploadError).toHaveText('huge: The image is too large: more than 8,192 pixels wide or tall, or more than 32 megapixels.', {timeout: 3_000});
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders No preview, the AVIF and HEIC error and no item when the user uploads an AVIF file', async ({tierList}) => {
      // The 5d review's file: its header says 100 x 100, its AV1 data 9,000 x 9,000.
      const avif = Buffer.from(avifWithFalseSize([100, 100], [9000, 9000]));
      await tierList.goto('/rank');

      const dialog = await tierList.chooseFilesFromDevice([imageFile('photo.avif', avif, 'image/avif')]);
      await expect(tierList.uploadNoPreview).toBeVisible();
      await expect(tierList.uploadPreview('photo')).toHaveCount(0);
      await tierList.uploadAddButton.click();
      await expect(tierList.uploadError)
        .toHaveText('photo: AVIF and HEIC images cannot be added yet. Save the image as PNG, JPEG or WebP and add it again.', {timeout: 3_000});
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders the readable image as an item and a toast naming the unreadable file when the user uploads both', async ({tierList}) => {
      await tierList.goto('/rank');
      await tierList.addItemsFromDevice([imageFile('red-square.png'), imageFile('notes.png', Buffer.from('not an image at all'))]);

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
      await expect(tierList.toast('Some images could not be added')).toContainText('notes: This file could not be read as an image.');
      await expect(tierList.manageItemsButton).toBeFocused();
    });

    test('renders 300 device images within 20 s when the page reloads a list with 300 uploads', async ({tierList, page}) => {
      test.slow();
      const count = 300;
      const files = Array.from({length: count}, (_, index) => imageFile(`upload-${String(index + 1).padStart(3, '0')}.png`, RED_SQUARE));
      await tierList.goto('/rank');

      const addStarted = Date.now();
      await tierList.addItemsFromDevice(files, {timeout: 60_000});
      await expect.poll(() => tierList.loadedUploadImageCount(), {timeout: 60_000}).toBe(count);
      const addMs = Date.now() - addStarted;

      const loadStarted = Date.now();
      await page.reload();
      await expect.poll(() => tierList.loadedUploadImageCount(), {timeout: 60_000}).toBe(count);
      const loadMs = Date.now() - loadStarted;

      test.info().annotations.push({type: 'timing', description: `${count} uploads: added in ${addMs} ms, shown after a reload in ${loadMs} ms`});
      // A generous bound: the images of a list are read in one go, and each tile renders once.
      expect(loadMs, `${count} uploads should show within 20 s of a reload`).toBeLessThan(20_000);
    });

    test('renders the red centre of the drawing when the user uploads an SVG file', async ({tierList}) => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ff0000"/></svg>');
      await tierList.goto('/rank');
      await tierList.addItemsFromDevice([imageFile('drawing.svg', svg, 'image/svg+xml')]);

      await expect.poll(async () => {
        const color = await tierList.itemImageCenterColor('drawing');
        return color !== null && color[0] > 200 && color[1] < 60 && color[2] < 60;
      }).toBe(true);
    });

    test('renders a label tile when the page opens a link with a device image id listed in localStorage evictedDeviceImages', async ({tierList, page}) => {
      await page.addInitScript(() => localStorage.setItem('evictedDeviceImages', JSON.stringify(['Gone1234ImageId0'])));
      await tierList.goto(TANKS, listWith([{d: 'Gone1234ImageId0', c: 'Old upload'}, {d: 'NeverHere1234567', c: 'Not here'}]));

      await expect(tierList.item('Old upload')).toBeVisible();
      await expect(tierList.itemImage('Old upload')).toHaveCount(0);
      // An upload this browser never had keeps the placeholder image, as before.
      await expect.poll(() => tierList.itemImageHasLoaded('Not here')).toBe(true);
    });

    test('writes the new upload and evicts the oldest device image not on screen when the storage quota is full', {tag: '@chromium'}, async ({openInChromiumProfile, browserName}) => {
      test.skip(browserName !== 'chromium', 'Only Chromium lets a test cap the storage (DevTools Protocol).');
      // Chromium ignores a storage cap in incognito contexts, and reads it when the site first
      // opens its database: this test uses a real profile and sets the cap before the first page.
      const {tierList, context} = await openInChromiumProfile();
      const page = tierList.page;
      const images = [1, 2, 3, 4, 5].map((seed) => noisePng(320, 320, seed)); // about 300 KB each
      const cdp = await context.newCDPSession(page);
      const origin = new URL(test.info().project.use.baseURL!).origin;
      // Room for four of the images, not five: well below the store's own limits (100 MB).
      await cdp.send('Storage.overrideQuotaForOrigin', {origin, quotaSize: Math.round(images[0].length * 4.5)});

      // Four images in one list, then a new, empty list: they are not on screen.
      await tierList.goto('/rank');
      await tierList.addItemsFromDevice(['old-1', 'old-2', 'old-3', 'old-4'].map((name, index) => imageFile(`${name}.png`, images[index])));
      await expect.poll(() => tierList.itemImageHasLoaded('old-4')).toBe(true);
      const oldList = await tierList.shareLink();
      await tierList.goto('/rank');
      const newImage = images[4];

      await tierList.addItemsFromDevice([imageFile('new.png', newImage)]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['new']);
      await expect.poll(() => tierList.itemImageHasLoaded('new')).toBe(true);
      await expect.poll(() => tierList.evictedImageIds()).toHaveLength(1);

      // The old list: the oldest image made room and shows its name only; the others are there.
      await tierList.gotoLink(oldList);
      await expect(tierList.itemImage('old-1')).toHaveCount(0);
      for (const name of ['old-2', 'old-3', 'old-4']) await expect.poll(() => tierList.itemImageHasLoaded(name)).toBe(true);
    });

    test('writes 2 of 3 localStorage uploads to IndexedDB and evicts none when they exceed the storage quota', {tag: '@chromium'}, async ({openInChromiumProfile, browserName}) => {
      test.skip(browserName !== 'chromium', 'Only Chromium lets a test cap the storage (DevTools Protocol).');
      const {tierList, context} = await openInChromiumProfile();
      const images = [1, 2, 3].map((seed) => noisePng(320, 320, seed)); // about 300 KB each
      const cdp = await context.newCDPSession(tierList.page);
      // Room for two of the three old uploads.
      await cdp.send('Storage.overrideQuotaForOrigin', {origin: new URL(test.info().project.use.baseURL!).origin, quotaSize: Math.round(images[0].length * 2.5)});
      await tierList.keepOldUploads(images.map((png, index) => ({id: `legacyUp${index + 1}`, label: `old ${index + 1}`, png})));

      await tierList.goto(TANKS, listWith([1, 2, 3].map((n) => ({d: `legacyUp${n}`, c: `old ${n}`}))));
      await expect.poll(() => tierList.itemShowsUpload('old 1')).toBe(true);
      await expect.poll(() => tierList.itemShowsUpload('old 2')).toBe(true);
      // The third did not fit: it waits in localStorage for the next start, and nothing was removed.
      await expect.poll(() => tierList.oldUploadIds()).toEqual(['legacyUp3']);
      await expect.poll(() => tierList.itemShowsUpload('old 3')).toBe(false);
      await expect.poll(() => tierList.evictedImageIds()).toEqual([]);
    });

    test('writes the first paste and evicts no device image on screen when 2 pastes at once exceed the storage quota', {tag: '@chromium'}, async ({openInChromiumProfile, browserName}) => {
      test.skip(browserName !== 'chromium', 'Only Chromium lets a test cap the storage (DevTools Protocol).');
      const {tierList, context} = await openInChromiumProfile();
      const images = [1, 2, 3].map((seed) => noisePng(320, 320, seed));
      const cdp = await context.newCDPSession(tierList.page);
      // Room for two of the three images.
      await cdp.send('Storage.overrideQuotaForOrigin', {origin: new URL(test.info().project.use.baseURL!).origin, quotaSize: Math.round(images[0].length * 2.5)});
      await tierList.goto('/rank');
      await tierList.addItemsFromDevice([imageFile('base.png', images[0])]);
      await expect.poll(() => tierList.itemShowsUpload('base')).toBe(true);

      // Two pastes at once: the second must not make room by removing the first.
      await tierList.pasteImagesAtOnce([[imageFile('first.png', images[1])], [imageFile('second.png', images[2])]]);
      await expect(tierList.toast('Some images could not be added')).toContainText('second: Your browser has no room left to keep this image.');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['base', 'first']);
      await expect.poll(() => tierList.itemShowsUpload('first')).toBe(true);
      await expect.poll(() => tierList.itemShowsUpload('base')).toBe(true);
      await expect.poll(() => tierList.evictedImageIds()).toEqual([]);
    });

    test('renders the uploaded images and the tab-only storage toast once when window.indexedDB throws', async ({tierList, page}) => {
      await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', {get: () => {
        throw new DOMException('Blocked', 'SecurityError');
      }}));
      await tierList.goto('/rank');

      await tierList.addItemsFromDevice([imageFile('red-square.png')]);
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
      const notice = tierList.toast('Images are kept only for this tab');
      await expect(notice).toBeVisible();
      await expect(notice).toBeHidden({timeout: 15_000});

      await tierList.addItemsFromDevice([imageFile('blue-square.png', BLUE_SQUARE)]);
      await expect.poll(() => tierList.itemImageHasLoaded('blue-square')).toBe(true);
      await expect(tierList.toast('Items Added')).toBeVisible();
      await expect(notice).toHaveCount(0);
    });
  });

  test.describe('pasted images', () => {
    test('renders pasted images in Unranked, and only the first paste after Undo, when the user pastes twice', async ({tierList, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await tierList.goto('/rank');

      await tierList.pasteImages([imageFile('image.png')]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Pasted image']);
      await tierList.pasteImages([imageFile('image.png', BLUE_SQUARE), imageFile('My cat.png')]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Pasted image', 'Pasted image 2', 'My cat']);
      await expect.poll(() => tierList.itemImageHasLoaded('Pasted image 2')).toBe(true);

      await tierList.undoFromToast(/2 item\(s\) have been added/);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Pasted image']);
    });

    test('renders an error toast for the first paste and the item of the second when the object URL fails once', async ({tierList, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await tierList.goto('/rank');
      // The first URL is the one the editor reads the file through; the second one shows the tile.
      await tierList.failObjectUrl({skip: 1});
      await tierList.pasteImages([imageFile('My cat.png')]);
      await expect(tierList.toast('Some images could not be added')).toContainText('My cat: Your browser could not save the image.');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);

      await tierList.pasteImages([imageFile('My dog.png', BLUE_SQUARE)]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['My dog']);
      await expect.poll(() => tierList.itemShowsUpload('My dog')).toBe(true);
    });

    test('renders the upload error and an enabled Add button when the object URL fails in the dialog "Add New Items"', async ({tierList}) => {
      await tierList.goto('/rank');
      const dialog = await tierList.chooseFilesFromDevice([imageFile('red-square.png')]);
      await expect(tierList.uploadPreview('red-square')).toBeVisible();
      // The first URL is the one the editor reads the file through; the second one shows the tile.
      await tierList.failObjectUrl({skip: 1});
      await tierList.uploadAddButton.click();
      await expect(tierList.uploadError).toHaveText('red-square: Your browser could not save the image.');
      await expect(tierList.uploadAddButton).toBeEnabled();
    });

    test('renders no new item when the user pastes an image into the title text box', async ({tierList, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await tierList.goto('/rank');
      const input = await tierList.typeTitle('My list');
      await tierList.pasteImages([imageFile('image.png')], input);
      await input.press('Escape');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
      // The same paste outside the field adds the picture, so the empty list above is no accident.
      await tierList.pasteImages([imageFile('image.png')]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Pasted image']);
    });
  });

  /**
   * Uploads made before Phase 5c have ids from Math.random().toString(36).slice(2, 11), which can
   * be shorter than the 8 characters a v3 device image id needs (A40). The app writes such an id
   * as "legacy-<id>" (A42), and keeps its image in the device image store under that id.
   */
  test.describe('uploads with short legacy ids', () => {
    test('writes {"d":"legacy-ab3c9"} to the link, and renders its image after a reopen, when the user moves upload ab3c9', async ({tierList, page}) => {
      await keepUploadInThisBrowser(page, {i: 'ab3c9', c: 'My cat', d: redSquareDataUrl()});

      await tierList.goto(TANKS, linkWithUpload('ab3c9', 'My cat'));
      await tierList.dragItemToTier('My cat', 'S');
      // The upload moved from localStorage into the device image store, under "legacy-ab3c9".
      await expect.poll(async () => isRed(await tierList.itemImageCenterColor('My cat'))).toBe(true);

      const link = await tierList.shareLink();
      expect(JSON.stringify(v3LinkJson(link))).toContain('{"d":"legacy-ab3c9","c":"My cat"}');
      await tierList.gotoLink(link);
      await expect(tierList.itemsIn('S')).toHaveText(['My cat']);
      await tierList.dragItemToTier('My cat', 'A');
      await expect.poll(async () => isRed(await tierList.itemImageCenterColor('My cat'))).toBe(true);
    });
  });

  /**
   * Uploads live in the device image store (IndexedDB) since Phase 5c. The editor loads them in an
   * effect, after the page has started, so the server and the browser render the same list.
   */
  test.describe('localStorage uploads', () => {
    test('renders the image of an upload in localStorage customItems when the page opens a link with it', async ({tierList, page}) => {
      await keepUploadInThisBrowser(page, {i: 'k3j9x0a1b', c: 'My cat', d: redSquareDataUrl()});
      await tierList.goto(TANKS, linkWithUpload('k3j9x0a1b', 'My cat'));
      await expect.poll(async () => isRed(await tierList.itemImageCenterColor('My cat'))).toBe(true);
      // The upload moved into the device image store.
      await expect.poll(() => page.evaluate(() => localStorage.getItem('customItems'))).toBeNull();
    });

    test('renders the uploaded image when a new tab opens the share link after the first tab closes', {
      annotation: {type: 'issue', description: 'https://github.com/infinia-yzl/opentierboy/issues/86'},
    }, async ({tierList, context}) => {
      await tierList.goto('/rank');
      await tierList.addItemsFromDevice([path.join(IMAGES, 'red-square.png')]);
      const link = await tierList.shareLink();
      await tierList.page.close();

      const reopened = new TierListPage(await context.newPage());
      await reopened.gotoLink(link);

      const image = reopened.itemImage('red-square');
      await expect(image).toBeVisible();
      // The tile must show the uploaded red square. Checking only that an image loaded is not
      // enough: an item the app cannot find shows the placeholder image, which loads too.
      await expect.poll(async () => isRed(await reopened.itemImageCenterColor('red-square'))).toBe(true);
    });

  });
});
