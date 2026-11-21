import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, test} from '../support/test';
import {BLOB_TAB_SKIP, SCRIPTED_PASTE_SKIP, TierListPage} from '../pages/tier-list-page';
import {FIVE_ROW_TIERS, packageItemId, rawState, v3LinkJson, v3State} from '../support/links';
import {avifWithFalseSize} from '../unit/support/avif';
import {BLUE_SQUARE, imageFile, noisePng, RED_SQUARE} from '../support/image-sites';
import {untilToastGone} from '../pages/toasts';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {
  DEVICE_IMAGE_NAMES,
  deviceImagesModel,
  deviceImagesViewOf,
  type DeviceImageKey,
  type DeviceImagesEvent,
  type DeviceImagesSnapshot,
  type DeviceImagesView,
} from '../models/device-images';
import fs from 'node:fs';
import path from 'node:path';

const TANKS = '/rank/overwatch/tank';

function listWith(items: unknown[]): string {
  return v3State({t: 'Images', tp: 3, r: [['S', [packageItemId('image-overwatch', 'Mauga')]], ['A', []], ['B', []], ['', items]]});
}

const IMAGES = path.join(__dirname, '..', 'fixtures', 'images');

function redSquareDataUrl(): string {
  return `data:image/png;base64,${fs.readFileSync(path.join(IMAGES, 'red-square.png')).toString('base64')}`;
}

async function keepUploadInThisBrowser(tierList: TierListPage, upload: {i: string; c: string; d: string}) {
  await tierList.storeBeforeLoad('customItems', JSON.stringify([upload]));
}

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
    test('writes a {d, c} item to the link and no customItems to localStorage when the user uploads an image', async ({tierList}) => {
      await tierList.goto('/rank');
      await tierList.deviceImages.addItemsFromDevice([imageFile('red-square.png')]);
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);

      await expect.poll(() => tierList.localStorageItem('customItems')).toBeNull();
      const link = await tierList.shareLink();
      expect(JSON.stringify(v3LinkJson(link))).toMatch(/\{"d":"[A-Za-z0-9_-]{16}","c":"red-square"\}/);
    });

    test('renders the preview and the item image as image/png when the user uploads a PNG with a script named evil.html', async ({tierList, browserName}) => {
      test.skip(browserName === 'webkit', BLOB_TAB_SKIP);
      const script = Buffer.from('<script>localStorage.setItem("pwned", "yes")</script>');
      const evil = imageFile('evil.html', Buffer.concat([RED_SQUARE, script]), 'text/html');
      await tierList.goto('/rank');

      const dialog = await tierList.deviceImages.chooseFilesFromDevice([evil]);
      const preview = tierList.deviceImages.uploadPreview('evil');
      await expect(preview).toBeVisible();
      expect(await tierList.deviceImages.openImageInNewTab(preview)).toEqual({contentType: 'image/png', pwned: null});
      await tierList.deviceImages.uploadAddButton.click();
      await expect(dialog).toBeHidden();

      await expect.poll(() => tierList.itemImageHasLoaded('evil')).toBe(true);
      expect(await tierList.deviceImages.openImageInNewTab(tierList.itemImage('evil'))).toEqual({contentType: 'image/png', pwned: null});
      await tierList.reload();
      await expect.poll(() => tierList.itemImageHasLoaded('evil')).toBe(true);
      expect(await tierList.deviceImages.openImageInNewTab(tierList.itemImage('evil'))).toEqual({contentType: 'image/png', pwned: null});
    });

    test('renders No preview, the too-large error and no item when the user uploads a PNG header of 12,000 x 12,000 pixels', async ({tierList}) => {
      const huge = Buffer.alloc(688);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(huge);
      huge.writeUInt32BE(12_000, 16);
      huge.writeUInt32BE(12_000, 20);
      Buffer.from([8, 6, 0, 0, 0]).copy(huge, 24);
      await tierList.goto('/rank');

      const dialog = await tierList.deviceImages.chooseFilesFromDevice([imageFile('huge.png', huge)]);
      await expect(tierList.deviceImages.uploadNoPreview).toBeVisible();
      await expect(tierList.deviceImages.uploadPreview('huge')).toHaveCount(0);
      await tierList.deviceImages.uploadAddButton.click();
      await expect(tierList.deviceImages.uploadError).toHaveText('huge: The image is too large: more than 8,192 pixels wide or tall, or more than 32 megapixels.');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders No preview, the AVIF and HEIC error and no item when the user uploads an AVIF file', async ({tierList}) => {
      const avif = Buffer.from(avifWithFalseSize([100, 100], [9000, 9000]));
      await tierList.goto('/rank');

      const dialog = await tierList.deviceImages.chooseFilesFromDevice([imageFile('photo.avif', avif, 'image/avif')]);
      await expect(tierList.deviceImages.uploadNoPreview).toBeVisible();
      await expect(tierList.deviceImages.uploadPreview('photo')).toHaveCount(0);
      await tierList.deviceImages.uploadAddButton.click();
      await expect(tierList.deviceImages.uploadError)
        .toHaveText('photo: AVIF and HEIC images cannot be added yet. Save the image as PNG, JPEG or WebP and add it again.');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders the readable image as an item and a toast naming the unreadable file when the user uploads both', async ({tierList}) => {
      await tierList.goto('/rank');
      await tierList.deviceImages.addItemsFromDevice([imageFile('red-square.png'), imageFile('notes.png', Buffer.from('not an image at all'))]);

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
      await expect(tierList.toast('Some images could not be added')).toContainText('notes: This file could not be read as an image.');
      await expect(tierList.manageItemsButton).toBeFocused();
    });

    test('renders 300 device images within 20 s when the page reloads a list with 300 uploads', async ({tierList}) => {
      test.slow();
      const ADD_BUDGET_MS = 60_000;
      const RELOAD_BUDGET_MS = 20_000;
      const count = 300;
      const files = Array.from({length: count}, (_, index) => imageFile(`upload-${String(index + 1).padStart(3, '0')}.png`, RED_SQUARE));
      await tierList.goto('/rank');

      const addStarted = Date.now();
      await tierList.deviceImages.addItemsFromDevice(files, {timeout: ADD_BUDGET_MS});
      await expect.poll(() => tierList.deviceImages.loadedUploadImageCount(), {timeout: ADD_BUDGET_MS}).toBe(count);
      const addMs = Date.now() - addStarted;
      expect(addMs, `${count} uploads should be added within ${ADD_BUDGET_MS} ms`).toBeLessThan(ADD_BUDGET_MS);

      const loadStarted = Date.now();
      await tierList.reloadNow();
      await expect.poll(() => tierList.deviceImages.loadedUploadImageCount(), {
        timeout: RELOAD_BUDGET_MS,
        message: `${count} uploads should show within ${RELOAD_BUDGET_MS} ms of a reload`,
      }).toBe(count);
      const loadMs = Date.now() - loadStarted;

      test.info().annotations.push({type: 'timing', description: `${count} uploads: added in ${addMs} ms, shown after a reload in ${loadMs} ms`});
      expect(loadMs, `${count} uploads should show within ${RELOAD_BUDGET_MS} ms of a reload`).toBeLessThan(RELOAD_BUDGET_MS);
    });

    test('renders the red centre of the drawing when the user uploads an SVG file', async ({tierList}) => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ff0000"/></svg>');
      await tierList.goto('/rank');
      await tierList.deviceImages.addItemsFromDevice([imageFile('drawing.svg', svg, 'image/svg+xml')]);

      await expect.poll(async () => {
        const color = await tierList.itemImageCenterColor('drawing');
        return color !== null && color[0] > 200 && color[1] < 60 && color[2] < 60;
      }).toBe(true);
    });

    test('renders a label tile when the page opens a link with a device image id listed in localStorage evictedDeviceImages', async ({tierList}) => {
      await tierList.storeBeforeLoad('evictedDeviceImages', JSON.stringify(['Gone1234ImageId0']));
      await tierList.goto(TANKS, listWith([{d: 'Gone1234ImageId0', c: 'Old upload'}, {d: 'NeverHere1234567', c: 'Not here'}]));

      await expect(tierList.item('Old upload')).toBeVisible();
      await expect(tierList.itemImage('Old upload')).toHaveCount(0);
      await expect.poll(() => tierList.itemImageHasLoaded('Not here')).toBe(true);
    });

    test('writes the new upload and evicts the oldest device image not on screen when the storage quota is full', {tag: '@chromium'}, async ({openInChromiumProfile, browserName}) => {
      test.skip(browserName !== 'chromium', 'Only Chromium lets a test cap the storage (DevTools Protocol).');
      const {tierList, context} = await openInChromiumProfile();
      const page = tierList.page;
      const images = [1, 2, 3, 4, 5].map((seed) => noisePng(320, 320, seed));
      const cdp = await context.newCDPSession(page);
      const origin = new URL(test.info().project.use.baseURL!).origin;
      await cdp.send('Storage.overrideQuotaForOrigin', {origin, quotaSize: Math.round(images[0].length * 4.5)});

      await tierList.goto('/rank');
      await tierList.deviceImages.addItemsFromDevice(['old-1', 'old-2', 'old-3', 'old-4'].map((name, index) => imageFile(`${name}.png`, images[index])));
      await expect.poll(() => tierList.itemImageHasLoaded('old-4')).toBe(true);
      const oldList = await tierList.shareLink();
      await tierList.goto('/rank');
      const newImage = images[4];

      await tierList.deviceImages.addItemsFromDevice([imageFile('new.png', newImage)]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['new']);
      await expect.poll(() => tierList.itemImageHasLoaded('new')).toBe(true);
      await expect.poll(() => tierList.deviceImages.evictedImageIds()).toHaveLength(1);

      await tierList.gotoLink(oldList);
      await expect(tierList.itemImage('old-1')).toHaveCount(0);
      for (const name of ['old-2', 'old-3', 'old-4']) await expect.poll(() => tierList.itemImageHasLoaded(name)).toBe(true);
    });

    test('writes 2 of 3 localStorage uploads to IndexedDB and evicts none when they exceed the storage quota', {tag: '@chromium'}, async ({openInChromiumProfile, browserName}) => {
      test.skip(browserName !== 'chromium', 'Only Chromium lets a test cap the storage (DevTools Protocol).');
      const {tierList, context} = await openInChromiumProfile();
      const images = [1, 2, 3].map((seed) => noisePng(320, 320, seed));
      const cdp = await context.newCDPSession(tierList.page);
      await cdp.send('Storage.overrideQuotaForOrigin', {origin: new URL(test.info().project.use.baseURL!).origin, quotaSize: Math.round(images[0].length * 2.5)});
      await tierList.deviceImages.keepOldUploads(images.map((png, index) => ({id: `legacyUp${index + 1}`, label: `old ${index + 1}`, png})));

      await tierList.goto(TANKS, listWith([1, 2, 3].map((n) => ({d: `legacyUp${n}`, c: `old ${n}`}))));
      await expect.poll(() => tierList.deviceImages.itemShowsUpload('old 1')).toBe(true);
      await expect.poll(() => tierList.deviceImages.itemShowsUpload('old 2')).toBe(true);
      await expect.poll(() => tierList.deviceImages.oldUploadIds()).toEqual(['legacyUp3']);
      await expect.poll(() => tierList.itemShowsPlaceholder('old 3')).toBe(true);
      expect(await tierList.deviceImages.evictedImageIds()).toEqual([]);
    });

    test('writes the first paste and evicts no device image on screen when 2 pastes at once exceed the storage quota', {tag: '@chromium'}, async ({openInChromiumProfile, browserName}) => {
      test.skip(browserName !== 'chromium', 'Only Chromium lets a test cap the storage (DevTools Protocol).');
      const {tierList, context} = await openInChromiumProfile();
      const images = [1, 2, 3].map((seed) => noisePng(320, 320, seed));
      const cdp = await context.newCDPSession(tierList.page);
      await cdp.send('Storage.overrideQuotaForOrigin', {origin: new URL(test.info().project.use.baseURL!).origin, quotaSize: Math.round(images[0].length * 2.5)});
      await tierList.goto('/rank');
      await tierList.deviceImages.addItemsFromDevice([imageFile('base.png', images[0])]);
      await expect.poll(() => tierList.deviceImages.itemShowsUpload('base')).toBe(true);

      await tierList.deviceImages.pasteImagesAtOnce([[imageFile('first.png', images[1])], [imageFile('second.png', images[2])]]);
      await expect(tierList.toast('Some images could not be added')).toContainText('second: Your browser has no room left to keep this image.');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['base', 'first']);
      await expect.poll(() => tierList.deviceImages.itemShowsUpload('first')).toBe(true);
      await expect.poll(() => tierList.deviceImages.itemShowsUpload('base')).toBe(true);
      expect(await tierList.deviceImages.evictedImageIds()).toEqual([]);
    });

    test('renders the uploaded images and the tab-only storage toast once when window.indexedDB throws', async ({tierList}) => {
      await tierList.deviceImages.blockIndexedDb();
      await tierList.goto('/rank');

      await tierList.deviceImages.addItemsFromDevice([imageFile('red-square.png')]);
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
      const notice = tierList.toast('Images are kept only for this tab');
      await expect(notice).toBeVisible();
      await untilToastGone(notice);

      await tierList.deviceImages.addItemsFromDevice([imageFile('blue-square.png', BLUE_SQUARE)]);
      await expect.poll(() => tierList.itemImageHasLoaded('blue-square')).toBe(true);
      await expect(tierList.toast('Items Added')).toBeVisible();
      await expect(notice).toHaveCount(0);
    });

    test('renders the uploaded image when a new tab opens the share link after the first tab closes', {
      annotation: {type: 'issue', description: 'https://github.com/infinia-yzl/opentierboy/issues/86'},
    }, async ({tierList, context}) => {
      await tierList.goto('/rank');
      await tierList.deviceImages.addItemsFromDevice([path.join(IMAGES, 'red-square.png')]);
      const link = await tierList.shareLink();
      await tierList.page.close();

      const reopened = new TierListPage(await context.newPage());
      await reopened.gotoLink(link);

      const image = reopened.itemImage('red-square');
      await expect(image).toBeVisible();
      await expect.poll(async () => isRed(await reopened.itemImageCenterColor('red-square'))).toBe(true);
    });
  });

  test.describe('pasted images', () => {
    test('renders pasted images in Unranked, and only the first paste after Undo, when the user pastes twice', async ({tierList, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await tierList.goto('/rank');

      await tierList.deviceImages.pasteImages([imageFile('image.png')]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Pasted image']);
      await tierList.deviceImages.pasteImages([imageFile('image.png', BLUE_SQUARE), imageFile('My cat.png')]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Pasted image', 'Pasted image 2', 'My cat']);
      await expect.poll(() => tierList.itemImageHasLoaded('Pasted image 2')).toBe(true);

      await tierList.undoFromToast(/2 item\(s\) have been added/);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Pasted image']);
    });

    test('renders an error toast for the first paste and the item of the second when the object URL fails once', async ({tierList, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await tierList.goto('/rank');
      await tierList.deviceImages.failObjectUrl({skip: 1});
      await tierList.deviceImages.pasteImages([imageFile('My cat.png')]);
      await expect(tierList.toast('Some images could not be added')).toContainText('My cat: Your browser could not save the image.');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);

      await tierList.deviceImages.pasteImages([imageFile('My dog.png', BLUE_SQUARE)]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['My dog']);
      await expect.poll(() => tierList.deviceImages.itemShowsUpload('My dog')).toBe(true);
    });

    test('renders the upload error and an enabled Add button when the object URL fails in the dialog "Add New Items"', async ({tierList}) => {
      await tierList.goto('/rank');
      const dialog = await tierList.deviceImages.chooseFilesFromDevice([imageFile('red-square.png')]);
      await expect(tierList.deviceImages.uploadPreview('red-square')).toBeVisible();
      await tierList.deviceImages.failObjectUrl({skip: 1});
      await tierList.deviceImages.uploadAddButton.click();
      await expect(tierList.deviceImages.uploadError).toHaveText('red-square: Your browser could not save the image.');
      await expect(tierList.deviceImages.uploadAddButton).toBeEnabled();
    });

    test('renders no new item when the user pastes an image into the title text box', async ({tierList, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await tierList.goto('/rank');
      const input = await tierList.typeTitle('My list');
      await tierList.deviceImages.pasteImages([imageFile('image.png')], input);
      await input.press('Escape');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
      await tierList.deviceImages.pasteImages([imageFile('image.png')]);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Pasted image']);
    });
  });

  test.describe('uploads with short legacy ids', () => {
    test('writes {"d":"legacy-ab3c9"} to the link, and renders its image after a reopen, when the user moves upload ab3c9', async ({tierList}) => {
      await keepUploadInThisBrowser(tierList, {i: 'ab3c9', c: 'My cat', d: redSquareDataUrl()});

      await tierList.goto(TANKS, linkWithUpload('ab3c9', 'My cat'));
      await tierList.drag.dragItemToTier('My cat', 'S');
      await expect.poll(async () => isRed(await tierList.itemImageCenterColor('My cat'))).toBe(true);

      const link = await tierList.shareLink();
      expect(JSON.stringify(v3LinkJson(link))).toContain('{"d":"legacy-ab3c9","c":"My cat"}');
      await tierList.gotoLink(link);
      await expect(tierList.itemsIn('S')).toHaveText(['My cat']);
      await tierList.drag.dragItemToTier('My cat', 'A');
      await expect.poll(async () => isRed(await tierList.itemImageCenterColor('My cat'))).toBe(true);
    });
  });

  test.describe('localStorage uploads', () => {
    test('renders the image of an upload in localStorage customItems when the page opens a link with it', async ({tierList}) => {
      await keepUploadInThisBrowser(tierList, {i: 'k3j9x0a1b', c: 'My cat', d: redSquareDataUrl()});
      await tierList.goto(TANKS, linkWithUpload('k3j9x0a1b', 'My cat'));
      await expect.poll(async () => isRed(await tierList.itemImageCenterColor('My cat'))).toBe(true);
      await expect.poll(() => tierList.localStorageItem('customItems')).toBeNull();
    });
  });

  test.describe('model', () => {
    const START = listWith([]);
    const MAUGA = packageItemId('image-overwatch', 'Mauga');
    const FILES = {red: imageFile('red-square.png'), blue: imageFile('blue-square.png', BLUE_SQUARE)};
    const isBlue = (color: [number, number, number] | null) => color !== null && color[0] < 100 && color[1] < 120 && color[2] > 180;
    const SHOWS_PICTURE = {red: isRed, blue: isBlue};
    const inLink = (key: DeviceImageKey) => ({d: expect.stringMatching(/^[A-Za-z0-9_-]{16}$/), c: DEVICE_IMAGE_NAMES[key]});
    const lastItems = (row: unknown[]) => row[row.length - 1];

    const expectDeviceImages = async (shown: TierListPage, view: DeviceImagesView) => {
      const names = (keys: readonly DeviceImageKey[]) => keys.map((key) => DEVICE_IMAGE_NAMES[key]);
      await expect(shown.itemsIn('S')).toHaveText(['Mauga', ...names(view.ranked)]);
      await expect(shown.itemsIn(shown.unranked)).toHaveText(names(view.unranked));
      await expect.poll(() => {
        const rows = (v3LinkJson(shown.page.url()) as {r: unknown[][]}).r;
        return [lastItems(rows[0]), lastItems(rows[rows.length - 1])];
      }, {message: 'the link should hold the id and name of each device image'}).toEqual([
        [MAUGA, ...view.ranked.map(inLink)],
        view.unranked.map(inLink),
      ]);
      for (const key of [...view.ranked, ...view.unranked]) {
        const name = DEVICE_IMAGE_NAMES[key];
        if (view.browser === 'this') {
          await expect.poll(async () => SHOWS_PICTURE[key](await shown.itemImageCenterColor(name)), {message: `${name} should show its picture`}).toBe(true);
        } else {
          await expect.poll(() => shown.itemShowsPlaceholder(name), {message: `${name} should show the placeholder image`}).toBe(true);
        }
      }
      if (view.toast) await expect(shown.deviceImages.itemsAddedToast).toContainText('1 item(s) have been added.');
    };

    const deviceImagesSut = (
      tierList: TierListPage,
      page: Page,
      testInfo: TestInfo,
      openAsVisitor: (link: string) => Promise<TierListPage>,
    ) => {
      let visitor: TierListPage | null = null;
      const closeVisitor = async () => {
        await visitor?.closeBrowser();
        visitor = null;
      };
      return modelSut<DeviceImagesSnapshot, DeviceImagesEvent>(page, {
        pages: () => [visitor?.page],
        reset: async () => {
          await closeVisitor();
          await tierList.openAsNewBrowser(TANKS, START);
        },
        events: {
          UPLOAD_RED: () => tierList.deviceImages.addItemsFromDeviceAndWaitForToast([FILES.red]),
          UPLOAD_BLUE: () => tierList.deviceImages.addItemsFromDeviceAndWaitForToast([FILES.blue]),
          UNDO: () => tierList.deviceImages.undoAddedItems(),
          RANK_RED: () => tierList.drag.dragItemToTierWhenReady(DEVICE_IMAGE_NAMES.red, 'S'),
          RELOAD: () => tierList.reload(),
          BROWSER_BACK: () => tierList.goBack(),
          BROWSER_FORWARD: () => tierList.goForward(),
          OPEN_IN_NEW_BROWSER: async () => {
            visitor = await openAsVisitor(await tierList.shareLink());
          },
          CLOSE_NEW_BROWSER: () => closeVisitor(),
        },
        states: {
          '*': async (_page, snapshot) => {
            const view = deviceImagesViewOf(snapshot);
            const shown = view.browser === 'new' ? visitor : tierList;
            expect(shown, 'the new browser should be open').not.toBeNull();
            await expectDeviceImages(shown!, view);
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(deviceImagesModel)) {
      test(`renders each state of the device images machine when the user walks every transition (${part.name})`, async ({tierList, page, openAsVisitor}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(deviceImagesModel, deviceImagesSut(tierList, page, testInfo, openAsVisitor), part);
        await attachCoverage(testInfo, deviceImagesModel, coverage, part);
      });
    }
  });
});
