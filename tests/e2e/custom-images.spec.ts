import {expect, test} from '../support/test';
import {BLOB_TAB_SKIP, SCRIPTED_PASTE_SKIP} from '../pages/TierListPage';
import {packageItemId, v3LinkJson, v3State} from '../support/links';
import {avifWithFalseSize} from '../unit/support/avif';
import {BLUE_SQUARE, imageFile, noisePng, RED_SQUARE, serveImageSite} from '../support/imageSites';

const TANKS = '/rank/overwatch/tank';
/** A trusted site (trusted-image-sites.json): its images load without asking. */
const TRUSTED = 'i.imgur.com';
/** A site the app does not know: its images wait for the visitor's consent. */
const OTHER = 'images.example.org';

/** A v3 link of a 3-row list: Mauga in S, `items` in Unranked. */
function listWith(items: unknown[]): string {
  return v3State({t: 'Images', tp: 3, r: [['S', [packageItemId('image-overwatch', 'Mauga')]], ['A', []], ['B', []], ['', items]]});
}

test.describe('Images from a link (#107)', () => {
  test('add an image from a trusted site, see its site, and share it', async ({tierList, page, openAsVisitor}) => {
    const site = await serveImageSite(page, TRUSTED);
    await tierList.goto('/rank');

    await tierList.addItemFromLink('https://i.imgur.com/red.png', 'Red square');

    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Red square']);
    await expect.poll(() => tierList.itemImageHasLoaded('Red square')).toBe(true);
    await expect(tierList.toast('Items Added')).toBeVisible();
    // The site shows in the item's description, and in its right-click (long-press) menu.
    await expect(tierList.item('Red square')).toHaveAccessibleDescription(/Image from i\.imgur\.com/);
    expect(await tierList.itemImageSite('Red square')).toBe('Image from i.imgur.com');
    expect(site.requests.every((url) => url === 'https://i.imgur.com/red.png')).toBe(true);

    const link = await tierList.shareLink();
    expect(JSON.stringify(v3LinkJson(link))).toContain('{"u":"https://i.imgur.com/red.png","c":"Red square"}');
    const friend = await openAsVisitor(link, {beforeOpen: (context) => serveImageSite(context, TRUSTED)});
    await expect(friend.itemsIn(friend.unranked)).toHaveText(['Red square']);
    await expect.poll(() => friend.itemImageHasLoaded('Red square')).toBe(true);
    await expect(friend.imageSitesNotice).toHaveCount(0);
  });

  test('closing the dialog gives focus back to the Add images button', async ({tierList, page}) => {
    await serveImageSite(page, TRUSTED);
    await tierList.goto('/rank');
    await tierList.addItemFromLink('https://i.imgur.com/red.png', 'Red square');
    await expect(tierList.manageItemsButton).toBeFocused();
  });

  test('refuses addresses that break the safety rules, with a plain message', async ({tierList}) => {
    await tierList.goto('/rank');
    const cases: [string, RegExp][] = [
      ['http://i.imgur.com/a.png', /starts with https:\/\//],
      ['https://localhost/a.png', /localhost/],
      ['https://192.168.1.1/a.png', /IP addresses/],
      ['https://router.local/a.png', /private or local network/],
      ['https://user:secret@i.imgur.com/a.png', /user name or password/],
      ['javascript:alert(1)', /starts with https:\/\//],
      ['i.imgur.com/a.png', /complete web address/],
    ];
    for (const [address, message] of cases) {
      await tierList.submitLinkImage(address);
      await expect(tierList.linkImageMessage, address).toHaveText(message);
    }
    await tierList.page.keyboard.press('Escape');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });

  test('an image that does not load can be added anyway, as a label tile', async ({tierList, page}) => {
    await serveImageSite(page, TRUSTED, {status: 404, contentType: 'text/html', body: Buffer.from('not found')});
    await tierList.goto('/rank');

    await tierList.submitLinkImage('https://i.imgur.com/missing.png', 'Missing');
    await expect(tierList.linkImageMessage).toContainText('The image did not load');
    await tierList.confirmAddAnyway();

    await expect(tierList.item('Missing')).toBeVisible();
    await expect(tierList.item('Missing').getByRole('img')).toHaveCount(0);
    await expect(tierList.item('Missing')).toContainText('i.imgur.com');
  });

  test('a link image without a label is named after its site', async ({tierList, page}) => {
    await serveImageSite(page, TRUSTED);
    await tierList.goto(TANKS, listWith([{u: 'https://i.imgur.com/red.png'}, {u: 'https://www.example.org/cat.png'}]));

    await expect(tierList.item('i.imgur.com')).toBeVisible();
    await expect.poll(() => tierList.itemImageHasLoaded('i.imgur.com')).toBe(true);
    await expect(tierList.item('i.imgur.com').getByRole('img')).toHaveAccessibleName('i.imgur.com');
    // A site that waits for consent: a label tile with the site's name as its caption.
    await expect(tierList.item('example.org')).toContainText('example.org');
  });
});

test.describe('Images from other sites', () => {
  test('nothing loads from an unknown site until the visitor chooses Load, and only for this page', async ({tierList, page}) => {
    const other = await serveImageSite(page, OTHER, {body: BLUE_SQUARE});
    const trusted = await serveImageSite(page, TRUSTED);
    await tierList.goto(TANKS, listWith([{u: `https://${OTHER}/blue.png`, c: 'Blue'}, {u: 'https://i.imgur.com/red.png', c: 'Red'}]));

    await expect(tierList.imageSitesNotice).toBeVisible();
    await expect(tierList.imageSitesNotice.getByRole('listitem')).toHaveText([OTHER]);
    // Trusted sites load at once.
    await expect.poll(() => tierList.itemImageHasLoaded('Red')).toBe(true);
    expect(trusted.requests.length).toBeGreaterThan(0);
    await expect(tierList.item('Blue').getByRole('img')).toHaveCount(0);
    await expect(tierList.item('Blue')).toContainText(OTHER);
    expect(other.requests, 'no request reaches the unknown site before Load').toEqual([]);

    await tierList.loadImagesFromOtherSites();
    await expect.poll(() => tierList.itemImageHasLoaded('Blue')).toBe(true);
    expect(other.requests).toContain(`https://${OTHER}/blue.png`);

    // Load counts for this page only.
    const requestsBefore = other.requests.length;
    await page.reload();
    await expect(tierList.imageSitesNotice).toBeVisible();
    await expect(tierList.item('Blue').getByRole('img')).toHaveCount(0);
    expect(other.requests.length).toBe(requestsBefore);
  });

  test('"Always allow these sites" is remembered in this browser', async ({tierList, page}) => {
    await serveImageSite(page, OTHER, {body: BLUE_SQUARE});
    await tierList.goto(TANKS, listWith([{u: `https://${OTHER}/blue.png`, c: 'Blue'}]));

    await tierList.alwaysAllowImageSites();
    await expect.poll(() => tierList.itemImageHasLoaded('Blue')).toBe(true);

    await page.reload();
    await expect(tierList.tiers.first()).toBeVisible();
    await expect.poll(() => tierList.itemImageHasLoaded('Blue')).toBe(true);
    await expect(tierList.imageSitesNotice).toHaveCount(0);
  });

  test('an address that breaks the rules never loads and is not offered for loading', async ({tierList, page}) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith('http://127.0.0.1:9/')) requests.push(request.url());
    });
    await tierList.goto(TANKS, listWith([{u: 'http://127.0.0.1:9/secret.png', c: 'Local'}]));

    await expect(tierList.item('Local')).toBeVisible();
    await expect(tierList.item('Local').getByRole('img')).toHaveCount(0);
    await expect(tierList.imageSitesNotice).toHaveCount(0);
    expect(requests).toEqual([]);
  });
});

test.describe('Images from the device', () => {
  test('uploads are kept in the browser\'s image store, not in localStorage', async ({tierList, page}) => {
    await tierList.goto('/rank');
    await tierList.addItemsFromDevice([imageFile('red-square.png')]);
    await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);

    expect(await page.evaluate(() => localStorage.getItem('customItems'))).toBeNull();
    const link = await tierList.shareLink();
    expect(JSON.stringify(v3LinkJson(link))).toMatch(/\{"d":"[A-Za-z0-9_-]{16}","c":"red-square"\}/);
  });

  test('an upload always shows as the image type of its bytes, so a disguised page never runs', async ({tierList, browserName}) => {
    test.skip(browserName === 'webkit', BLOB_TAB_SKIP);
    // A PNG followed by a script, named evil.html: the browser reports text/html for it.
    const script = Buffer.from('<script>localStorage.setItem("pwned", "yes")</script>');
    const evil = imageFile('evil.html', Buffer.concat([RED_SQUARE, script]), 'text/html');
    await tierList.goto('/rank');

    const dialog = await tierList.chooseFilesFromDevice([evil]);
    const preview = dialog.getByRole('img', {name: 'evil'});
    await expect(preview).toBeVisible();
    expect(await tierList.openImageInNewTab(preview)).toEqual({contentType: 'image/png', pwned: null});
    await dialog.getByRole('button', {name: 'Add 1 Item'}).click();
    await expect(dialog).toBeHidden();

    await expect.poll(() => tierList.itemImageHasLoaded('evil')).toBe(true);
    expect(await tierList.openImageInNewTab(tierList.item('evil').getByRole('img'))).toEqual({contentType: 'image/png', pwned: null});
    await tierList.page.reload();
    await expect.poll(() => tierList.itemImageHasLoaded('evil')).toBe(true);
    expect(await tierList.openImageInNewTab(tierList.item('evil').getByRole('img'))).toEqual({contentType: 'image/png', pwned: null});
  });

  test('a small file that declares a huge picture is refused at once, without a preview', async ({tierList}) => {
    // A PNG header that declares 12,000 x 12,000 pixels: decoding a real one takes seconds and GBs.
    const huge = Buffer.alloc(688);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(huge);
    huge.writeUInt32BE(12_000, 16);
    huge.writeUInt32BE(12_000, 20);
    Buffer.from([8, 6, 0, 0, 0]).copy(huge, 24);
    await tierList.goto('/rank');

    const dialog = await tierList.chooseFilesFromDevice([imageFile('huge.png', huge)]);
    await expect(dialog.getByText('No preview')).toBeVisible();
    await expect(dialog.locator('img')).toHaveCount(0);
    await dialog.getByRole('button', {name: 'Add 1 Item'}).click();
    await expect(dialog.getByRole('alert')).toHaveText('huge: The image is too large: more than 8,192 pixels wide or tall, or more than 32 megapixels.', {timeout: 3_000});
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });

  test('an AVIF file is refused at once with a plain message, without a preview', async ({tierList}) => {
    // The 5d review's file: its header says 100 x 100, its AV1 data 9,000 x 9,000.
    const avif = Buffer.from(avifWithFalseSize([100, 100], [9000, 9000]));
    await tierList.goto('/rank');

    const dialog = await tierList.chooseFilesFromDevice([imageFile('photo.avif', avif, 'image/avif')]);
    await expect(dialog.getByText('No preview')).toBeVisible();
    await expect(dialog.locator('img')).toHaveCount(0);
    await dialog.getByRole('button', {name: 'Add 1 Item'}).click();
    await expect(dialog.getByRole('alert'))
      .toHaveText('photo: AVIF and HEIC images cannot be added yet. Save the image as PNG, JPEG or WebP and add it again.', {timeout: 3_000});
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });

  test('when some images cannot be added, the others are added and a message lists the rest', async ({tierList}) => {
    await tierList.goto('/rank');
    await tierList.addItemsFromDevice([imageFile('red-square.png'), imageFile('notes.png', Buffer.from('not an image at all'))]);

    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square']);
    await expect(tierList.toast('Some images could not be added')).toContainText('notes: This file could not be read as an image.');
    await expect(tierList.manageItemsButton).toBeFocused();
  });

  test('300 uploads show quickly after the page loads', async ({tierList, page}) => {
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

  test('other image formats are converted before they are kept', async ({tierList}) => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#ff0000"/></svg>');
    await tierList.goto('/rank');
    await tierList.addItemsFromDevice([imageFile('drawing.svg', svg, 'image/svg+xml')]);

    await expect.poll(async () => {
      const color = await tierList.itemImageCenterColor('drawing');
      return color !== null && color[0] > 200 && color[1] < 60 && color[2] < 60;
    }).toBe(true);
  });

  test('an image the store removed to make room shows as a label tile', async ({tierList, page}) => {
    await page.addInitScript(() => localStorage.setItem('evictedDeviceImages', JSON.stringify(['Gone1234ImageId0'])));
    await tierList.goto(TANKS, listWith([{d: 'Gone1234ImageId0', c: 'Old upload'}, {d: 'NeverHere1234567', c: 'Not here'}]));

    await expect(tierList.item('Old upload')).toBeVisible();
    await expect(tierList.item('Old upload').getByRole('img')).toHaveCount(0);
    // An upload this browser never had keeps the placeholder image, as before.
    await expect.poll(() => tierList.itemImageHasLoaded('Not here')).toBe(true);
  });

  test('when the browser is full, older images that are not on screen make room for a new upload', {tag: '@chromium'}, async ({openInChromiumProfile, browserName}) => {
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
    expect(await tierList.evictedImageIds()).toHaveLength(1);

    // The old list: the oldest image made room and shows its name only; the others are there.
    await tierList.gotoLink(oldList);
    await expect(tierList.item('old-1').getByRole('img')).toHaveCount(0);
    for (const name of ['old-2', 'old-3', 'old-4']) await expect.poll(() => tierList.itemImageHasLoaded(name)).toBe(true);
  });

  test('when the browser is full, moving old uploads into the store never removes one', {tag: '@chromium'}, async ({openInChromiumProfile, browserName}) => {
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
    expect(await tierList.itemShowsUpload('old 3')).toBe(false);
    expect(await tierList.evictedImageIds()).toEqual([]);
  });

  test('when the browser is full, quick pastes never remove an image the list shows', {tag: '@chromium'}, async ({openInChromiumProfile, browserName}) => {
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
    expect(await tierList.evictedImageIds()).toEqual([]);
  });

  test('without IndexedDB, uploads still work for the tab, and the app says so once', async ({tierList, page}) => {
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

test.describe('Pasting images', () => {
  test('paste images into the editor to add them as items, then undo', async ({tierList, browserName}) => {
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

  test('when an image cannot be shown, a paste says so and the next paste still works', async ({tierList, browserName}) => {
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

  test('when an image cannot be shown, the upload dialog says so and can be used again', async ({tierList}) => {
    await tierList.goto('/rank');
    const dialog = await tierList.chooseFilesFromDevice([imageFile('red-square.png')]);
    await expect(dialog.getByRole('img', {name: 'red-square'})).toBeVisible();
    // The first URL is the one the editor reads the file through; the second one shows the tile.
    await tierList.failObjectUrl({skip: 1});
    await dialog.getByRole('button', {name: 'Add 1 Item'}).click();
    await expect(dialog.getByRole('alert')).toHaveText('red-square: Your browser could not save the image.');
    await expect(dialog.getByRole('button', {name: 'Add 1 Item'})).toBeEnabled();
  });

  test('a paste into a text field is left alone', async ({tierList, browserName}) => {
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
