/** Link images: images added by their web address, and the consent to load images from other sites. */
import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, test} from '../support/test';
import {SCRIPTED_PASTE_SKIP, type TierListPage} from '../pages/tier-list-page';
import {packageItemId, v3LinkJson, v3State} from '../support/links';
import {BLUE_SQUARE, noisePng, NOT_A_PICTURE, serveImageSite, type HeldImageSite, type ImageSite} from '../support/image-sites';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {
  awaitsImageSite,
  BLUE,
  GREEN,
  HELD_ADDRESSES,
  IMAGE_CHECK_MS,
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
import {
  checksImage, LARGE_PICTURE, linkDialogModel, linkDialogViewOf, PICTURE, REFUSED_ADDRESS, WEB_PAGE,
  type DialogImage, type LinkDialogEvent, type LinkDialogSnapshot,
} from '../models/link-dialog';
import {linkDialogAddressField, linkDialogButton} from '../pages/tier-list-page';

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
      await tierList.openLinkImageDialog();
      for (const [address, message] of cases) {
        await tierList.submitInLinkImageDialog(address);
        await expect(tierList.linkImageMessage, address).toHaveText(message);
      }
      await tierList.closeLinkImageDialog();
      await tierList.settled();
      expect(await tierList.itemNamesIn('Unranked')).toEqual([]);
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
      // Every toast shows before the page settles (lib/toast.ts): then one look tells.
      await tierList.settled();
      expect(await tierList.toast(/could not/i).count(), 'no toast says an image could not be added').toBe(0);
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
      // Every toast shows before the page settles (lib/toast.ts): then one look tells.
      await tierList.settled();
      expect(await tierList.toast(/could not/i).count(), 'no toast says an image could not be added').toBe(0);
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
      // Every toast shows before the page settles (lib/toast.ts): then one look tells.
      await tierList.settled();
      expect(await tierList.toast(/could not/i).count(), 'no toast says an image could not be added').toBe(0);
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
      // Every toast shows before the page settles (lib/toast.ts): then one look tells.
      await tierList.settled();
      expect(await tierList.toast(/could not/i).count(), 'no toast says an image could not be added').toBe(0);
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

      // Load counts for this page only. Once Red has loaded again, a request for Blue would have
      // gone out with it.
      const requestsBefore = other.requests.length;
      await tierList.reload();
      await expect(tierList.imageSitesNotice).toBeVisible();
      await expect.poll(() => tierList.itemImageHasLoaded('Red')).toBe(true);
      await expect(tierList.itemImage('Blue')).toHaveCount(0);
      expect(other.requests.length).toBe(requestsBefore);
    });

    test('renders the image, also after a reload, when the user allows the unknown site for this browser', async ({tierList, page}) => {
      await serveImageSite(page, OTHER, {body: BLUE_SQUARE});
      await tierList.goto(TANKS, listWith([{u: `https://${OTHER}/blue.png`, c: 'Blue'}]));

      await tierList.alwaysAllowImageSites();
      await expect.poll(() => tierList.itemImageHasLoaded('Blue')).toBe(true);

      await tierList.reload();
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
     * The link images machine's events and checks (modelSut). Each run starts as a new
     * browser on the first list. Before each page load the unknown site holds its answers for
     * Blue and Navy again (`held`), until IMAGE_SITE_ANSWERS or IMAGE_SITE_FAILS; it answers
     * Green at once. `loadedAt` counts the unknown site's requests before the last page load,
     * so a state checks only the requests of the page on screen. Page time stands still
     * (`pageTime: 'paused'`), so the page waits for a held answer however long the steps take,
     * until IMAGE_CHECK_TIMES_OUT runs its clock. While the notice waits, no request may reach
     * the unknown site: a state checks that when it shows, and the next step checks it again
     * before it acts, so the check covers the whole time the notice waited.
     */
    const linkImagesSut = (tierList: TierListPage, page: Page, testInfo: TestInfo, otherSite: ImageSite) => {
      let loadedAt = 0;
      let held: HeldImageSite = otherSite.hold(HELD_ADDRESSES);
      const sinceLoad = () => otherSite.requests.slice(loadedAt);
      /** The last state checked showed the notice waiting. */
      let noticeWaited = false;
      /** Before a step acts: if the notice waited, still no request reached the site since the page loaded. */
      const afterWaiting = () => {
        if (noticeWaited) expect(sinceLoad(), `no request should reach ${OTHER_SITE} while its images wait`).toEqual([]);
        noticeWaited = false;
      };
      /** An event's action, after the check of the time the notice waited (afterWaiting). */
      const acting = (action: () => Promise<void>) => async () => {
        afterWaiting();
        await action();
      };
      const load = async (open: (site: HeldImageSite) => Promise<void>) => {
        const before = held;
        loadedAt = otherSite.requests.length;
        held = otherSite.hold(HELD_ADDRESSES);
        await open(held);
        // The page before left its waiting requests behind: their answers reach nothing.
        await before.release();
      };
      return modelSut<LinkImagesSnapshot, LinkImagesEvent>(page, {
        pageTime: 'paused',
        reset: async () => {
          noticeWaited = false;
          await load(() => tierList.openAsNewBrowser(TANKS, FIRST_LIST));
        },
        events: {
          LOAD_IMAGES: acting(() => tierList.loadImagesFromOtherSites()),
          ALWAYS_ALLOW_SITES: acting(() => tierList.alwaysAllowImageSites()),
          ADD_IMAGE_FROM_LINK: acting(() => tierList.addItemFromLinkAndWaitForLink(GREEN.url, GREEN.label)),
          RELOAD: acting(() => load((site) => tierList.reloadWhileImageSiteHeld(site))),
          OPEN_OTHER_LIST: acting(() => load((site) => tierList.gotoWhileImageSiteHeld(TANKS, OTHER_LIST, site))),
          IMAGE_SITE_ANSWERS: acting(() => held.release()),
          IMAGE_SITE_FAILS: acting(() => held.release(NOT_A_PICTURE)),
          IMAGE_CHECK_TIMES_OUT: acting(async () => {
            // The page asked the site when the list opened or the site was allowed, and no page
            // time has passed since: it still waits 1 ms before the time is up.
            await tierList.letTimePass(IMAGE_CHECK_MS - 1);
            await expect(tierList.main, `the page should still wait ${IMAGE_CHECK_MS - 1} ms after it asked`).toHaveAttribute('aria-busy', 'true');
            await tierList.letTimePass(1);
          }),
        },
        states: {
          '*': async (_page, snapshot) => {
            const view = linkImagesViewOf(snapshot);
            const expectLoaded = async (images: readonly LinkImage[]) => {
              for (const image of images) {
                await expect.poll(() => tierList.itemImageHasLoaded(image.label), {message: `${image.label} should load`}).toBe(true);
              }
            };
            const expectLabelTiles = async (images: readonly LinkImage[]) => {
              for (const image of images) {
                await expect(tierList.item(image.label)).toContainText(OTHER_SITE);
                await expect(tierList.itemImage(image.label)).toHaveCount(0);
              }
            };
            if (view.answer === 'answering') {
              await expect.poll(() => held.isHolding(), {message: `${OTHER_SITE} should hold its answer`}).toBe(true);
              await expect(tierList.main, 'the page should be busy while the site has not answered').toHaveAttribute('aria-busy', 'true');
            }
            // Trusted sites load at once, also while the notice waits.
            await expectLoaded(view.trustedImages);
            const otherSiteImages = [...view.heldImages, ...view.addedImages];
            if (view.waiting) {
              await expect(tierList.imageSitesNoticeHosts).toHaveText([OTHER_SITE]);
              await expectLabelTiles(otherSiteImages);
              expect(sinceLoad(), `no request should reach ${OTHER_SITE} while its images wait`).toEqual([]);
              noticeWaited = true;
              return;
            }
            await expect(tierList.imageSitesNotice).toHaveCount(0);
            await expect.poll(sinceLoad).toEqual(expect.arrayContaining(otherSiteImages.map(({url}) => url)));
            // The site answers the images the visitor added at once.
            await expectLoaded(view.addedImages);
            if (view.answer === 'answering' || view.answer === 'failed' || view.answer === 'gaveUp') {
              await expectLabelTiles(view.heldImages);
            } else {
              await expectLoaded(view.heldImages);
            }
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      // While the site holds its answer, the page waits for it (IMAGE_SITE_ANSWERS, IMAGE_SITE_FAILS).
      }, {machine: linkImagesModel.machine, busyIn: awaitsImageSite});
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(linkImagesModel)) {
      test(`renders each state of the link images machine when the user walks every transition (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        await serveImageSite(page, TRUSTED_SITE);
        const otherSite = await serveImageSite(page, OTHER_SITE, {body: BLUE_SQUARE});
        const coverage = await walkModel(linkImagesModel, linkImagesSut(tierList, page, testInfo, otherSite), part);
        await attachCoverage(testInfo, linkImagesModel, coverage, part);
      });
    }
  });

  /**
   * The link dialog machine (tests/machines/link-dialog.ts): "From a link", from the address
   * check to the image check and Add Anyway. Three trusted sites play one address each; before
   * each address is submitted, its site holds the answer until IMAGE_SITE_ANSWERS. Page time
   * stands still (`pageTime: 'paused'`), so the check waits for a held answer however long the
   * steps take, until IMAGE_CHECK_TIMES_OUT runs its clock.
   */
  test.describe('model: link dialog', () => {
    /** Mauga in row S, nothing in Unranked. */
    const LIST = listWith([]);

    /** The link dialog machine's events and checks, run on this test's page (modelSut). */
    const linkDialogSut = (tierList: TierListPage, page: Page, testInfo: TestInfo, sites: Readonly<Record<string, ImageSite>>) => {
      let held: HeldImageSite | null = null;
      const releaseHeld = async () => {
        const hold = held;
        held = null;
        await hold?.release();
      };
      /**
       * The address typed last. Each submit types a new one: a browser that has shown a picture
       * shows it again without asking the site (WebKit does, even across pages), and then no
       * answer is left to hold.
       */
      let submitted: string | null = null;
      let submits = 0;
      /** Submits an address that the site of `image` holds the answer to, and returns once the page has asked for it. */
      const submitHeld = async (image: DialogImage) => {
        await releaseHeld();
        const address = `${image.url}?submit=${++submits}`;
        const hold = sites[image.site].hold([address]);
        held = hold;
        submitted = address;
        await tierList.submitInLinkImageDialog(address, image.name);
        await expect.poll(() => hold.isHolding(), {message: `${image.site} should hold its answer`}).toBe(true);
      };
      const sut = modelSut<LinkDialogSnapshot, LinkDialogEvent>(page, {
        pageTime: 'paused',
        reset: async () => {
          await releaseHeld();
          await tierList.openAfterBlankPage(TANKS, LIST);
        },
        events: {
          OPEN_DIALOG: () => tierList.openLinkImageDialog(),
          CANCEL: () => tierList.closeLinkImageDialog(),
          ENTER_REFUSED_ADDRESS: () => tierList.submitInLinkImageDialog(REFUSED_ADDRESS),
          ENTER_PICTURE_ADDRESS: () => submitHeld(PICTURE),
          ENTER_WEB_PAGE_ADDRESS: () => submitHeld(WEB_PAGE),
          ENTER_LARGE_PICTURE_ADDRESS: () => submitHeld(LARGE_PICTURE),
          IMAGE_SITE_ANSWERS: () => releaseHeld(),
          IMAGE_CHECK_TIMES_OUT: async () => {
            // The page asked the site when the address was submitted, and no page time has passed since.
            await tierList.letTimePass(IMAGE_CHECK_MS - 1);
            await expect(tierList.main, `the page should still wait ${IMAGE_CHECK_MS - 1} ms after it asked`).toHaveAttribute('aria-busy', 'true');
            await tierList.letTimePass(1);
            await expect(linkDialogButton(tierList)).toHaveText('Add Anyway');
            // The site answers late: the page gave up, so nothing changes.
            await releaseHeld();
          },
          ADD_ANYWAY: () => tierList.confirmAddAnyway(),
        },
        states: {
          '*': async (_page, snapshot) => {
            const view = linkDialogViewOf(snapshot);
            if (view.dialog === 'closed') {
              await expect(tierList.linkImageDialog).toHaveCount(0);
              await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
              const {added} = view;
              await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(added ? 1 : 0);
              if (!added) return;
              await expect(tierList.itemIn(tierList.unranked, added.image.name)).toBeVisible();
              if (added.picture) {
                await expect.poll(() => tierList.itemImageHasLoaded(added.image.name), {message: `${added.image.name} should show its picture`}).toBe(true);
              } else {
                await expect(tierList.item(added.image.name)).toContainText(added.image.site);
                await expect(tierList.itemImage(added.image.name)).toHaveCount(0);
              }
              return;
            }
            // The dialog is modal: the rows behind it leave the accessibility tree until it closes.
            await expect(tierList.linkImageDialog).toBeVisible();
            const address = linkDialogAddressField(tierList);
            const button = linkDialogButton(tierList);
            switch (view.dialog) {
              case 'empty':
                await expect(address).toHaveValue('');
                await expect(tierList.linkImageMessage).toHaveCount(0);
                await expect(button).toHaveText('Add Item');
                await expect(button).toBeDisabled();
                return;
              case 'refused':
                await expect(tierList.linkImageMessage).toHaveText(/starts with https:\/\//);
                await expect(address).toHaveAttribute('aria-invalid', 'true');
                await expect(button).toHaveText('Add Item');
                await expect(button).toBeEnabled();
                return;
              case 'checking':
                expect(submitted?.startsWith(`${view.image.url}?submit=`), `the address typed should be ${view.image.url}`).toBe(true);
                await expect(address).toHaveValue(submitted!);
                await expect(tierList.linkImageMessage).toHaveCount(0);
                await expect(button).toHaveText('Checking the image…');
                await expect(button).toBeDisabled();
                expect(held?.isHolding(), 'the site should still hold its answer').toBe(true);
                await expect(tierList.main, 'the page should be busy while the image is checked').toHaveAttribute('aria-busy', 'true');
                return;
              case 'failed':
                await expect(tierList.linkImageMessage).toHaveText(view.message);
                await expect(address).not.toHaveAttribute('aria-invalid', 'true');
                await expect(button).toHaveText('Add Anyway');
                await expect(button).toBeEnabled();
                return;
            }
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      // While the site holds its answer, the page checks the image (IMAGE_SITE_ANSWERS).
      }, {machine: linkDialogModel.machine, busyIn: checksImage});
      return {sut, releaseHeld};
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(linkDialogModel)) {
      test(`renders each step of "From a link" when the user adds, cancels and adds anyway while the image site answers (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const sites = {
          [PICTURE.site]: await serveImageSite(page, PICTURE.site),
          [WEB_PAGE.site]: await serveImageSite(page, WEB_PAGE.site, NOT_A_PICTURE),
          [LARGE_PICTURE.site]: await serveImageSite(page, LARGE_PICTURE.site, {body: noisePng(8193, 1, 1)}),
        };
        const {sut, releaseHeld} = linkDialogSut(tierList, page, testInfo, sites);
        try {
          const coverage = await walkModel(linkDialogModel, sut, part);
          await attachCoverage(testInfo, linkDialogModel, coverage, part);
        } finally {
          await releaseHeld();
        }
      });
    }
  });
});
