/** The one-time tips for first-time visitors (components/EditorTips.tsx, lib/tips/tips.ts). */
import type {Locator, Page, TestInfo} from '@playwright/test';
import {createPlaywrightSut} from '@xstate/test/playwright';
import {expect, test} from '../support/test';
import {rankingState} from '../support/links';
import {imageFile} from '../support/image-sites';
import {attachAndAssertCoverage, walkModel, MODEL_CAMPAIGN_TIMEOUT} from '../support/machines';
import type {TierListPage} from '../pages/tier-list-page';
import type {SitePage} from '../pages/site-page';
import {TIP_IDS, tipsEditorState, tipsModel, type StoredTips, type TipsEvent, type TipsSnapshot} from '../machines/tips';
import {
  sharedListEditorState,
  tipsSharedListModel,
  type TipsSharedListEvent,
  type TipsSharedListSnapshot,
} from '../machines/tips-shared-list';
import {
  FIRST_DRAG_KEYBOARD,
  FIRST_DRAG_MOUSE,
  FIRST_DRAG_TOUCH,
  LINK_SAVE_TITLE,
  Tips,
} from '../pages/tips';

const TANKS = '/rank/overwatch/tank';
/** A friend's list: Mauga in S, the other tanks in Unranked. */
const SHARED = rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}, 'Tanks by a friend');

// Every other spec runs with the tips off (tests/support/test.ts).
test.use({tips: true});

test.describe('tips', () => {
  test.describe('first drag', () => {
    test('renders the first-drag tip in place of "Drag to reorder." when the page opens a template', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);

      await expect(tips.firstDragWords(FIRST_DRAG_MOUSE)).toBeVisible();
      await expect(tips.firstDrag).toContainText(`${FIRST_DRAG_MOUSE}${FIRST_DRAG_KEYBOARD}.`);
      await expect(tierList.hints).toBeHidden();
      await expect(tips.closeButton).toBeVisible();
      await expect(tips.hideTipsButton()).toBeVisible();
    });

    test('renders the touch wording of the first-drag tip when the page opens a template on a touch screen', {tag: '@mobile'}, async ({tierList, isMobile}) => {
      test.skip(!isMobile, 'The touch wording shows on touch screens.');
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);

      await expect(tips.firstDragWords(FIRST_DRAG_TOUCH)).toBeVisible();
      await expect(tips.firstDragWords(FIRST_DRAG_MOUSE)).toBeHidden();
    });

    test('renders "Drag to reorder." again and no first-drag tip after a reload when the user drops an item in row S', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);
      await expect(tips.firstDrag).toBeVisible();

      await tierList.dragItemToTier('Mauga', 'S');
      await expect(tips.firstDrag).toBeHidden();
      await expect(tierList.hints).toBeVisible();

      await tierList.reload();
      await tierList.dragItemToTier('Mauga', 'Unranked');
      await expect(tierList.hints).toBeVisible();
      await expect(tips.firstDrag).toBeHidden();
    });

    test('renders no first-drag tip after a reload when the user closed it', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);
      await tips.close();
      await expect(tierList.hints).toBeVisible();

      await tierList.reload();
      await expect.poll(() => tips.stored()).toEqual({seen: ['first-drag'], off: false});
      await expect(tierList.hints).toBeVisible();
      await expect(tips.firstDrag).toBeHidden();
    });

    test('writes tips off to otb-tips and renders no tip after changes when the user presses Hide tips', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);
      await tips.hideTips();
      expect(await tips.stored()).toEqual({seen: [], off: true});

      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.reload();
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tips.all).toHaveCount(0);
    });

    test('renders no first-drag tip when the user turns on Zen', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);
      await expect(tips.firstDrag).toBeVisible();

      await tierList.setZenMode(true);
      await expect(tips.firstDrag).toBeHidden();
      await tierList.setZenMode(false);
      await expect(tips.firstDrag).toBeVisible();
    });

    test('renders the same Freeze Frame picture as a browser with tips off when the first-drag tip is on screen', async ({tierList, openAsVisitor}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);
      await expect(tips.firstDrag).toBeVisible();
      await tierList.capturePreview();
      const withTip = await tierList.capturedImageDetails();

      const visitor = await openAsVisitor(TANKS, {beforeOpen: (context) => Tips.turnOffIn(context)});
      await expect(visitor.hints).toBeVisible();
      await visitor.capturePreview();
      const withoutTip = await visitor.capturedImageDetails();

      expect({width: withTip.width, height: withTip.height, colors: withTip.distinctColors})
        .toEqual({width: withoutTip.width, height: withoutTip.height, colors: withoutTip.distinctColors});
      await expect(tips.firstDrag).toBeVisible();
    });
  });

  test.describe('link is the save', () => {
    test('renders the toast and a ring on the button "Share" when the user drops the first item in row S', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);
      await expect(tips.firstDrag).toBeVisible();
      const plain = await tips.ringOf(tips.shareButton);

      await tierList.dragItemToTier('Mauga', 'S');

      await expect(tips.linkSaveToast).toContainText(LINK_SAVE_TITLE);
      await expect(tips.linkSaveToast).toContainText('Bookmark this page, or press Share to copy its link. Back undoes a change.');
      await expect.poll(() => tips.ringOf(tips.shareButton)).not.toBe(plain);
      await expect(tips.firstDrag).toBeHidden();

      await tips.closeToast(tips.linkSaveToast);
      await expect.poll(() => tips.ringOf(tips.shareButton)).toBe(plain);
    });

    test('renders the share panel when the user presses Share in the toast', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);
      await tierList.dragItemToTier('Mauga', 'S');

      await tips.linkSaveToast.getByRole('button', {name: 'Share', exact: true}).click();

      await expect(tierList.sharePanel).toBeVisible();
      await expect(tips.linkSaveToast).toBeHidden();
    });

    test('writes link-save as seen and renders no second toast when the user makes a second change after closing it', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);
      await tierList.dragItemToTier('Mauga', 'S');
      await tips.closeToast(tips.linkSaveToast);
      await expect.poll(() => tips.stored()).toEqual({seen: ['first-drag', 'link-save'], off: false});

      await tierList.reload();
      await tierList.dragItemToTier('Winston', 'A');

      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
      await expect(tips.linkSaveToast).toHaveCount(0);
    });
  });

  test.describe('shared list', () => {
    test('renders the shared-list tip under the title when the page opens a shared link', {tag: '@mobile'}, async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS, SHARED);

      await expect(tips.sharedList).toBeVisible();
      const title = (await tierList.title.boundingBox())!;
      const tip = (await tips.sharedList.boundingBox())!;
      expect(tip.y).toBeGreaterThanOrEqual(title.y + title.height);
      expect(tip.y).toBeLessThan((await tierList.tier('S').boundingBox())!.y);
    });

    test('renders no shared-list tip and the link-save toast when the user makes the first change', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS, SHARED);
      await expect(tips.sharedList).toBeVisible();

      await tierList.dragItemToTier('Winston', 'B');

      await expect(tips.sharedList).toBeHidden();
      await expect(tips.linkSaveToast).toBeVisible();
      await expect(tips.all).toHaveCount(1);
    });

    test('renders no shared-list tip when the page opens a second shared link after the user closed it', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS, SHARED);
      await tips.close();
      await expect(tips.sharedList).toBeHidden();

      await tierList.goto(TANKS, rankingState('image-overwatch', {A: ['Mauga']}, 'Another list'));
      await expect(tierList.title).toHaveText('Another list');
      await expect.poll(() => tips.stored()).toEqual({seen: ['shared-list'], off: false});
      await expect(tips.sharedList).toBeHidden();
    });

    // Only a link opened fresh (a full page load, as from a chat app) is someone else's list: a
    // list reached by a move inside OpenTierBoy is the visitor's own (their images dropped on the
    // home page, a Freeze Frame they opened, Recently viewed).
    test('writes no shared-list tip as seen when the user opens a list from Recently viewed and drops an item', async ({tierList, site}) => {
      const tips = new Tips(tierList.page);
      await tierList.storeBeforeLoad('otb-tips', JSON.stringify({seen: [], off: false}));
      await tierList.storeBeforeLoad('otb-recent-links', JSON.stringify({
        version: 1,
        links: [{path: TANKS, state: SHARED, title: 'Tanks by a friend', openedAt: 1, pinned: false}],
      }));
      await site.gotoHome();

      await site.recentLink('Tanks by a friend').click();
      await expect(tierList.title).toHaveText('Tanks by a friend');
      await expect(tips.sharedList).toBeHidden();
      // A shared-list tip that showed would be seen, and the first change ends it.
      await tierList.dragItemToTier('Winston', 'B');
      await expect(tips.linkSaveToast).toBeVisible();

      expect(await tips.stored()).toEqual({seen: ['first-drag', 'link-save'], off: false});
    });

    test('renders no shared-list tip when the page opens a link after this browser made a change', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);
      await tierList.dragItemToTier('Mauga', 'S');
      await expect(tips.linkSaveToast).toBeVisible();

      await tierList.goto(TANKS, SHARED);
      await expect(tierList.title).toHaveText('Tanks by a friend');
      // A tip that showed would be seen.
      await expect.poll(() => tips.stored()).toEqual({seen: ['first-drag', 'link-save'], off: false});
      await expect(tips.sharedList).toBeHidden();
    });
  });

  test.describe('link and history', () => {
    test('writes 1 history entry, for the drop only, when the user closes a tip, drops an item and hides tips', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS, SHARED);
      const link = tierList.page.url();
      const newEntries = await tierList.countNewHistoryEntries();
      const historyLength = await tierList.historyLength();

      await tips.close();
      await tierList.dragItemToTier('Winston', 'Unranked');
      const changed = tierList.page.url();
      await expect(tips.linkSaveToast).toBeVisible();
      await tips.hideTips(tips.linkSaveToast);

      expect(await newEntries()).toBe(1);
      expect(await tierList.historyLength()).toBe(historyLength + 1);
      expect(changed).not.toBe(link);
      await expect(tierList.page).toHaveURL(changed);
    });
  });

  test.describe('own images', () => {
    test('renders the own-images toast after the link-save toast when the user uploads the first image', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto('/rank');
      await tierList.addItemsFromDevice([imageFile('red-square.png')]);

      await expect(tips.linkSaveToast).toBeVisible();
      await expect(tips.deviceImagesToast).toHaveCount(0);
      await tips.closeToast(tips.linkSaveToast);

      await expect(tips.deviceImagesToast).toContainText('A link shares their names; a downloaded Freeze Frame shares the images too.');
      await expect(tips.all).toHaveCount(1);
      await tips.closeToast(tips.deviceImagesToast);
      // The upload is in Unranked and nothing is ranked: the first-drag tip comes last.
      await expect(tips.firstDrag).toBeVisible();
    });
  });

  test.describe('returning browsers', () => {
    test('writes tips off and renders no tip when the browser has Recently viewed entries', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.storeBeforeLoad('otb-recent-links', JSON.stringify({
        version: 1,
        links: [{path: TANKS, state: '', title: 'OVERWATCH - Tank', openedAt: 1, pinned: false}],
      }));
      await tierList.goto(TANKS);

      await expect.poll(() => tips.stored()).toEqual({seen: [], off: true});
      await expect(tierList.hints).toBeVisible();
      await expect(tips.all).toHaveCount(0);
    });

    test('writes tips off when the browser has a saved font', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.storeBeforeLoad('otb-font', 'classic');
      await tierList.goto(TANKS);

      await expect.poll(() => tips.stored()).toEqual({seen: [], off: true});
      await expect(tierList.hints).toBeVisible();
    });

    test('renders the first-drag tip again when the user turns the tips on again on About after Hide tips', async ({tierList}) => {
      const tips = new Tips(tierList.page);
      await tierList.goto(TANKS);
      await tips.hideTips();

      await tips.showTipsAgainOnAbout();
      await tierList.goto(TANKS);

      await expect(tips.firstDrag).toBeVisible();
      expect(await tips.stored()).toEqual({seen: [], off: false});
    });
  });

  test.describe('model', () => {
    /** `otb-tips` with the seen tips in the order of TIP_IDS, as the machines keep them. */
    const storedInOrder = async (tips: Tips): Promise<StoredTips | null> => {
      const stored = await tips.stored();
      return stored && {seen: TIP_IDS.filter((id) => stored.seen.includes(id)), off: stored.off};
    };

    /** The tip on screen (or none) and what `otb-tips` holds, in the editor or on About. */
    const expectTips = async (tips: Tips, shown: Locator | null, stored: StoredTips) => {
      if (shown) await expect(shown).toBeVisible();
      await expect(tips.all).toHaveCount(shown ? 1 : 0);
      await expect.poll(() => storedInOrder(tips)).toEqual(stored);
    };

    /**
     * The tips machine's events and checks (createPlaywrightSut). Each run starts as a new
     * browser on the template; the page clock lets a toast time out without waiting 10 s.
     */
    const tipsSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      const tips = new Tips(page);
      let changes = 0;
      return createPlaywrightSut<Page, TipsSnapshot, TipsEvent>(page, {
        reset: async () => {
          await tips.forgetThisBrowser();
          await tierList.goto(TANKS);
        },
        events: {
          OPEN_TEMPLATE: () => tierList.goto(TANKS),
          OPEN_EMPTY_LIST: () => tierList.goto('/rank'),
          DROP_IN_ROW: () => tierList.dragFirstUnrankedItemToTier('S'),
          CHANGE_TITLE: () => tierList.setTitle(`My tanks ${++changes}`),
          ADD_DEVICE_IMAGE: () => tierList.addItemsFromDeviceAndWaitForLink([imageFile(`picture-${++changes}.png`)]),
          CLOSE_TIP: () => tips.close(),
          CLOSE_TOAST: () => tips.closeTipToast(),
          TOAST_TIMES_OUT: () => tips.waitOutTipToast(),
          HIDE_TIPS: () => tips.hideTips(),
          SHOW_TIPS_AGAIN: () => tips.showTipsAgainOnAbout(),
        },
        states: {
          about: async (_page, snapshot) => {
            await expect.poll(() => storedInOrder(tips)).toEqual({seen: snapshot.context.seen, off: false});
          },
          '*': async (_page, snapshot) => {
            const state = tipsEditorState(snapshot);
            const shown = state === 'firstDragTip' ? tips.firstDrag
              : state === 'linkSaveToast' ? tips.linkSaveToast
                : state === 'deviceImagesToast' ? tips.deviceImagesToast
                  : null;
            await expectTips(tips, shown, {seen: snapshot.context.seen, off: state === 'tipsOff'});
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    /** The shared-list machine's events and checks. Each run starts as a new browser on the friend's link. */
    const sharedListSut = (tierList: TierListPage, site: SitePage, page: Page, testInfo: TestInfo) => {
      const tips = new Tips(page);
      let changes = 0;
      return createPlaywrightSut<Page, TipsSharedListSnapshot, TipsSharedListEvent>(page, {
        reset: async () => {
          await tips.forgetThisBrowser();
          await tierList.goto(TANKS, SHARED);
        },
        events: {
          OPEN_SHARED_LINK: () => tierList.goto(TANKS, SHARED),
          OPEN_FROM_RECENTLY_VIEWED: () => site.openRecentLink('Tanks by a friend'),
          CHANGE_TITLE: () => tierList.setTitle(`My tanks ${++changes}`),
          CLOSE_TIP: () => tips.close(),
          CLOSE_TOAST: () => tips.closeTipToast(),
          HIDE_TIPS: () => tips.hideTips(),
          SHOW_TIPS_AGAIN: () => tips.showTipsAgainOnAbout(),
        },
        states: {
          about: async (_page, snapshot) => {
            await expect.poll(() => storedInOrder(tips)).toEqual({seen: snapshot.context.seen, off: false});
          },
          '*': async (_page, snapshot) => {
            const state = sharedListEditorState(snapshot);
            const shown = state === 'sharedListTip' ? tips.sharedList : state === 'linkSaveToast' ? tips.linkSaveToast : null;
            await expectTips(tips, shown, {seen: snapshot.context.seen, off: state === 'tipsOff'});
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test('renders each state of the tips machine when the user walks its seeded runs from a new browser', async ({tierList, page}, testInfo) => {
      test.setTimeout(MODEL_CAMPAIGN_TIMEOUT);
      // Before the first page opens, so TOAST_TIMES_OUT can run the page clock.
      await page.clock.install();
      const coverage = await walkModel(tipsModel, tipsSut(tierList, page, testInfo));
      await attachAndAssertCoverage(testInfo, tipsModel, coverage);
    });

    // No page clock here: Playwright's clock gives the page no navigation entry
    // (performance.getEntriesByType('navigation') is empty), so the shared-list tip never shows.
    test('renders each state of the shared-list tip machine when the user walks its seeded runs from a friend\'s link', async ({tierList, site, page}, testInfo) => {
      test.setTimeout(MODEL_CAMPAIGN_TIMEOUT);
      const coverage = await walkModel(tipsSharedListModel, sharedListSut(tierList, site, page, testInfo));
      await attachAndAssertCoverage(testInfo, tipsSharedListModel, coverage);
    });
  });
});
