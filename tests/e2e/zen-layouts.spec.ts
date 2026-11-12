import type {Page, TestInfo} from '@playwright/test';
import {createPlaywrightSut} from '@xstate/test/playwright';
import {expect, test} from '../support/test';
import {packageItemId, rankingState, rawState} from '../support/links';
import {attachAndAssertCoverage, walkModel, MODEL_CAMPAIGN_TIMEOUT} from '../support/machines';
import type {TierListPage, ZenLayoutName} from '../pages/tier-list-page';
import {layoutOf, ZEN_LAYOUT_NAMES, zenLayoutModel, type ZenLayoutEvent, type ZenLayoutSnapshot} from '../models/zen-layout';

const TANKS = '/rank/overwatch/tank';
const TRAY = ['Mauga', 'Winston', 'Sigma', 'Orisa'];
/** Three items ranked in S, and four in Unranked. */
const LIST = rankingState('image-overwatch', {S: ['Reinhardt', 'Zarya', 'D.Va'], '': TRAY});
/** Fifteen items in Unranked: more than one line of queue in any frame. */
const LONG_TRAY = ['Ana', 'Ashe', 'Wrecking Ball', 'Baptiste', 'Bastion', 'Brigitte', 'Doomfist', 'Echo', 'Genji', 'Hanzo', 'Roadhog', 'Hazard', 'Illari', 'Junker Queen', 'Juno'];
const LONG_LIST = rankingState('image-overwatch', {'': LONG_TRAY});
/** Every THE FINALS item (77) in Unranked: a full template. */
const FULL_TEMPLATE = '/rank/the-finals/all';
/** 19 ranked rows, R1 to R19 (taller than any frame holds), and the four tray items in Unranked. */
const ROW_NAMES = Array.from({length: 19}, (_, index) => `R${index + 1}`);
const NINETEEN_ROWS = rawState({tiers: [
  ...ROW_NAMES.map((name) => ({i: `row-${name}`, n: name, t: []})),
  {i: 'uncategorized', n: '', t: TRAY.map((label) => ({i: packageItemId('image-overwatch', label)}))},
]});

/** The creator layouts: each draws the list in a frame, under a strip that holds the Zen bar. */
const CREATOR_LAYOUTS = ['16:9', '9:16', 'Overlay · green key'] as const satisfies readonly ZenLayoutName[];

/**
 * The frames, and the strip above each one in frame pixels (lib/zen/layouts.ts). A frame pixel
 * is a CSS pixel when the window is as wide as the frame and as high as the frame and the strip
 * together (owner decision, 2026-11-01).
 */
const FULL_HD = {width: 1920, height: 1080};
const PORTRAIT_FULL_HD = {width: 1080, height: 1920};
const WIDE_STRIP = 88;
const TALL_STRIP = 104;
const WIDE_WINDOW = {width: 1920, height: 1080 + WIDE_STRIP};
const TALL_WINDOW = {width: 1080, height: 1920 + TALL_STRIP};
const WINDOWS: Record<typeof CREATOR_LAYOUTS[number], {width: number; height: number}> = {
  '16:9': WIDE_WINDOW,
  '9:16': TALL_WINDOW,
  'Overlay · green key': WIDE_WINDOW,
};

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
    test.use({viewport: WIDE_WINDOW});

    test('renders the 16:9 frame under the Zen bar and no site header when the user chooses 16:9 in Zen', async ({tierList, page}) => {
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
      await expect(tierList.zenWordmark).toBeVisible();
      await expect(tierList.zenBar.getByRole('button')).toHaveCount(5);
    });

    test('renders the editor and no frame when the user chooses Editor after 16:9', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '16:9');

      await tierList.chooseLayout('Editor');

      await expect(tierList.zenFrame).toHaveCount(0);
      await expect(tierList.zenBar).toBeVisible();
      await expect(tierList.zenWordmark).toBeVisible();
    });

    test('renders the site header and the editor tools, and the frame again in Zen, when the user exits Zen in 16:9', async ({tierList, page}) => {
      await tierList.gotoInLayout(TANKS, LIST, '16:9');

      await tierList.setZenMode(false);

      await expect(tierList.zenFrame).toHaveCount(0);
      await expect(page.getByRole('banner')).toBeVisible();
      await expect(tierList.editorTools).toBeVisible();

      await tierList.setZenMode(true);
      await expect(tierList.zenFrame).toHaveAccessibleName('Frame 16:9');
    });

    test('renders the editor and no frame when the user presses Escape in the overlay', async ({tierList, page}) => {
      await tierList.gotoInLayout(TANKS, LIST, 'Overlay · green key');
      await expect(tierList.zenFrame).toBeVisible();
      // A click on the green key first: the Layout menu gave focus back to its button, and an
      // Escape there would close the button's tooltip first.
      await tierList.clickFrameCorner();

      await page.keyboard.press('Escape');

      await expect(tierList.zenFrame).toHaveCount(0);
      await expect(tierList.zenBar).toHaveCount(0);
      await expect(tierList.editorTools).toBeVisible();
    });

    // Owner decision, 2026-11-01: no address opens a layout; layouts are view settings in memory.
    test('renders the editor with no Zen bar or frame when the page opens an address with layout=16x9', async ({tierList, page}) => {
      await tierList.gotoAddress(`${TANKS}?state=${LIST}&layout=16x9`);

      await expect(tierList.editorTools).toBeVisible();
      await expect(page.getByRole('banner')).toBeVisible();
      await expect(tierList.zenBar).toHaveCount(0);
      await expect(tierList.zenFrame).toHaveCount(0);
      await expect(tierList.zenModeToggle).toHaveAttribute('aria-pressed', 'false');
    });
  });

  test.describe('Layout menu', () => {
    // Owner decisions, 2026-11-01: no "Copy link for OBS", no transparent overlay, no Wordmark switch.
    test('renders menu items Editor, 16:9, 9:16 and Overlay · green key, and no other, when the user opens menu Layout', {tag: '@mobile'}, async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);

      const menu = await tierList.openLayoutMenu();

      await expect(tierList.menuItems(menu)).toHaveText(['Editor', '16:9', '9:16', 'Overlay · green key']);
    });
  });

  // Owner decisions, 2026-11-01: the Zen bar is always shown, in a strip above the frame at the
  // top centre, and never covers the list.
  test.describe('Zen bar', () => {
    for (const layout of CREATOR_LAYOUTS) {
      test(`renders the Zen bar above the frame at the top centre, overlapping no title, row or item, when the user chooses ${layout}`, async ({
        tierList, page,
      }) => {
        await page.setViewportSize(WINDOWS[layout]);
        await tierList.gotoInLayout(TANKS, LIST, layout);
        await tierList.chooseRankingOrder('In order');

        expect(await tierList.listPartsUnderZenBar()).toEqual([]);
        const bar = (await tierList.zenBar.boundingBox())!;
        const frame = (await tierList.zenFrame.boundingBox())!;
        expect(bar.y + bar.height).toBeLessThanOrEqual(frame.y);
        expect(Math.abs(bar.x + bar.width / 2 - (frame.x + frame.width / 2))).toBeLessThan(2);
      });
    }

    test('renders the Zen bar 72 px high and the frame at 1080 x 1920 under it when the window is 1080 x 2024 in 9:16', async ({tierList, page}) => {
      await page.setViewportSize(TALL_WINDOW);
      await tierList.gotoInLayout(TANKS, LIST, '9:16');

      expect((await tierList.sizeOf(tierList.zenBar)).height).toBe(72);
      expect(await tierList.sizeOf(tierList.zenFrame)).toEqual(PORTRAIT_FULL_HD);
    });

    test('renders the Zen bar opaque and clickable when the mouse rests for 10 seconds in 16:9', async ({tierList, page}) => {
      await page.clock.install();
      await page.setViewportSize(WIDE_WINDOW);
      await tierList.gotoInLayout(TANKS, LIST, '16:9');
      await page.mouse.move(20, 600);

      await tierList.letTimePass(10_000);

      await expect(tierList.zenBar).toHaveCSS('pointer-events', 'auto');
      await expect(tierList.zenBar).toHaveCSS('opacity', '1');
    });
  });

  test.describe('16:9', () => {
    test.use({viewport: WIDE_WINDOW});

    test('renders 120 px tiles, 76 px tier letters, a 60 px row handle and a 68 px title when the window is 1920 x 1168', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '16:9');

      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 120, height: 120});
      expect(await tierList.sizeOf(tierList.item('Mauga'))).toEqual({width: 120, height: 120});
      expect((await tierList.sizeOf(tierList.rowHandle('S'))).width).toBe(60);
      await expect(tierList.tierLabel('S')).toHaveCSS('font-size', '76px');
      await expect(tierList.title).toHaveCSS('font-size', '68px');
    });

    test('renders the frame and its tiles at half size when the window is 960 x 584', async ({tierList, page}) => {
      await page.setViewportSize({width: 960, height: 584});
      await tierList.gotoInLayout(TANKS, LIST, '16:9');

      expect(await tierList.sizeOf(tierList.zenFrame)).toEqual({width: 960, height: 540});
      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 60, height: 60});
      await expect(tierList.tierLabel('S')).toHaveCSS('font-size', '38px');
    });

    test('renders the item up next at 136 px and the queue after it at 120 px when the user chooses In order', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '16:9');

      await tierList.chooseRankingOrder('In order');

      await expect(tierList.upNextItem).toHaveAccessibleName('Mauga');
      expect(await tierList.sizeOf(tierList.upNextItem)).toEqual({width: 136, height: 136});
      await expect(tierList.queueItems).toHaveText(['Winston', 'Sigma', 'Orisa']);
      expect(await tierList.sizeOf(tierList.queueItems.first())).toEqual({width: 120, height: 120});
    });

    test('renders 12 items in the queue when 15 items are left', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LONG_LIST, '16:9');

      await tierList.chooseRankingOrder('In order');

      await expect(tierList.upNextItem).toHaveAccessibleName('Ana');
      await expect(tierList.queueItems).toHaveText(LONG_TRAY.slice(1, 13));
      await expect(tierList.unranked.getByText('15 left', {exact: true})).toBeVisible();
    });

    test('renders the next item up next when the user drags the item up next to row A', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '16:9');
      await tierList.chooseRankingOrder('In order');

      await tierList.dragItemToTier('Mauga', 'A');

      await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
      await expect(tierList.upNextItem).toHaveAccessibleName('Winston');
      await expect(tierList.zenFrame).toBeVisible();
    });

    test('renders 120 px tiles when the tile size is Compact', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.chooseTileSize('Compact');
      await tierList.setZenMode(true);

      await tierList.chooseLayout('16:9');

      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 120, height: 120});
    });

    // Owner decision, 2026-11-01: the frame keeps its size for recording; the tray scrolls.
    test('renders the frame at 1920 x 1080 with a scrolling Unranked tray when the list has 77 items in Pick freely', async ({tierList}) => {
      await tierList.goto(FULL_TEMPLATE);
      await tierList.setZenMode(true);

      await tierList.chooseLayout('16:9');

      expect(await tierList.sizeOf(tierList.zenFrame)).toEqual(FULL_HD);
      expect(await tierList.frameOverflows()).toBe(false);
      expect(await tierList.unrankedItemsScroll()).toBe(true);
      // The rows keep their size: a tile and the row's 1 px border.
      expect(await tierList.sizeOf(tierList.tier('S'))).toEqual({width: 1920 - 2 * 72, height: 121});
    });

    test('writes 1 history entry and renders the item in row S when the user drags the last of 77 Unranked items to row S', async ({tierList}) => {
      await tierList.goto(FULL_TEMPLATE);
      await tierList.setZenMode(true);
      await tierList.chooseLayout('16:9');
      const last = (await tierList.itemsIn(tierList.unranked).last().getAttribute('aria-label'))!;
      const entries = await tierList.countNewHistoryEntries();

      await dropByHand(tierList, entries, last, 'S');

      expect(await entries()).toBe(1);
      expect(await tierList.sizeOf(tierList.zenFrame)).toEqual(FULL_HD);
    });
  });

  // Owner decision, 2026-11-01: no creator layout scrolls its frame or the cover around it.
  // The part under the rows (the tray, or Up next and the queue) takes the space left and
  // scrolls; the rows keep their size. When the rows alone are taller than the frame, the rows
  // scroll inside it.
  test.describe('long lists', () => {
    for (const order of ['Pick freely', 'In order', 'Shuffle'] as const) {
      test(`renders the 9:16 frame at 1080 x 1920 with no overflow when the list has 77 items with ranking ${order}`, async ({tierList, page}) => {
        await page.setViewportSize(TALL_WINDOW);
        await tierList.gotoInLayout(FULL_TEMPLATE, undefined, '9:16');

        if (order !== 'Pick freely') await tierList.chooseRankingOrder(order);

        expect(await tierList.sizeOf(tierList.zenFrame)).toEqual(PORTRAIT_FULL_HD);
        expect(await tierList.frameOverflows()).toBe(false);
        expect((await tierList.sizeOf(tierList.tier('S'))).height).toBe(121);
        if (order === 'Pick freely') expect(await tierList.unrankedItemsScroll()).toBe(true);
      });

      test(`writes 1 history entry per drop when the user drags 2 of 77 items into rows in 9:16 with ranking ${order}`, async ({tierList, page}) => {
        await page.setViewportSize(TALL_WINDOW);
        await tierList.gotoInLayout(FULL_TEMPLATE, undefined, '9:16');
        if (order !== 'Pick freely') await tierList.chooseRankingOrder(order);
        const entries = await tierList.countNewHistoryEntries();

        if (order === 'Pick freely') {
          await dropByHand(tierList, entries, (await tierList.itemsIn(tierList.unranked).last().getAttribute('aria-label'))!, 'S');
          await dropByHand(tierList, entries, (await tierList.itemsIn(tierList.unranked).nth(60).getAttribute('aria-label'))!, 'F');
        } else {
          await dropUpNextByHand(tierList, entries, 'S');
          await dropUpNextByHand(tierList, entries, 'F');
        }

        expect(await entries()).toBe(2);
        expect(await tierList.sizeOf(tierList.zenFrame)).toEqual(PORTRAIT_FULL_HD);
        expect(await tierList.frameOverflows()).toBe(false);
      });
    }

    test('renders the panel within the frame and a scrolling Unranked tray when the list has 77 items in the overlay', async ({tierList, page}) => {
      await page.setViewportSize(WIDE_WINDOW);
      await tierList.gotoInLayout(FULL_TEMPLATE, undefined, 'Overlay · green key');

      expect(await tierList.sizeOf(tierList.zenFrame)).toEqual(FULL_HD);
      expect(await tierList.frameOverflows()).toBe(false);
      expect(await tierList.unrankedItemsScroll()).toBe(true);
      const frame = (await tierList.zenFrame.boundingBox())!;
      const tray = (await tierList.unranked.boundingBox())!;
      // The panel keeps its 40 px margin to the frame's bottom, and its 24 px padding.
      expect(tray.y + tray.height).toBeLessThanOrEqual(frame.y + frame.height - 40 - 24 + 1);
      expect((await tierList.sizeOf(tierList.tier('S'))).height).toBe(97);
    });

    test('writes 1 history entry and renders the item in row S when the user drags the 71st of 77 items to row S in the overlay', async ({
      tierList, page,
    }) => {
      await page.setViewportSize(WIDE_WINDOW);
      await tierList.gotoInLayout(FULL_TEMPLATE, undefined, 'Overlay · green key');
      // The first tile of the tray's last line: at its left, clear of the "Entered Zen Mode" toast.
      const item = (await tierList.itemsIn(tierList.unranked).nth(70).getAttribute('aria-label'))!;
      const entries = await tierList.countNewHistoryEntries();

      await dropByHand(tierList, entries, item, 'S');

      expect(await entries()).toBe(1);
      expect(await tierList.frameOverflows()).toBe(false);
      expect(await tierList.frameCoverColour()).toBe('rgb(0, 177, 64)');
    });

    for (const layout of CREATOR_LAYOUTS) {
      test(`renders the frame with no overflow and scrolling rows when the list has 19 rows in ${layout}`, async ({tierList, page}) => {
        await page.setViewportSize(WINDOWS[layout]);
        await tierList.gotoInLayout(TANKS, NINETEEN_ROWS, layout);

        expect(await tierList.frameOverflows()).toBe(false);
        expect(await tierList.rowsScroll()).toBe(true);
        await expect(tierList.item('Mauga')).toBeInViewport();
      });

      test(`writes 1 history entry and renders the item in row R19 when the user drags it there with 19 rows in ${layout}`, async ({
        tierList, page,
      }) => {
        await page.setViewportSize(WINDOWS[layout]);
        await tierList.gotoInLayout(TANKS, NINETEEN_ROWS, layout);
        const entries = await tierList.countNewHistoryEntries();

        await dropByHand(tierList, entries, 'Mauga', 'R19');

        expect(await entries()).toBe(1);
        expect(await tierList.frameOverflows()).toBe(false);
      });
    }
  });

  test.describe('9:16', () => {
    test.use({viewport: TALL_WINDOW});

    test('renders the 9:16 frame, 120 px tiles, a 60 px row handle and 64 px tier letters when the window is 1080 x 2024', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '9:16');

      await expect(tierList.zenFrame).toHaveAccessibleName('Frame 9:16');
      expect(await tierList.sizeOf(tierList.zenFrame)).toEqual(PORTRAIT_FULL_HD);
      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 120, height: 120});
      expect((await tierList.sizeOf(tierList.rowHandle('S'))).width).toBe(60);
      await expect(tierList.tierLabel('S')).toHaveCSS('font-size', '64px');
    });

    // Owner decision, 2026-11-01: one and a half tiles, its name in proportion.
    test('renders the item up next at 180 px with its name under it at 28 px when the user chooses In order', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '9:16');

      await tierList.chooseRankingOrder('In order');

      await expect(tierList.upNextItem).toHaveAccessibleName('Mauga');
      expect(await tierList.sizeOf(tierList.upNextItem)).toEqual({width: 180, height: 180});
      await expect(tierList.unranked.getByText('Mauga', {exact: true})).toHaveCSS('font-size', '28px');
      await expect(tierList.queueItems).toHaveText(['Winston', 'Sigma', 'Orisa']);
      expect(await tierList.sizeOf(tierList.zenFrame)).toEqual(PORTRAIT_FULL_HD);
    });

    test('renders 160 px tiles in the Unranked tray when the ranking order is Pick freely', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, '9:16');

      expect(await tierList.sizeOf(tierList.item('Mauga'))).toEqual({width: 160, height: 160});
      await expect(tierList.unranked.getByText('· 4 left')).toBeVisible();
    });
  });

  test.describe('phones', () => {
    test('renders the 9:16 frame and the strip above it as large as the phone allows when the user chooses 9:16', {tag: '@mobile'}, async ({
      tierList, page,
    }) => {
      await tierList.gotoInLayout(TANKS, LIST, '9:16');

      const viewport = page.viewportSize();
      if (!viewport) throw new Error('No viewport');
      const frame = await tierList.sizeOf(tierList.zenFrame);
      const expected = Math.min(viewport.width, viewport.height * 1080 / (1920 + TALL_STRIP));
      expect(Math.abs(frame.width - expected)).toBeLessThanOrEqual(1);
      expect(Math.abs(frame.height - expected * 16 / 9)).toBeLessThanOrEqual(2);
      await expect(tierList.item('Reinhardt')).toBeVisible();
      expect(await tierList.listPartsUnderZenBar()).toEqual([]);
    });
  });

  test.describe('stream overlay', () => {
    test.use({viewport: WIDE_WINDOW});

    test('renders the list in a 780 px panel over the green key when the user chooses Overlay · green key', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, 'Overlay · green key');

      expect(await tierList.frameCoverColour()).toBe('rgb(0, 177, 64)');
      expect((await tierList.sizeOf(tierList.tier('S'))).width).toBe(780 - 2 * 24);
      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 96, height: 96});
      expect((await tierList.sizeOf(tierList.rowHandle('S'))).width).toBe(48);
      await expect(tierList.tierLabel('S')).toHaveCSS('font-size', '48px');
    });

    test('renders the item up next and 2 more at 72 px when the user chooses In order', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, 'Overlay · green key');

      await tierList.chooseRankingOrder('In order');

      await expect(tierList.upNextItem).toHaveAccessibleName('Mauga');
      expect(await tierList.sizeOf(tierList.upNextItem)).toEqual({width: 72, height: 72});
      // The overlay's strip has no labels on its tiles; each tile keeps its name.
      await expect(tierList.queueItems).toHaveCount(2);
      await expect(tierList.queueItems.nth(0)).toHaveAccessibleName('Winston');
      await expect(tierList.queueItems.nth(1)).toHaveAccessibleName('Sigma');
    });
  });

  // Owner decision, 2026-11-01: rows move in every creator layout, as in the editor. Labels stay
  // in place: dropping row S on A's place moves the contents (product rule 6).
  test.describe('moving rows', () => {
    for (const layout of CREATOR_LAYOUTS) {
      test(`writes 1 history entry and renders the items of row S in row A when the user drags row S onto row A in ${layout}`, async ({
        tierList, page,
      }) => {
        await page.setViewportSize(WINDOWS[layout]);
        await tierList.gotoInLayout(TANKS, LIST, layout);
        const entries = await tierList.countNewHistoryEntries();

        await tierList.dragTierOnto('S', 'A');

        await expect(tierList.itemsIn('A')).toHaveText(['Reinhardt', 'Zarya', 'D.Va']);
        await expect(tierList.itemsIn('S')).toHaveCount(0);
        expect(await entries()).toBe(1);
        await expect(tierList.zenFrame).toBeVisible();
      });

      test(`writes 1 history entry and renders the items of row S in row B when the user moves row S down twice by keyboard in ${layout}`, async ({
        tierList, page,
      }) => {
        await page.setViewportSize(WINDOWS[layout]);
        await tierList.gotoInLayout(TANKS, LIST, layout);
        const entries = await tierList.countNewHistoryEntries();

        await tierList.moveTierWithKeyboard('S', ['ArrowDown', 'ArrowDown']);

        await expect(tierList.itemsIn('B')).toHaveText(['Reinhardt', 'Zarya', 'D.Va']);
        await expect(tierList.itemsIn('S')).toHaveCount(0);
        expect(await entries()).toBe(1);
      });
    }
  });

  test.describe('menus', () => {
    test.use({viewport: WIDE_WINDOW});

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
    test.use({viewport: WIDE_WINDOW});

    for (const layout of ['Editor', ...CREATOR_LAYOUTS] as const satisfies readonly ZenLayoutName[]) {
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

      const steps = [['16:9', 'S'], ['9:16', 'A'], ['Overlay · green key', 'B'], ['Editor', 'C']] as const;
      for (const [layout, tier] of steps) {
        await tierList.chooseLayout(layout);
        await dropUpNextByHand(tierList, entries, tier);
      }

      expect(await entries()).toBe(steps.length);
      await expect(tierList.unranked.getByText(`${LONG_TRAY.length - steps.length} left`)).toBeVisible();
    });

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
    test.use({viewport: WIDE_WINDOW});

    test('writes no history entry and leaves the address as it is when the user chooses each layout', async ({tierList, page}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.setZenMode(true);
      const address = page.url();
      const newEntries = await tierList.countNewHistoryEntries();

      for (const layout of [...CREATOR_LAYOUTS, 'Editor'] as const) {
        await tierList.chooseLayout(layout);
      }

      expect(await newEntries()).toBe(0);
      expect(page.url()).toBe(address);
      await expect(tierList.zenStepCount).toHaveText('1 / 1');
    });

    test('renders the frame and the list before the drag when the user drags an item in the overlay and clicks button "Back"', async ({tierList}) => {
      await tierList.gotoInLayout(TANKS, LIST, 'Overlay · green key');

      await tierList.dragItemToTier('Mauga', 'A');

      await expect(tierList.zenFrame).toBeVisible();
      await tierList.stepInZenBar('Back');
      await expect(tierList.itemsIn('A')).toHaveCount(0);
      await expect(tierList.zenFrame).toBeVisible();
    });
  });

  // Model-based tests (tests/README.md, "Model-based tests"): tests/machines/zen-layout.ts walked
  // through the Playwright adapter of @xstate/test.
  test.describe('model', () => {
    /** The Zen layout machine's events and checks, run on this test's page (createPlaywrightSut). */
    const zenLayoutSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => createPlaywrightSut<Page, ZenLayoutSnapshot, ZenLayoutEvent>(page, {
      reset: () => tierList.goto(TANKS, LIST),
      events: {
        TOGGLE_ZEN: () => tierList.setZenMode(true),
        EXIT_ZEN: () => tierList.setZenMode(false),
        PRESS_ESCAPE: () => tierList.pressEscapeOnList(),
        CHOOSE_EDITOR: () => tierList.chooseLayout(ZEN_LAYOUT_NAMES.editor),
        CHOOSE_WIDE: () => tierList.chooseLayout(ZEN_LAYOUT_NAMES.wide),
        CHOOSE_TALL: () => tierList.chooseLayout(ZEN_LAYOUT_NAMES.tall),
        CHOOSE_OVERLAY: () => tierList.chooseLayout(ZEN_LAYOUT_NAMES.overlay),
      },
      states: {
        '*': async (_page, snapshot) => {
          const layout = layoutOf(snapshot);
          if (layout) {
            await expect(tierList.layoutButton).toHaveAccessibleName(`Layout: ${ZEN_LAYOUT_NAMES[layout]}`);
          } else {
            await expect(tierList.zenBar).toHaveCount(0);
          }
        },
      },
      testInfo,
      step: (name, body) => test.step(name, body),
    });

    test('renders each state of the Zen layout machine when the user walks every transition', async ({tierList, page}, testInfo) => {
      test.setTimeout(MODEL_CAMPAIGN_TIMEOUT);
      const coverage = await walkModel(zenLayoutModel, zenLayoutSut(tierList, page, testInfo));
      await attachAndAssertCoverage(testInfo, zenLayoutModel, coverage);
    });
  });
});
