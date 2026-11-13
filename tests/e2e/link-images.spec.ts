/** Link images: images added by their web address, and the consent to load images from other sites. */
import type {Page, TestInfo} from '@playwright/test';
import {createPlaywrightSut} from '@xstate/test/playwright';
import {expect, test} from '../support/test';
import {SCRIPTED_PASTE_SKIP, type TierListPage} from '../pages/tier-list-page';
import {packageItemId, v3LinkJson, v3State} from '../support/links';
import {BLUE_SQUARE, serveImageSite} from '../support/image-sites';
import {attachAndAssertCoverage, walkModel, MODEL_CAMPAIGN_TIMEOUT} from '../support/machines';
import {
  BLUE,
  GREEN,
  linkImagesModel,
  linkImagesViewOf,
  NAVY,
  OTHER_SITE,
  RED,
  TRUSTED_SITE,
  type LinkImage,
  type LinkImagesEvent,
  type LinkImagesSnapshot,
} from '../models/link-images';

const TANKS = '/rank/overwatch/tank';

/** A trusted site (trusted-image-sites.json): its images load without asking. */
const TRUSTED = 'i.imgur.com';

/** A site the app does not know: its images wait for the visitor's consent. */
const OTHER = 'images.example.org';

/** A v3 link of a 3-row list: Mauga in S, `items` in Unranked. */
function listWith(items: unknown[]): string {
  return v3State({t: 'Images', tp: 3, r: [['S', [packageItemId('image-overwatch', 'Mauga')]], ['A', []], ['B', []], ['', items]]});
}

test.describe('link images', () => {
  test.describe('adding link images (#107)', () => {
    test('renders the image and its site, and writes {u, c} to the link, when the user adds an image from a trusted site', async ({tierList, page, openAsVisitor}) => {
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

    test('renders focus on button "Add images" when the dialog "Add an Image from a Link" closes after an add', async ({tierList, page}) => {
      await serveImageSite(page, TRUSTED);
      await tierList.goto('/rank');
      await tierList.addItemFromLink('https://i.imgur.com/red.png', 'Red square');
      await expect(tierList.manageItemsButton).toBeFocused();
    });

    test('renders the matching error and no item when the user submits an address that fails checkLinkImageUrl', async ({tierList}) => {
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

    test('renders a label tile with the site name when the user adds an image that does not load with Add Anyway', async ({tierList, page}) => {
      await serveImageSite(page, TRUSTED, {status: 404, contentType: 'text/html', body: Buffer.from('not found')});
      await tierList.goto('/rank');

      await tierList.submitLinkImage('https://i.imgur.com/missing.png', 'Missing');
      await expect(tierList.linkImageMessage).toContainText('The image did not load');
      await tierList.confirmAddAnyway();

      await expect(tierList.item('Missing')).toBeVisible();
      await expect(tierList.itemImage('Missing')).toHaveCount(0);
      await expect(tierList.item('Missing')).toContainText('i.imgur.com');
    });

    test('renders the site name as the label when the page opens a link with a {u} item without c', async ({tierList, page}) => {
      await serveImageSite(page, TRUSTED);
      await tierList.goto(TANKS, listWith([{u: 'https://i.imgur.com/red.png'}, {u: 'https://www.example.org/cat.png'}]));

      await expect(tierList.item('i.imgur.com')).toBeVisible();
      await expect.poll(() => tierList.itemImageHasLoaded('i.imgur.com')).toBe(true);
      await expect(tierList.itemImage('i.imgur.com')).toHaveAccessibleName('i.imgur.com');
      // A site that waits for consent: a label tile with the site's name as its caption.
      await expect(tierList.item('example.org')).toContainText('example.org');
    });
  });

  // A dropped link or a pasted image address adds a link image, through the same checks as "From a
  // link" (owner decision 2026-10-28, issue #107): the address must be an image that loads, and its
  // site may load on this page. Addresses that are not images add nothing, as before.
  test.describe('dropped and pasted addresses (#107)', () => {
    test('renders the image and writes {u, c} and 1 history entry when the user drops a link to an image of a trusted site', async ({tierList, page}) => {
      await serveImageSite(page, TRUSTED);
      await tierList.goto('/rank');
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.dropText({uriList: 'https://i.imgur.com/red.png', plain: 'https://i.imgur.com/red.png'});

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red']);
      await expect.poll(() => tierList.itemImageHasLoaded('red')).toBe(true);
      await expect(tierList.toast('Items Added')).toBeVisible();
      await expect.poll(newEntries).toBe(1);
      expect(JSON.stringify(v3LinkJson(page.url()))).toContain('{"u":"https://i.imgur.com/red.png","c":"red"}');
    });

    test('renders the image and writes 1 history entry when the user drops a link after a cancelled dragstart on an item', async ({tierList, page}) => {
      await serveImageSite(page, TRUSTED);
      await tierList.goto(TANKS);
      const count = await tierList.itemsIn(tierList.unranked).count();
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.fireCancelledDragStartOn('Mauga');
      await tierList.dropText({uriList: 'https://i.imgur.com/red.png', plain: 'https://i.imgur.com/red.png'});

      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(count + 1);
      await expect(tierList.item('red')).toBeVisible();
      await expect.poll(newEntries).toBe(1);
    });

    test('writes 1 history entry and renders both images when the user drops an image from a page with two images', async ({tierList, page}) => {
      await serveImageSite(page, TRUSTED);
      await tierList.goto('/rank');
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.dropText({
        html: '<p><a href="https://imgur.com/gallery/x"><img src="https://i.imgur.com/one.png" alt="One"></a> <img src="https://i.imgur.com/two.png"></p>',
        uriList: 'https://imgur.com/gallery/x',
      });

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['one', 'two']);
      await expect.poll(newEntries).toBe(1);
    });

    test('renders the image when the user pastes an image address of a trusted site', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await serveImageSite(page, TRUSTED);
      await tierList.goto('/rank');

      await tierList.pasteText('https://i.imgur.com/red.png');

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red']);
      await expect.poll(() => tierList.itemImageHasLoaded('red')).toBe(true);
    });

    // The visitor chose the image, as with "From a link": its site may load at once (allowHosts).
    test('renders the image and no notice when the user drops a link to an image of an unknown site', async ({tierList, page}) => {
      const site = await serveImageSite(page, OTHER, {body: BLUE_SQUARE});
      await tierList.goto('/rank');

      await tierList.dropText({uriList: `https://${OTHER}/blue.png`});

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['blue']);
      await expect.poll(() => tierList.itemImageHasLoaded('blue')).toBe(true);
      await expect(tierList.imageSitesNotice).toHaveCount(0);
      expect(site.requests.length).toBeGreaterThan(0);
    });

    test('renders the image and no notice when the user pastes an address of an image of an unknown site', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await serveImageSite(page, OTHER, {body: BLUE_SQUARE});
      await tierList.goto('/rank');

      await tierList.pasteText(`https://${OTHER}/blue.png`);

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['blue']);
      await expect.poll(() => tierList.itemImageHasLoaded('blue')).toBe(true);
      await expect(tierList.imageSitesNotice).toHaveCount(0);
    });

    test('writes no history entry and renders no item or toast when the user pastes a link to a page that is not an image', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      const pages = await serveImageSite(page, 'www.youtube.com', {contentType: 'text/html', body: Buffer.from('<!doctype html><title>Video</title>')});
      await serveImageSite(page, TRUSTED);
      await tierList.goto('/rank');
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.pasteText('https://www.youtube.com/watch?v=abc');
      await expect.poll(() => pages.requests.length).toBe(1);
      // A paste of an image after it: the pastes are added in turn, so the page added nothing.
      await tierList.pasteText('https://i.imgur.com/red.png');

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red']);
      await expect.poll(newEntries).toBe(1);
      expect(await tierList.toast('Could not add').count()).toBe(0);
    });

    test('writes no history entry and renders no item or toast when the user drops a link to a page that is not an image', async ({tierList, page}) => {
      const pages = await serveImageSite(page, TRUSTED, {status: 404, contentType: 'text/html', body: Buffer.from('not found')});
      await tierList.goto('/rank');
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.dropText({uriList: 'https://i.imgur.com/gallery/page'});
      await expect.poll(() => pages.requests.length).toBe(1);
      await serveImageSite(page, OTHER, {body: BLUE_SQUARE});
      await tierList.dropText({uriList: `https://${OTHER}/blue.png`});

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['blue']);
      await expect.poll(newEntries).toBe(1);
      expect(await tierList.toast('Could not add').count()).toBe(0);
    });

    test('writes no history entry and renders no toast when the user pastes an address that fails checkLinkImageUrl', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await serveImageSite(page, TRUSTED);
      await tierList.goto('/rank');
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.pasteText('http://i.imgur.com/a.png');
      await tierList.pasteText('https://i.imgur.com/red.png');

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red']);
      await expect.poll(newEntries).toBe(1);
      expect(await tierList.toast('Could not add').count()).toBe(0);
    });

    test('writes no history entry and renders no toast when the user pastes text without an address', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await serveImageSite(page, OTHER, {body: BLUE_SQUARE});
      await tierList.goto('/rank');
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.pasteText('Mauga is S tier');
      // A paste of an address after it is added: the text before it added nothing.
      await tierList.pasteText(`https://${OTHER}/blue.png`);

      await expect(tierList.item('blue')).toBeVisible();
      await expect.poll(newEntries).toBe(1);
      expect(await tierList.toast('Could not add').count()).toBe(0);
    });

    test('renders 20 items and the toast "Too many image addresses" when the user pastes 25 addresses', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await serveImageSite(page, OTHER, {body: BLUE_SQUARE});
      await tierList.goto('/rank');

      await tierList.pasteText(Array.from({length: 25}, (_, index) => `https://${OTHER}/${index}.png`).join('\n'));

      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(20);
      await expect(tierList.toast('Too many image addresses')).toContainText('Up to 20 are added at a time. 5 were left out.');
    });
  });

  test.describe('other sites', () => {
    test('writes no request to an unknown site when the page opens its link image, until the user clicks Load for this page', async ({tierList, page}) => {
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

    test('renders the image, also after a reload, when the user allows the unknown site for this browser', async ({tierList, page}) => {
      await serveImageSite(page, OTHER, {body: BLUE_SQUARE});
      await tierList.goto(TANKS, listWith([{u: `https://${OTHER}/blue.png`, c: 'Blue'}]));

      await tierList.alwaysAllowImageSites();
      await expect.poll(() => tierList.itemImageHasLoaded('Blue')).toBe(true);

      await page.reload();
      await expect(tierList.tiers.first()).toBeVisible();
      await expect.poll(() => tierList.itemImageHasLoaded('Blue')).toBe(true);
      await expect(tierList.imageSitesNotice).toHaveCount(0);
    });

    test('writes no request and renders no Load notice when the page opens a link image of http://127.0.0.1:9', async ({tierList}) => {
      const sent = tierList.recordRequests();
      await tierList.goto(TANKS, listWith([{u: 'http://127.0.0.1:9/secret.png', c: 'Local'}]));

      await expect(tierList.item('Local')).toBeVisible();
      await expect(tierList.itemImage('Local')).toHaveCount(0);
      await expect(tierList.imageSitesNotice).toHaveCount(0);
      expect(sent().filter((request) => request.url.startsWith('http://127.0.0.1:9/'))).toEqual([]);
    });
  });

  test.describe('model', () => {
    const item = ({label, url}: LinkImage) => ({u: url, c: label});
    /** The first list of the machine: Blue (an unknown site) and Red (a trusted site) in Unranked. */
    const FIRST_LIST = listWith([item(BLUE), item(RED)]);
    /** The other list: Navy, from the same unknown site. */
    const OTHER_LIST = listWith([item(NAVY)]);

    /**
     * The link images machine's events and checks (createPlaywrightSut). Each run starts as a new
     * browser on the first list. `loadedAt` counts the unknown site's requests before the last
     * page load, so a state checks only the requests of the page on screen.
     */
    const linkImagesSut = (tierList: TierListPage, page: Page, testInfo: TestInfo, otherSite: {requests: string[]}) => {
      let loadedAt = 0;
      const sinceLoad = () => otherSite.requests.slice(loadedAt);
      const load = async (open: () => Promise<void>) => {
        loadedAt = otherSite.requests.length;
        await open();
      };
      return createPlaywrightSut<Page, LinkImagesSnapshot, LinkImagesEvent>(page, {
        reset: () => load(() => tierList.openAsNewBrowser(TANKS, FIRST_LIST)),
        events: {
          LOAD_IMAGES: () => tierList.loadImagesFromOtherSites(),
          ALWAYS_ALLOW_SITES: () => tierList.alwaysAllowImageSites(),
          ADD_IMAGE_FROM_LINK: () => tierList.addItemFromLinkAndWaitForLink(GREEN.url, GREEN.label),
          RELOAD: () => load(() => tierList.reload()),
          OPEN_OTHER_LIST: () => load(() => tierList.goto(TANKS, OTHER_LIST)),
        },
        states: {
          '*': async (_page, snapshot) => {
            const view = linkImagesViewOf(snapshot);
            // Trusted sites load at once, also while the notice waits.
            for (const image of view.trustedImages) {
              await expect.poll(() => tierList.itemImageHasLoaded(image.label), {message: `${image.label} should load`}).toBe(true);
            }
            if (view.waiting) {
              await expect(tierList.imageSitesNoticeHosts).toHaveText([OTHER_SITE]);
              for (const image of view.otherSiteImages) {
                await expect(tierList.item(image.label)).toContainText(OTHER_SITE);
                await expect(tierList.itemImage(image.label)).toHaveCount(0);
              }
              expect(sinceLoad(), `no request should reach ${OTHER_SITE} while its images wait`).toEqual([]);
            } else {
              await expect(tierList.imageSitesNotice).toHaveCount(0);
              for (const image of view.otherSiteImages) {
                await expect.poll(() => tierList.itemImageHasLoaded(image.label), {message: `${image.label} should load`}).toBe(true);
              }
              await expect.poll(sinceLoad).toEqual(expect.arrayContaining(view.otherSiteImages.map(({url}) => url)));
            }
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test('renders each state of the link images machine when the user walks every transition', async ({tierList, page}, testInfo) => {
      test.setTimeout(MODEL_CAMPAIGN_TIMEOUT);
      await serveImageSite(page, TRUSTED_SITE);
      const otherSite = await serveImageSite(page, OTHER_SITE, {body: BLUE_SQUARE});
      const coverage = await walkModel(linkImagesModel, linkImagesSut(tierList, page, testInfo, otherSite));
      await attachAndAssertCoverage(testInfo, linkImagesModel, coverage);
    });
  });
});
