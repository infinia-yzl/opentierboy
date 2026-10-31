/** The one-time tips for first-time visitors (components/EditorTips.tsx, lib/tips/tips.ts). */
import {expect, test} from '../support/test';
import {rankingState} from '../support/links';
import {imageFile} from '../support/image-sites';
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

      await expect(tips.deviceImagesToast).toContainText('A link shares their names; a Freeze Frame shares the images too.');
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
});
