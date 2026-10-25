import {expect, test} from '../support/test';
import {packageItemId, v3LinkJson, v3State} from '../support/links';
import {BLUE_SQUARE, imageFile, RED_SQUARE, serveImageSite} from '../support/imageSites';

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
    const friend = await openAsVisitor(link);
    await serveImageSite(friend.page, TRUSTED);
    await friend.page.reload();
    await expect(friend.itemsIn(friend.unranked)).toHaveText(['Red square']);
    await expect.poll(() => friend.itemImageHasLoaded('Red square')).toBe(true);
    await expect(friend.imageSitesNotice).toHaveCount(0);
  });

  test('closing the dialog gives focus back to the Manage items button', async ({tierList, page}) => {
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

  test('300 uploads show quickly after the page loads', async ({tierList, page}) => {
    test.slow();
    const count = 300;
    const files = Array.from({length: count}, (_, index) => imageFile(`upload-${String(index + 1).padStart(3, '0')}.png`, RED_SQUARE));
    await tierList.goto('/rank');

    const addStarted = Date.now();
    await tierList.addItemsFromDevice(files);
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
  test('paste images into the editor to add them as items, then undo', async ({tierList}) => {
    await tierList.goto('/rank');

    await tierList.pasteImages([imageFile('image.png')]);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Pasted image']);
    await tierList.pasteImages([imageFile('image.png', BLUE_SQUARE), imageFile('My cat.png')]);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Pasted image', 'Pasted image 2', 'My cat']);
    await expect.poll(() => tierList.itemImageHasLoaded('Pasted image 2')).toBe(true);

    await tierList.undoFromToast(/2 item\(s\) have been added/);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Pasted image']);
  });

  test('a paste into a text field is left alone', async ({tierList}) => {
    await tierList.goto('/rank');
    const input = await tierList.typeTitle('My list');
    await tierList.pasteImages([imageFile('image.png')], input);
    await input.press('Escape');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });
});
