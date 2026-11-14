import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, expectTierList, expectTierNames, SHARED_LINKS, test} from '../support/test';
import {hugeTierNameState, rawState, stateFromJson, templateItemCount, v3LinkJson, v3State} from '../support/links';
import {escapeRegExp} from '../support/regexp';
import {BLUE_SQUARE, imageFile, serveImageSite} from '../support/image-sites';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import type {TierListPage} from '../pages/tier-list-page';
import {
  BLUE,
  GONE_HERO,
  MIXED_TITLE,
  MY_CAT,
  OTHER_SITE,
  PACKAGE_ITEMS,
  RED,
  sharedLinkJson,
  sharedLinkModel,
  sharedLinkViewOf,
  TRUSTED_SITE,
  type SharedLinkEvent,
  type SharedLinkSnapshot,
} from '../models/shared-link';

/**
 * Every link people have shared must keep opening exactly as it was shared.
 *
 * The links come from tests/fixtures/shared-links.json. They cover every link format
 * that has shipped (v0, v1 and v2). If one of these tests fails, the app has broken
 * existing links. Fix the app, and never edit the fixture to make the test pass.
 */
test.describe('shared links', () => {
  test.describe('golden links', {tag: '@mobile'}, () => {
    for (const link of SHARED_LINKS) {
      test(`renders "${link.expected.title}" and its rows when the page opens ${link.id} (${link.format})`, async ({tierList}) => {
        await tierList.goto(link.path, link.state);
        await expectTierList(tierList, link.expected);
      });
    }

  });

  test.describe('link preview tags', () => {
    test('renders og:title and og:image of the list when the page opens a shared link', async ({tierList}) => {
      const link = SHARED_LINKS.find((entry) => entry.id === 'link-002')!;
      await tierList.goto(link.path, link.state);

      await expect(tierList.metaTag('og:title'))
        .toHaveAttribute('content', link.expected.title);
      await expect(tierList.metaTag('og:image'))
        .toHaveAttribute('content', new RegExp(escapeRegExp(`/api/og?state=${encodeURIComponent(link.state)}`) + '$'));
    });
  });

  test.describe('unknown items', () => {
    test('renders the label and the placeholder image when the page opens a link with an unknown item id', {tag: '@mobile'}, async ({tierList}) => {
      // For example an image from a set that was removed, or an upload from another device.
      await tierList.goto('/rank/overwatch/tank', rawState({
        tiers: [{i: 'tier-s', n: 'S', t: [{i: 'unknown-item-x', c: 'Mystery'}]}, {i: 'uncategorized', n: '', t: []}],
      }));

      await expect(tierList.itemsIn('S')).toHaveText(['Mystery']);
      await expect.poll(() => tierList.itemImageHasLoaded('Mystery'), {message: 'placeholder image'}).toBe(true);
    });
  });

  // Names that every JavaScript object has. A link may hold them as item ids, and they must work
  // like any other unknown id: a placeholder tile with the stored label, which can be dragged.
  test.describe('item ids named like Object.prototype members', () => {
    for (const id of ['constructor', 'toString', '__proto__']) {
      test(`renders the label and the placeholder image of the item id "${id}" when the page opens a link with it`, async ({tierList, openAsVisitor}) => {
        await tierList.goto('/rank/overwatch/tank', rawState({
          title: 'Odd item ids',
          tiers: [
            {i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-mau.webp'}, {i: id, c: 'Mystery'}, {i: 'k3j9x0a1b', c: 'my cat'}]},
            {i: 'uncategorized', n: '', t: [{i: 'image-overwatch-win.webp'}]},
          ],
        }));

        await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Mystery', 'my cat']);
        await expect.poll(() => tierList.itemImageHasLoaded('Mystery'), {message: 'placeholder image'}).toBe(true);

        // The tile can be dragged like any other, and the next saved link keeps the item.
        await tierList.dragItemToTier('Mystery', 'Unranked');
        await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Winston', 'Mystery']);
        await tierList.rows.renameTier('S', 'Top');
        const visitor = await openAsVisitor(await tierList.shareLink());
        await expect(visitor.itemsIn('Top')).toHaveText(['Mauga', 'my cat']);
        await expect(visitor.itemsIn(visitor.unranked)).toHaveText(['Winston', 'Mystery']);
      });
    }
  });

  // Links that decode but hold data the app never writes, or far more data than any real list.
  // The page still works: it falls back to the template, like a damaged link, or leaves out the
  // part that would break the editor.
  test.describe('links with bad data', () => {
    const unranked = {i: 'uncategorized', n: '', t: [{i: 'image-overwatch-win.webp'}]};
    const badLinks = [
      {
        name: 'a tier name that is an object',
        json: {title: 'Bad tier name', tiers: [{i: 'tier-s', n: {text: 'S'}, t: [{i: 'image-overwatch-mau.webp'}]}, unranked]},
      },
      {
        name: 'a title that is an object',
        json: {title: {text: 'Bad title'}, tiers: [{i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-mau.webp'}]}, unranked]},
      },
      {name: 'no tiers at all', json: {tiers: []}},
    ];
    for (const link of badLinks) {
      test(`renders the title and rows, and no Application error, when the page opens a link with ${link.name}`, async ({tierList}) => {
        await tierList.gotoPageThatMayCrash('/rank/overwatch/tank', stateFromJson(link.json));

        // The page crashed or settled: one look tells which.
        expect(await tierList.crashMessage.isVisible(), 'the page should not crash').toBe(false);
        await expect(tierList.title).toBeVisible();
        await expect(tierList.tiers.first()).toBeVisible();
      });
    }

    test('renders a repeated item once, at its first place, when the page opens a link with the item twice', async ({tierList}) => {
      await tierList.goto('/rank/overwatch/tank', rawState({
        tiers: [
          {i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-mau.webp'}, {i: 'image-overwatch-win.webp'}]},
          {i: 'uncategorized', n: '', t: [{i: 'image-overwatch-mau.webp'}, {i: 'image-overwatch-sig.webp'}]},
        ],
      }));

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Sigma']);
      // Each tile has its own drag id again, so dragging works.
      await tierList.dragItemToTier('Mauga', 'Unranked');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Sigma', 'Mauga']);
    });

    test('renders each drop in its own row when the user drags items into 2 rows with the same id', async ({tierList, openAsVisitor}) => {
      await tierList.goto('/rank/overwatch/tank', rawState({
        tiers: [
          {i: 'tier-s', n: 'S', t: []},
          {i: 'tier-s', n: 'A', t: []},
          {i: 'uncategorized', n: '', t: [{i: 'image-overwatch-mau.webp'}, {i: 'image-overwatch-win.webp'}]},
        ],
      }));

      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
      const visitor = await openAsVisitor(await tierList.shareLink());
      await expect(visitor.itemsIn('S')).toHaveText(['Mauga']);
      await expect(visitor.itemsIn('A')).toHaveText(['Winston']);
    });

    test('renders the template when the page opens a link with a 1,000,000-character row name', async ({tierList}) => {
      // A million characters of tier name in a link of about 2,600 characters.
      await tierList.goto('/rank/overwatch/tank', hugeTierNameState());

      await expect(tierList.title).toHaveText('OVERWATCH - Tank');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(templateItemCount('image-overwatch', 'tank'));
    });

    test('renders the template when the page opens a link with a state parameter that does not decode', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto('/rank/overwatch/tank', 'this-is-not-a-valid-state');

      await expect(tierList.title).toHaveText('OVERWATCH - Tank');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(templateItemCount('image-overwatch', 'tank'));
    });
  });

  test.describe('model', () => {
    const TANKS = '/rank/overwatch/tank';

    /** A browser that opens the shared link: its page and the requests its page sent to OTHER_SITE. */
    interface OpeningBrowser {
      readonly tierList: TierListPage;
      readonly otherSiteRequests: string[];
    }

    /**
     * The shared link machine's events and checks (modelSut). `maker` is this test's
     * page, whose device image store keeps the picture `deviceId` names; `visitor` is a second
     * browser that never stores a picture, so clearing its local storage makes it new again.
     * Each run starts in the maker's browser on the shared link. `loadedAt` counts the requests
     * to OTHER_SITE before the last page load, so a state checks only the page on screen.
     */
    const sharedLinkSut = (maker: OpeningBrowser, visitor: OpeningBrowser, deviceId: string, page: Page, testInfo: TestInfo) => {
      const shared = v3State(sharedLinkJson('asShared', deviceId));
      let current = maker;
      let loadedAt = 0;
      const openIn = async (browser: OpeningBrowser, open: () => Promise<void>) => {
        current = browser;
        loadedAt = browser.otherSiteRequests.length;
        await open();
      };
      const sinceLoad = () => current.otherSiteRequests.slice(loadedAt);
      return modelSut<SharedLinkSnapshot, SharedLinkEvent>(page, {
        pages: () => [visitor.tierList.page],
        reset: () => openIn(maker, () => maker.tierList.openAfterBlankPage(TANKS, shared)),
        events: {
          OPEN_IN_MAKER_BROWSER: () => openIn(maker, () => maker.tierList.openAfterBlankPage(TANKS, shared)),
          OPEN_IN_NEW_BROWSER: () => openIn(visitor, () => visitor.tierList.openAsNewBrowser(TANKS, shared)),
          LOAD_IMAGES: () => current.tierList.linkImages.loadImagesFromOtherSites(),
          DRAG_BLUE_TO_ROW_B: () => current.tierList.dragItemToTierWhenReady(BLUE.label, 'B'),
          BROWSER_BACK: () => current.tierList.goBack(),
        },
        states: {
          '*': async (_page, snapshot) => {
            const view = sharedLinkViewOf(snapshot);
            const {tierList} = current;
            await expect(tierList.title).toHaveText(MIXED_TITLE);
            await expectTierNames(tierList, view.rows.map((row) => row.name));
            for (const row of view.rows) {
              await expect.poll(() => tierList.itemNamesIn(row.name), {message: `items in ${row.name}`}).toEqual(row.items);
            }
            // The round trip: every link holds each custom item exactly as the shared link wrote it.
            await expect.poll(() => v3LinkJson(tierList.page.url()), {message: 'the link in the address bar'})
              .toEqual(sharedLinkJson(view.list, deviceId));
            // Image-set items and the trusted site load at once, also while the notice waits.
            for (const label of [...PACKAGE_ITEMS, RED.label]) {
              await expect.poll(() => tierList.itemImageHasLoaded(label), {message: `${label} should load`}).toBe(true);
            }
            await expect.poll(() => tierList.itemShowsPlaceholder(GONE_HERO.label), {message: `${GONE_HERO.label} should show the placeholder`}).toBe(true);
            if (view.deviceImageKept) {
              await expect.poll(() => tierList.deviceImages.itemShowsUpload(MY_CAT), {message: `${MY_CAT} should show its picture`}).toBe(true);
            } else {
              await expect.poll(() => tierList.itemShowsPlaceholder(MY_CAT), {message: `${MY_CAT} should show the placeholder`}).toBe(true);
              expect(await tierList.deviceImages.itemShowsUpload(MY_CAT), `a new browser has no picture for ${MY_CAT}`).toBe(false);
            }
            if (view.waiting) {
              await expect(tierList.linkImages.imageSitesNoticeHosts).toHaveText([OTHER_SITE]);
              await expect(tierList.item(BLUE.label)).toContainText(OTHER_SITE);
              await expect(tierList.itemImage(BLUE.label)).toHaveCount(0);
              expect(sinceLoad(), `no request should reach ${OTHER_SITE} while its images wait`).toEqual([]);
            } else {
              await expect(tierList.linkImages.imageSitesNotice).toHaveCount(0);
              await expect.poll(() => tierList.itemImageHasLoaded(BLUE.label), {message: `${BLUE.label} should load`}).toBe(true);
              await expect.poll(sinceLoad).toContain(BLUE.url);
            }
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(sharedLinkModel)) {
      test(`renders each state of the shared link machine when the user walks every transition (${part.name})`, async ({tierList, page, baseURL, openAsVisitor}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        await serveImageSite(page, TRUSTED_SITE);
        const makerSite = await serveImageSite(page, OTHER_SITE, {body: BLUE_SQUARE});
        // The maker's browser keeps a picture: the device image store gives it its id.
        await tierList.goto('/rank');
        await tierList.deviceImages.addItemsFromDeviceAndWaitForLink([imageFile('my-cat.png')]);
        const [, deviceId] = /"d":"([A-Za-z0-9_-]+)"/.exec(JSON.stringify(v3LinkJson(await tierList.shareLink()))) ?? [];
        expect(deviceId, 'the upload should be a device image in the link').toBeTruthy();
        let visitorRequests: string[] = [];
        const visitorPage = await openAsVisitor(new URL(`${TANKS}?state=${v3State(sharedLinkJson('asShared', deviceId))}`, baseURL).href, {
          beforeOpen: async (context) => {
            await serveImageSite(context, TRUSTED_SITE);
            visitorRequests = (await serveImageSite(context, OTHER_SITE, {body: BLUE_SQUARE})).requests;
          },
        });
        const maker = {tierList, otherSiteRequests: makerSite.requests};
        const visitor = {tierList: visitorPage, otherSiteRequests: visitorRequests};
        const coverage = await walkModel(sharedLinkModel, sharedLinkSut(maker, visitor, deviceId, page, testInfo), part);
        await attachCoverage(testInfo, sharedLinkModel, coverage, part);
      });
    }
  });
});
