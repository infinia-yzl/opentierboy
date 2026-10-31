/** Link images: images added by their web address, and the consent to load images from other sites. */
import {expect, test} from '../support/test';
import {packageItemId, v3LinkJson, v3State} from '../support/links';
import {BLUE_SQUARE, serveImageSite} from '../support/imageSites';

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
    await expect.poll(() => tierList.itemImageSite('Red square')).toBe('Image from i.imgur.com');
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
    await expect(tierList.itemImage('Missing')).toHaveCount(0);
    await expect(tierList.item('Missing')).toContainText('i.imgur.com');
  });

  test('a link image without a label is named after its site', async ({tierList, page}) => {
    await serveImageSite(page, TRUSTED);
    await tierList.goto(TANKS, listWith([{u: 'https://i.imgur.com/red.png'}, {u: 'https://www.example.org/cat.png'}]));

    await expect(tierList.item('i.imgur.com')).toBeVisible();
    await expect.poll(() => tierList.itemImageHasLoaded('i.imgur.com')).toBe(true);
    await expect(tierList.itemImage('i.imgur.com')).toHaveAccessibleName('i.imgur.com');
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
    await expect(tierList.imageSitesNoticeHosts).toHaveText([OTHER]);
    // Trusted sites load at once.
    await expect.poll(() => tierList.itemImageHasLoaded('Red')).toBe(true);
    expect(trusted.requests.length).toBeGreaterThan(0);
    await expect(tierList.itemImage('Blue')).toHaveCount(0);
    await expect(tierList.item('Blue')).toContainText(OTHER);
    expect(other.requests, 'no request reaches the unknown site before Load').toEqual([]);

    await tierList.loadImagesFromOtherSites();
    await expect.poll(() => tierList.itemImageHasLoaded('Blue')).toBe(true);
    expect(other.requests).toContain(`https://${OTHER}/blue.png`);

    // Load counts for this page only.
    const requestsBefore = other.requests.length;
    await page.reload();
    await expect(tierList.imageSitesNotice).toBeVisible();
    await expect(tierList.itemImage('Blue')).toHaveCount(0);
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
    await expect(tierList.itemImage('Local')).toHaveCount(0);
    await expect(tierList.imageSitesNotice).toHaveCount(0);
    expect(requests).toEqual([]);
  });
});
