import {expect, test} from '../support/test';
import {rankingState} from '../support/links';
import type {LayoutParam, TierListPage, ZenLayoutName} from '../pages/tier-list-page';

const TANKS = '/rank/overwatch/tank';
const TRAY = ['Mauga', 'Winston', 'Sigma', 'Orisa'];
/** Three items ranked in S, and four in Unranked. */
const LIST = rankingState('image-overwatch', {S: ['Reinhardt', 'Zarya', 'D.Va'], '': TRAY});
/** Fifteen items in Unranked: more than one line of queue in any frame. */
const LONG_TRAY = ['Ana', 'Ashe', 'Wrecking Ball', 'Baptiste', 'Bastion', 'Brigitte', 'Doomfist', 'Echo', 'Genji', 'Hanzo', 'Roadhog', 'Hazard', 'Illari', 'Junker Queen', 'Juno'];
const LONG_LIST = rankingState('image-overwatch', {'': LONG_TRAY});

const FULL_HD = {width: 1920, height: 1080};
const PORTRAIT_FULL_HD = {width: 1080, height: 1920};

/**
 * Drags an item by hand (real mouse input, one press) to the end of a row. Checks that it lands
 * there and that the link gained exactly one history entry. `entries` counts the new history
 * entries since the test started (TierListPage.countNewHistoryEntries).
 */
async function dropByHand(tierList: TierListPage, entries: () => Promise<number>, item: string, tier: string) {
  const before = await entries();
  await tierList.dragItemToTierByHand(item, tier);
  await expect(tierList.itemsIn(tier).last()).toHaveAccessibleName(item);
  expect(await entries()).toBe(before + 1);
}

/** Drags the item up next (In order or Shuffle) by hand to a row, as dropByHand does. Returns its name. */
async function dropUpNextByHand(tierList: TierListPage, entries: () => Promise<number>, tier: string): Promise<string> {
  const item = await tierList.upNextItemName();
  await dropByHand(tierList, entries, item, tier);
  await expect(tierList.upNextItem).not.toHaveAccessibleName(item);
  return item;
}

test.describe('zen layouts', () => {
  test.describe('entering and leaving', () => {
    test.use({viewport: FULL_HD});

    test('renders the 16:9 frame over the window and no site header when the user chooses 16:9 in Zen', async ({tierList, page}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      await expect(tierList.layoutButton).toHaveAccessibleName('Layout: Editor');
      await expect(tierList.zenFrame).toHaveCount(0);

      await tierList.chooseLayout('16:9');

      await expect(tierList.zenFrame).toHaveAccessibleName('Frame 16:9');
      expect(await tierList.sizeOf(tierList.zenFrame)).toEqual(FULL_HD);
      await expect(page.getByRole('banner')).toBeHidden();
      await expect(tierList.editorTools).toBeHidden();
      await expect(tierList.title).toBeVisible();
      await expect(tierList.zenBar.getByRole('button')).toHaveCount(5);
    });

    test('renders the editor and no frame when the user chooses Editor after 16:9', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      await tierList.chooseLayout('16:9');

      await tierList.chooseLayout('Editor');

      await expect(tierList.zenFrame).toHaveCount(0);
      await expect(tierList.zenBar).toBeVisible();
      await expect(tierList.zenWordmark).toBeVisible();
    });

    test('renders the site header and the editor tools, and the frame again in Zen, when the user exits Zen in 16:9', async ({tierList, page}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      await tierList.chooseLayout('16:9');

      await tierList.setZenMode(false);

      await expect(tierList.zenFrame).toHaveCount(0);
      await expect(page.getByRole('banner')).toBeVisible();
      await expect(tierList.editorTools).toBeVisible();

      await tierList.setZenMode(true);
      await expect(tierList.zenFrame).toHaveAccessibleName('Frame 16:9');
    });

    test('renders the editor and no frame when the user presses Escape in the overlay', async ({tierList, page}) => {
      await tierList.gotoInLayout(TANKS, LIST, 'overlay-green');
      await expect(tierList.zenFrame).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(tierList.zenFrame).toHaveCount(0);
      await expect(tierList.zenBar).toHaveCount(0);
      await expect(tierList.editorTools).toBeVisible();
    });

    test('renders the frame in Zen with no toast when the page opens with the layout parameter 16x9', async ({tierList, page}) => {
      await tierList.gotoInLayout(TANKS, LIST, '16x9');

      await expect(tierList.zenFrame).toHaveAccessibleName('Frame 16:9');
      await expect(tierList.layoutButton).toHaveAccessibleName('Layout: 16:9');
      await expect(page.getByRole('banner')).toBeHidden();
      await expect(tierList.toast('Entered Zen Mode')).toHaveCount(0);
    });
  });

  test.describe('16:9', () => {
    test.use({viewport: FULL_HD});

    test('renders 120 px tiles, 76 px tier letters and a 68 px title when the window is 1920 x 1080', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '16x9');

      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 120, height: 120});
      expect(await tierList.sizeOf(tierList.item('Mauga'))).toEqual({width: 120, height: 120});
      await expect(tierList.tierLabel('S')).toHaveCSS('font-size', '76px');
      await expect(tierList.title).toHaveCSS('font-size', '68px');
    });

    test('renders the frame and its tiles at half size when the window is 960 x 540', async ({tierList, page}) => {
      await page.setViewportSize({width: 960, height: 540});
      await tierList.gotoInLayout(TANKS, LIST, '16x9');

      expect(await tierList.sizeOf(tierList.zenFrame)).toEqual({width: 960, height: 540});
      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 60, height: 60});
      await expect(tierList.tierLabel('S')).toHaveCSS('font-size', '38px');
    });

    test('renders the item up next at 136 px and the queue after it at 120 px when the user chooses In order', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '16x9');

      await tierList.chooseRankingOrder('In order');

      await expect(tierList.upNextItem).toHaveAccessibleName('Mauga');
      expect(await tierList.sizeOf(tierList.upNextItem)).toEqual({width: 136, height: 136});
      await expect(tierList.queueItems).toHaveText(['Winston', 'Sigma', 'Orisa']);
      expect(await tierList.sizeOf(tierList.queueItems.first())).toEqual({width: 120, height: 120});
    });

    test('renders 12 items in the queue when 15 items are left', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LONG_LIST, '16x9');

      await tierList.chooseRankingOrder('In order');

      await expect(tierList.upNextItem).toHaveAccessibleName('Ana');
      await expect(tierList.queueItems).toHaveText(LONG_TRAY.slice(1, 13));
      await expect(tierList.unranked.getByText('15 left', {exact: true})).toBeVisible();
    });

    test('renders the next item up next when the user drags the item up next to row A', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '16x9');
      await tierList.chooseRankingOrder('In order');

      await tierList.dragItemToTier('Mauga', 'A');

      await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
      await expect(tierList.upNextItem).toHaveAccessibleName('Winston');
      await expect(tierList.zenFrame).toBeVisible();
    });

    test('renders no wordmark when the user turns off Wordmark, and the wordmark when the user turns it on', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '16x9');
      await expect(tierList.zenWordmark).toBeVisible();

      await tierList.setWordmarkShown(false);
      await expect(tierList.zenWordmark).toBeHidden();

      await tierList.setWordmarkShown(true);
      await expect(tierList.zenWordmark).toBeVisible();
    });

    test('renders 120 px tiles when the tile size is Compact', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.chooseTileSize('Compact');
      await tierList.setZenMode(true);

      await tierList.chooseLayout('16:9');

      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 120, height: 120});
      await expect(tierList.itemsIn('S').first()).toContainText('Reinhardt');
    });
  });

  test.describe('9:16', () => {
    test.use({viewport: PORTRAIT_FULL_HD});

    test('renders the 9:16 frame, 120 px tiles and 64 px tier letters when the window is 1080 x 1920', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '9x16');

      await expect(tierList.zenFrame).toHaveAccessibleName('Frame 9:16');
      expect(await tierList.sizeOf(tierList.zenFrame)).toEqual(PORTRAIT_FULL_HD);
      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 120, height: 120});
      await expect(tierList.tierLabel('S')).toHaveCSS('font-size', '64px');
    });

    test('renders the item up next at 380 px with its name under it when the user chooses In order', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '9x16');

      await tierList.chooseRankingOrder('In order');

      await expect(tierList.upNextItem).toHaveAccessibleName('Mauga');
      expect(await tierList.sizeOf(tierList.upNextItem)).toEqual({width: 380, height: 380});
      await expect(tierList.unranked.getByText('Mauga', {exact: true})).toHaveCSS('font-size', '56px');
      await expect(tierList.queueItems).toHaveText(['Winston', 'Sigma', 'Orisa']);
    });

    test('renders 160 px tiles in the Unranked tray when the ranking order is Pick freely', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '9x16');

      expect(await tierList.sizeOf(tierList.item('Mauga'))).toEqual({width: 160, height: 160});
      await expect(tierList.unranked.getByText('· 4 left')).toBeVisible();
    });

    test('renders the Zen bar at the bottom of the frame when the layout is 9:16', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '9x16');
      await tierList.wakeZenBar();

      const bar = await tierList.zenBar.boundingBox();
      expect(bar && bar.y + bar.height).toBeGreaterThan(PORTRAIT_FULL_HD.height - 200);
      expect(bar && bar.height).toBe(72);
    });
  });

  test.describe('phones', () => {
    test('renders the 9:16 frame as wide as the phone when a phone opens the layout parameter 9x16', {tag: '@mobile'}, async ({tierList, page}) => {
      await tierList.gotoInLayout(TANKS, LIST, '9x16');

      const viewport = page.viewportSize();
      if (!viewport) throw new Error('No viewport');
      const frame = await tierList.sizeOf(tierList.zenFrame);
      const expected = Math.min(viewport.width, viewport.height * 9 / 16);
      expect(Math.abs(frame.width - expected)).toBeLessThanOrEqual(1);
      expect(Math.abs(frame.height - expected * 16 / 9)).toBeLessThanOrEqual(2);
      await expect(tierList.item('Reinhardt')).toBeVisible();
    });
  });

  test.describe('stream overlay', () => {
    test.use({viewport: FULL_HD});

    test('renders the list in a 780 px panel over the green key when the user chooses Overlay · green key', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);

      await tierList.chooseLayout('Overlay · green key');

      expect((await tierList.frameBackdrop()).cover).toBe('rgb(0, 177, 64)');
      expect((await tierList.sizeOf(tierList.tier('S'))).width).toBe(780 - 2 * 24);
      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 96, height: 96});
      await expect(tierList.tierLabel('S')).toHaveCSS('font-size', '48px');
    });

    test('renders no background behind the panel, on the page or on <html> when the user chooses Overlay · transparent', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);

      await tierList.chooseLayout('Overlay · transparent');

      expect(await tierList.frameBackdrop()).toEqual({cover: 'rgba(0, 0, 0, 0)', body: 'rgba(0, 0, 0, 0)', html: 'rgba(0, 0, 0, 0)'});
    });

    test('renders the page background again when the user chooses 16:9 after Overlay · transparent', async ({tierList, page}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      await tierList.chooseLayout('Overlay · transparent');

      await tierList.chooseLayout('16:9');

      expect((await tierList.frameBackdrop()).body).not.toBe('rgba(0, 0, 0, 0)');
      await tierList.setZenMode(false);
      await expect(page.getByRole('banner')).toBeVisible();
    });

    test('renders no background when the page opens with the layout parameter overlay-transparent', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, 'overlay-transparent');

      await expect(tierList.layoutButton).toHaveAccessibleName('Layout: Overlay · transparent');
      expect(await tierList.frameBackdrop()).toEqual({cover: 'rgba(0, 0, 0, 0)', body: 'rgba(0, 0, 0, 0)', html: 'rgba(0, 0, 0, 0)'});
    });

    test('renders the item up next and 2 more at 72 px when the user chooses In order', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, 'overlay-green');

      await tierList.chooseRankingOrder('In order');

      await expect(tierList.upNextItem).toHaveAccessibleName('Mauga');
      expect(await tierList.sizeOf(tierList.upNextItem)).toEqual({width: 72, height: 72});
      // The overlay's strip has no labels on its tiles; each tile keeps its name.
      await expect(tierList.queueItems).toHaveCount(2);
      await expect(tierList.queueItems.nth(0)).toHaveAccessibleName('Winston');
      await expect(tierList.queueItems.nth(1)).toHaveAccessibleName('Sigma');
    });

    test('writes the page address with the layout parameter to the clipboard when the user clicks Copy link for OBS', async ({
      tierList, page, openAsVisitor,
    }) => {
      await tierList.readCopiedText();
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      await tierList.chooseLayout('Overlay · transparent');

      await tierList.openLayoutMenu();
      await tierList.copyOverlayLinkMenuItem.click();

      await expect(tierList.toast('Link for OBS copied')).toBeVisible();
      const link = await tierList.clipboardText();
      expect(link).toBe(`${page.url()}&layout=overlay-transparent`);
      const visitor = await openAsVisitor(link);
      await expect(visitor.zenFrame).toHaveAccessibleName('Frame 16:9');
      await expect(visitor.itemsIn('S')).toHaveText(['Reinhardt', 'Zarya', 'D.Va']);
    });

    test('renders menu item "Copy link for OBS" unavailable when the layout is 16:9', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      await tierList.chooseLayout('16:9');

      await tierList.openLayoutMenu();

      await expect(tierList.copyOverlayLinkMenuItem).toHaveAttribute('aria-disabled', 'true');
    });
  });

  test.describe('menus', () => {
    test.use({viewport: FULL_HD});

    test('renders only menu Layout when the user clicks button Layout while menu Ranking order is open', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      await tierList.openRankingOrderMenu();
      await expect(tierList.openMenus).toHaveCount(1);

      await tierList.clickZenBarMenuButtonOverOpenMenu('Layout');

      await expect(tierList.openMenus).toHaveCount(1);
      await expect(tierList.openMenus).toHaveAccessibleName('Layout: Editor');
    });

    test('renders only menu Ranking order, and no menu after Escape, when the user clicks it while menu Layout is open', {tag: '@mobile'}, async ({
      tierList, page,
    }) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      await tierList.openLayoutMenu();

      await tierList.clickZenBarMenuButtonOverOpenMenu('Ranking order');

      await expect(tierList.openMenus).toHaveCount(1);
      await expect(tierList.openMenus).toHaveAccessibleName('Ranking order: Pick freely');
      await expect(page.getByRole('menuitemradio', {name: 'In order'})).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(tierList.openMenus).toHaveCount(0);
      await expect(tierList.zenBar).toBeVisible();
    });
  });

  // Real mouse input: one press per drag, as a person drags (TierListPage.dragItemToTierByHand).
  // The item up next is one tile that changes items after each drop; it must take every drag.
  test.describe('mouse drags', () => {
    test.use({viewport: FULL_HD});

    for (const layout of ['Editor', '16:9', '9:16', 'Overlay · green key', 'Overlay · transparent'] as const satisfies readonly ZenLayoutName[]) {
      test(`renders the item in its row and writes 1 history entry per drop when the user drags the item up next twice in ${layout}`, async ({
        tierList,
      }) => {
        await tierList.goto(TANKS, LIST);
        await tierList.setZenMode(true);
        await tierList.chooseRankingOrder('In order');
        if (layout !== 'Editor') await tierList.chooseLayout(layout);
        const entries = await tierList.countNewHistoryEntries();

        expect(await dropUpNextByHand(tierList, entries, 'S')).toBe('Mauga');
        expect(await dropUpNextByHand(tierList, entries, 'A')).toBe('Winston');

        expect(await entries()).toBe(2);
        await expect(tierList.itemsIn('S')).toHaveText(['Reinhardt', 'Zarya', 'D.Va', 'Mauga']);
      });
    }

    test('renders each item in its row and writes 1 history entry per drop when the user drags after each layout change', async ({tierList}) => {
      await tierList.goto(TANKS, LONG_LIST);
      await tierList.setZenMode(true);
      await tierList.chooseRankingOrder('In order');
      const entries = await tierList.countNewHistoryEntries();

      const steps = [['16:9', 'S'], ['9:16', 'A'], ['Overlay · green key', 'B'], ['Overlay · transparent', 'C'], ['Editor', 'F']] as const;
      for (const [layout, tier] of steps) {
        await tierList.chooseLayout(layout);
        await dropUpNextByHand(tierList, entries, tier);
      }

      expect(await entries()).toBe(steps.length);
      await expect(tierList.unranked.getByText(`${LONG_TRAY.length - steps.length} left`)).toBeVisible();
    });

    for (const layout of ['16x9', '9x16', 'overlay-green', 'overlay-transparent'] as const satisfies readonly LayoutParam[]) {
      test(`renders the item in its row and writes 1 history entry per drop when the user drags twice after opening layout ${layout}`, async ({
        tierList,
      }) => {
        await tierList.gotoInLayout(TANKS, LIST, layout);
        await tierList.chooseRankingOrder('In order');
        const entries = await tierList.countNewHistoryEntries();

        await dropUpNextByHand(tierList, entries, 'A');
        await dropUpNextByHand(tierList, entries, 'B');

        await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
        await expect(tierList.itemsIn('B')).toHaveText(['Winston']);
        await expect(tierList.zenFrame).toBeVisible();
      });
    }

    test('renders the item in its row and writes 1 history entry per drop when the user drags with Compact tiles in Zen and 16:9', async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, LONG_LIST);
      await tierList.chooseTileSize('Compact');
      await tierList.setZenMode(true);
      await tierList.chooseRankingOrder('In order');
      const entries = await tierList.countNewHistoryEntries();

      await dropUpNextByHand(tierList, entries, 'S');
      await dropUpNextByHand(tierList, entries, 'A');
      await tierList.chooseLayout('16:9');
      await dropUpNextByHand(tierList, entries, 'B');
      await tierList.chooseLayout('Editor');
      await dropUpNextByHand(tierList, entries, 'C');

      expect(await entries()).toBe(4);
    });

    test('renders the items in rows S and A and writes 1 history entry per drop when the user drags 2 Unranked items in 9:16', async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      await tierList.chooseLayout('9:16');
      await expect(tierList.rankingOrderButton).toHaveAccessibleName('Ranking order: Pick freely');
      const entries = await tierList.countNewHistoryEntries();

      await dropByHand(tierList, entries, 'Sigma', 'S');
      await dropByHand(tierList, entries, 'Winston', 'A');

      await expect(tierList.itemsIn('Unranked')).toHaveText(['Mauga', 'Orisa']);
    });

    for (const order of ['In order', 'Shuffle'] as const) {
      test(`renders the item in its row and writes 1 history entry per drop when the user drags twice with ranking ${order} in 9:16`, async ({
        tierList,
      }) => {
        await tierList.goto(TANKS, LIST);
        await tierList.setZenMode(true);
        await tierList.chooseLayout('9:16');
        await tierList.chooseRankingOrder(order);
        const entries = await tierList.countNewHistoryEntries();

        const first = await dropUpNextByHand(tierList, entries, 'A');
        const second = await dropUpNextByHand(tierList, entries, 'B');

        expect(TRAY).toEqual(expect.arrayContaining([first, second]));
        await expect(tierList.unranked.getByText('2 left')).toBeVisible();
      });
    }

    test('renders the items in row F and writes 1 history entry per move when the user moves them with keys after a layout change', async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      await tierList.chooseRankingOrder('In order');
      await tierList.chooseLayout('16:9');
      const entries = await tierList.countNewHistoryEntries();
      await tierList.moveItemWithKeyboard('Mauga', ['ArrowUp']);
      expect(await entries()).toBe(1);

      await tierList.chooseLayout('9:16');
      await tierList.moveItemWithKeyboard('Winston', ['ArrowUp']);

      await expect(tierList.itemsIn('F')).toHaveText(['Mauga', 'Winston']);
      expect(await entries()).toBe(2);
    });
  });

  test.describe('history', () => {
    test.use({viewport: FULL_HD});

    test('writes no history entry and leaves the address as it is when the user chooses each layout and turns Wordmark off', async ({
      tierList, page,
    }) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      const address = page.url();
      const newEntries = await tierList.countNewHistoryEntries();

      for (const layout of ['16:9', '9:16', 'Overlay · green key', 'Overlay · transparent', 'Editor'] as const) {
        await tierList.chooseLayout(layout);
      }
      await tierList.setWordmarkShown(false);

      expect(await newEntries()).toBe(0);
      expect(page.url()).toBe(address);
      await expect(tierList.zenStepCount).toHaveText('1 / 1');
    });

    test('writes the link without the layout parameter and renders the frame when the user drags an item after opening it', async ({
      tierList, page,
    }) => {
      await tierList.gotoInLayout(TANKS, LIST, 'overlay-green');

      await tierList.dragItemToTier('Mauga', 'A');

      expect(new URL(page.url()).searchParams.has('layout')).toBe(false);
      await expect(tierList.zenFrame).toBeVisible();
      await tierList.stepInZenBar('Back');
      await expect(tierList.itemsIn('A')).toHaveCount(0);
      await expect(tierList.zenFrame).toBeVisible();
    });
  });
});
