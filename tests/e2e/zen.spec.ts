import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, test} from '../support/test';
import {SCRIPTED_PASTE_SKIP, type TierListPage} from '../pages/tier-list-page';
import {imageFile, serveImageSite} from '../support/image-sites';
import {rankingState} from '../support/links';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {
  orderOf, queueHiddenIn, RANKING_ORDER_NAMES, zenOrderModel, type ZenOrderEvent, type ZenOrderSnapshot,
} from '../models/zen-order';
import {MAX_ZEN_STEPS, zenStepsModel, zenStepsViewOf, type ZenStepsEvent, type ZenStepsSnapshot} from '../models/zen-steps';

const TANKS = '/rank/overwatch/tank';
const TRAY = ['Mauga', 'Winston', 'Sigma', 'Orisa'];
/** A list with four items in Unranked and none ranked. */
const TRAY_STATE = rankingState('image-overwatch', {'': TRAY});
/** A title that runs across the title row, under where the Zen bar used to float. */
const LONG_TITLE = 'Every tank hero in OVERWATCH, ranked from the best pick to the worst one this season';
/** The ranked rows of the tank template, top to bottom. */
const ALL_RANKED_ROWS = ['S', 'A', 'B', 'C', 'F'];
/** The rows the tray's items go to, one each, in the order they are ranked. */
const RANKED_ROWS = ALL_RANKED_ROWS.slice(0, TRAY.length);

test.describe('zen', () => {
  test('renders no button "Add row", "Row options", "Add images" or "Share" when the user turns on Zen', {tag: '@mobile'}, async ({
    tierList,
  }) => {
    await tierList.goto(TANKS);
    const toolbar = [tierList.addRowButton, tierList.rowOptionsButton, tierList.manageItemsButton, tierList.shareButton];

    await tierList.zen.setZenMode(true);

    await expect(tierList.toast('Entered Zen Mode')).toBeVisible();
    for (const button of toolbar) {
      await expect(button).toBeHidden();
    }
    await expect(tierList.item('Mauga')).toBeVisible();

    await tierList.zen.setZenMode(false);

    for (const button of toolbar) {
      await expect(button).toBeVisible();
    }
  });

  test('renders no menu item "Delete" in the item menu when the user turns on Zen', async ({tierList}) => {
    await tierList.goto(TANKS);
    await tierList.zen.setZenMode(true);

    await tierList.item('Mauga').click({button: 'right'});
    await expect(tierList.menuItem('Delete')).toHaveCount(0);

    await tierList.zen.setZenMode(false);
    await tierList.item('Mauga').click({button: 'right'});
    await expect(tierList.menuItem('Delete')).toBeVisible();
  });

  // Zen turns off adding and removing items (its toast says so). Dropped and pasted links add
  // nothing in Zen, and the drop overlay stays away. Dropped and pasted picture files are added in
  // Zen, as they were before links could be dropped.
  test.describe('dropping and pasting', () => {
    test('renders no drop overlay when the user drags a link over the editor in Zen', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.zen.setZenMode(true);

      await tierList.linkImages.dragLinkOver('https://i.imgur.com/red.png');
      // The overlay would stay until the drag ends: turning Zen off first lets the page render.
      await tierList.zen.setZenMode(false);

      await expect(tierList.items.dropOverlay).toHaveCount(0);
    });

    test('writes 1 history entry, for the picture only, when the user drops a link and then a picture in Zen', async ({tierList, page}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS);
      await tierList.zen.setZenMode(true);
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.linkImages.dropText({uriList: 'https://i.imgur.com/red.png', plain: 'https://i.imgur.com/red.png'});
      await tierList.files.dropFile(imageFile('blue-square.png'));

      await expect(tierList.item('blue-square')).toBeVisible();
      await expect.poll(newEntries).toBe(1);
      await expect(tierList.item('red')).toHaveCount(0);
    });

    test('writes 1 history entry, for the picture only, when the user pastes an image address and then a picture in Zen', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS);
      await tierList.zen.setZenMode(true);
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.linkImages.pasteText('https://i.imgur.com/red.png');
      await tierList.deviceImages.pasteImages([imageFile('blue-square.png')]);

      await expect(tierList.item('blue-square')).toBeVisible();
      await expect.poll(newEntries).toBe(1);
      await expect(tierList.item('red')).toHaveCount(0);
    });
  });

  test.describe('entering and leaving', () => {
    test('renders the Zen bar, the title and the wordmark, and no site header or editor tools, when the user turns on Zen', {tag: '@mobile'}, async ({
      tierList, page,
    }) => {
      await tierList.goto(TANKS);
      await expect(tierList.zen.zenWordmark).toBeHidden();

      await tierList.zen.setZenMode(true);

      await expect(tierList.zen.siteHeader).toBeHidden();
      await expect(tierList.editorTools).toBeHidden();
      await expect(tierList.title).toBeVisible();
      await expect(tierList.zen.zenWordmark).toBeVisible();
      await expect(tierList.zen.zenBarButtons).toHaveCount(5);
      for (const button of [tierList.zen.zenBarButton('Back'), tierList.zen.zenBarButton('Forward'), tierList.zen.rankingOrderButton, tierList.zen.layoutButton, tierList.zen.zenBarButton('Exit Zen')]) {
        await expect(button).toBeAttached();
      }
      await expect(tierList.zen.rankingOrderButton).toHaveAccessibleName('Ranking order: Pick freely');
    });

    test('renders the site header and the editor tools, and no Zen bar, when the user clicks button "Exit Zen"', {tag: '@mobile'}, async ({
      tierList, page,
    }) => {
      await tierList.goto(TANKS);
      await tierList.zen.setZenMode(true);

      await tierList.zen.setZenMode(false);

      await expect(tierList.toast('Exited Zen Mode')).toBeVisible();
      await expect(tierList.zen.siteHeader).toBeVisible();
      await expect(tierList.editorTools).toBeVisible();
      await expect(tierList.zen.zenWordmark).toBeHidden();
    });

    test('renders the editor tools and no Zen bar when the user presses Escape in Zen', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      await tierList.zen.setZenMode(true);

      await tierList.pressKey('Escape');

      await expect(tierList.zen.zenBar).toHaveCount(0);
      await expect(tierList.editorTools).toBeVisible();
      await expect(tierList.zenModeToggle).toHaveAttribute('aria-pressed', 'false');
    });

    test('renders the Zen bar when the user presses Escape to close the ranking order menu', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      await tierList.zen.setZenMode(true);
      const menu = await tierList.zen.openRankingOrderMenu();
      await expect(menu).toBeVisible();

      await tierList.pressKey('Escape');

      await expect(menu).toHaveCount(0);
      await expect(tierList.zen.zenBar).toBeVisible();
      await expect(tierList.editorTools).toBeHidden();
    });

    test('renders the Zen bar when the user presses Escape while renaming a row in Zen', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      await tierList.zen.setZenMode(true);
      await tierList.tierLabel('S').click();
      await expect(tierList.tierNameInput('S')).toBeVisible();

      await tierList.pressKey('Escape');

      await expect(tierList.tierNameInput('S')).toHaveCount(0);
      await expect(tierList.zen.zenBar).toBeVisible();
    });
  });

  test.describe('Zen bar', () => {
    test('renders the step count 3 / 3 with button "Back" on and "Forward" off when the user turns on Zen after 2 drags', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');

      await tierList.zen.setZenMode(true);

      await expect(tierList.zen.zenStepCount).toHaveText('3 / 3');
      await expect(tierList.zen.zenBarButton('Back')).toBeEnabled();
      await expect(tierList.zen.zenBarButton('Forward')).toBeDisabled();
    });

    test('renders each earlier version and its step count when the user clicks button "Back" and then "Forward"', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');
      await tierList.zen.setZenMode(true);

      await tierList.zen.stepInZenBar('Back');
      await expect(tierList.zen.zenStepCount).toHaveText('2 / 3');
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveCount(0);

      await tierList.zen.stepInZenBar('Back');
      await expect(tierList.zen.zenStepCount).toHaveText('1 / 3');
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(TRAY);
      // The list's first version: Back stops here, and never leaves the list.
      await expect(tierList.zen.zenBarButton('Back')).toBeDisabled();

      await tierList.zen.stepInZenBar('Forward');
      await expect(tierList.zen.zenStepCount).toHaveText('2 / 3');
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.zen.zenBarButton('Forward')).toBeEnabled();
    });

    test('renders the step count 3 / 3 when the user reloads the page after 2 drags and turns on Zen', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');

      await tierList.reload();
      await tierList.zen.setZenMode(true);

      await expect(tierList.zen.zenStepCount).toHaveText('3 / 3');
      await expect(tierList.zen.zenBarButton('Back')).toBeEnabled();
    });

    test('renders the step count 1 / 1 with buttons "Back" and "Forward" off when the page opens a link and the user turns on Zen', {tag: '@mobile'}, async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, TRAY_STATE);

      await tierList.zen.setZenMode(true);

      await expect(tierList.zen.zenStepCount).toHaveText('1 / 1');
      await expect(tierList.zen.zenBarButton('Back')).toBeDisabled();
      await expect(tierList.zen.zenBarButton('Forward')).toBeDisabled();
    });

    test('renders the step count 2 / 2 when the user drags an item in Zen after going Back', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');
      await tierList.zen.setZenMode(true);
      await tierList.zen.stepInZenBar('Back');
      await tierList.zen.stepInZenBar('Back');

      await tierList.dragItemToTier('Sigma', 'B');

      await expect(tierList.zen.zenStepCount).toHaveText('2 / 2');
      await expect(tierList.zen.zenBarButton('Forward')).toBeDisabled();
    });

    // Owner decision, 2026-11-01: the bar never fades. Ranking moves the mouse anyway.
    test('renders the Zen bar opaque and clickable when the mouse rests for 10 seconds in Zen', async ({tierList, page}) => {
      await page.clock.install();
      await tierList.goto(TANKS);
      await tierList.zen.setZenMode(true);
      await tierList.restMouseAt(20, 400);

      await tierList.letTimePass(10_000);

      // Pointer events change at once; a fading bar's opacity would still read 1 here.
      await expect(tierList.zen.zenBar).toHaveCSS('pointer-events', 'auto');
      await expect(tierList.zen.zenBar).toHaveCSS('opacity', '1');
    });

    // Owner decision, 2026-11-01: the bar has its own row above the title, at the top centre,
    // and covers nothing of the list.
    test('renders the Zen bar above the title at the top centre, overlapping no title, row or item, when the user turns on Zen', {tag: '@mobile'}, async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston', 'Sigma']}, LONG_TITLE));

      await tierList.zen.setZenMode(true);

      expect(await tierList.zen.listPartsUnderZenBar()).toEqual([]);
      const bar = (await tierList.zen.zenBar.boundingBox())!;
      const title = (await tierList.title.boundingBox())!;
      const main = (await tierList.main.boundingBox())!;
      expect(bar.y + bar.height).toBeLessThanOrEqual(title.y);
      expect(Math.abs(bar.x + bar.width / 2 - (main.x + main.width / 2))).toBeLessThan(2);
    });

    test('renders focus on the Zen bar when the user turns on Zen, and on button "Zen" when the user exits Zen', async ({tierList}) => {
      await tierList.goto(TANKS);

      await tierList.zen.setZenMode(true);
      await expect(tierList.zen.zenBar).toBeFocused();

      await tierList.zen.setZenMode(false);
      await expect(tierList.zenModeToggle).toBeFocused();
    });
  });

  test.describe('ranking order', () => {
    test('renders "· 4 left" beside heading "Unranked" when the user turns on Zen', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await expect(tierList.unranked.getByText('4 left')).toHaveCount(0);

      await tierList.zen.setZenMode(true);

      await expect(tierList.tierLabel('Unranked')).toHaveText('Unranked');
      await expect(tierList.unranked.getByText('· 4 left')).toBeVisible();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(TRAY);
    });

    test('renders the first Unranked item up next and the others in the queue in tray order when the user chooses In order', {tag: '@mobile'}, async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.zen.setZenMode(true);

      await tierList.zen.chooseRankingOrder('In order');

      await expect(tierList.unranked.getByRole('heading', {level: 2})).toHaveText('Up next');
      await expect(tierList.unranked.getByText('4 left', {exact: true})).toBeVisible();
      await expect(tierList.zen.upNextItem).toHaveAccessibleName('Mauga');
      await expect(tierList.zen.queueItems).toHaveText(['Winston', 'Sigma', 'Orisa']);
    });

    test('renders the next item up next and "3 left" when the user drags the item up next to row S', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.zen.setZenMode(true);
      await tierList.zen.chooseRankingOrder('In order');

      await tierList.dragItemToTier('Mauga', 'S');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.zen.upNextItem).toHaveAccessibleName('Winston');
      await expect(tierList.unranked.getByText('3 left', {exact: true})).toBeVisible();
      await expect(tierList.zen.queueItems).toHaveText(['Sigma', 'Orisa']);
    });

    test('writes each item up next to its row when the user drags three items up next in a row', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.zen.setZenMode(true);
      await tierList.zen.chooseRankingOrder('In order');

      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');
      await tierList.dragItemToTier('Sigma', 'B');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
      await expect(tierList.itemsIn('B')).toHaveText(['Sigma']);
      await expect(tierList.zen.upNextItem).toHaveAccessibleName('Orisa');
    });

    // The whole queue, one item after another: each drop leaves a new tile up next, and every
    // tile on the page must still take a drag (the drop helpers check it after each drop).
    for (const order of ['In order', 'Shuffle'] as const) {
      test(`writes 1 history entry per drop and each item to its row when the user ranks the queue to empty by mouse with ${order}`, async ({
        tierList,
      }) => {
        await tierList.goto(TANKS, TRAY_STATE);
        await tierList.zen.setZenMode(true);
        await tierList.zen.chooseRankingOrder(order);
        const newEntries = await tierList.countNewHistoryEntries();
        const ranked: Record<string, string> = {};

        for (const [drop, row] of RANKED_ROWS.entries()) {
          const name = await tierList.zen.upNextItem.getAttribute('aria-label') ?? '';
          await tierList.dragItemToTier(name, row);
          ranked[row] = name;

          expect(await newEntries()).toBe(drop + 1);
          await expect(tierList.itemsIn(row)).toHaveText([name]);
          await expect(tierList.unranked.getByText(`${TRAY.length - drop - 1} left`, {exact: true})).toBeVisible();
        }

        if (order === 'In order') expect(Object.values(ranked)).toEqual(TRAY);
        else expect(Object.values(ranked).sort()).toEqual([...TRAY].sort());
        for (const row of RANKED_ROWS) {
          await expect(tierList.itemsIn(row)).toHaveText([ranked[row]]);
        }
        await expect(tierList.zen.upNextItem).toHaveCount(0);
        await expect(tierList.zen.zenStepCount).toHaveText(`${TRAY.length + 1} / ${TRAY.length + 1}`);
      });
    }

    test('writes 1 history entry per drop and each item to its row when the user ranks the queue to empty by keyboard, In order', async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.zen.setZenMode(true);
      await tierList.zen.chooseRankingOrder('In order');
      const newEntries = await tierList.countNewHistoryEntries();

      for (const [drop, row] of RANKED_ROWS.entries()) {
        await expect(tierList.zen.upNextItem).toHaveAccessibleName(TRAY[drop]);
        // The Up arrow goes one row up per press, from the tray: row F first, then C... up to S.
        const presses = ALL_RANKED_ROWS.length - ALL_RANKED_ROWS.indexOf(row);
        await tierList.moveItemWithKeyboard(TRAY[drop], Array(presses).fill('ArrowUp'));

        expect(await newEntries()).toBe(drop + 1);
        await expect(tierList.itemsIn(row)).toHaveText([TRAY[drop]]);
      }

      for (const [drop, row] of RANKED_ROWS.entries()) {
        await expect(tierList.itemsIn(row)).toHaveText([TRAY[drop]]);
      }
      await expect(tierList.zen.upNextItem).toHaveCount(0);
      await expect(tierList.zen.zenStepCount).toHaveText(`${TRAY.length + 1} / ${TRAY.length + 1}`);
    });

    test('renders menu item "Hide the queue" turned off and unavailable when the ranking order is Pick freely', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      await tierList.zen.setZenMode(true);

      await tierList.zen.openRankingOrderMenu();

      await expect(tierList.menuItemRadio('Pick freely')).toHaveAttribute('aria-checked', 'true');
      await expect(tierList.menuItemCheckbox('Hide the queue')).toHaveAttribute('aria-disabled', 'true');
    });

    test('writes no history entry and leaves the address as it is when the user chooses each ranking order and "Hide the queue"', async ({
      tierList, page,
    }) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.zen.setZenMode(true);
      const address = page.url();
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.zen.chooseRankingOrder('In order');
      await tierList.zen.setHideQueue(true);
      await tierList.zen.chooseRankingOrder('Shuffle');
      await tierList.zen.chooseRankingOrder('Pick freely');

      await tierList.settled();
      expect(await newEntries()).toBe(0);
      expect(page.url()).toBe(address);
      await expect(tierList.zen.zenStepCount).toHaveText('1 / 1');
    });
  });

  test.describe('model', () => {
    /** The Unranked tray in Zen with In order or Shuffle: the item up next first, then the queue. */
    const expectUpNext = async (tierList: TierListPage, snapshot: ZenOrderSnapshot) => {
      await expect(tierList.unranked.getByRole('heading', {level: 2})).toHaveText('Up next');
      await expect(tierList.unranked.getByText(`${TRAY.length} left`, {exact: true})).toBeVisible();
      // In order: the tray's order. Shuffle: any order, so only its parts are checked.
      if (orderOf(snapshot) === 'inOrder') await expect(tierList.zen.upNextItem).toHaveAccessibleName(TRAY[0]);
      const next = await tierList.zen.upNextItemName();
      expect(TRAY).toContain(next);
      const queued = TRAY.filter(name => name !== next);
      if (queueHiddenIn(snapshot)) {
        await expect(tierList.zen.queue('Queue (hidden)')).toBeVisible();
        await expect(tierList.zen.queue()).toHaveCount(0);
        for (const name of queued) await expect(tierList.unranked.getByText(name)).toHaveCount(0);
      } else if (orderOf(snapshot) === 'inOrder') {
        await expect(tierList.zen.queueItems).toHaveText(queued);
      } else {
        await expect(tierList.zen.queueItems).toHaveCount(queued.length);
        const shown = await tierList.zen.queueItems.evaluateAll(items => items.map(item => item.getAttribute('aria-label')));
        expect(shown.sort()).toEqual([...queued].sort());
      }
    };

    /** The Zen ranking order machine's events and checks, run on this test's page (modelSut). */
    const zenOrderSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      /** The address and the history entries as the run opened the list: view settings change neither. */
      let address = '';
      let entries = 0;
      /** The state on screen, as the last check saw it: in Pick freely the box is unavailable. */
      let onScreen: ZenOrderSnapshot | null = null;
      const pressHideQueue = async (on: boolean) => {
        if (!onScreen) throw new Error('No state was checked yet');
        if (orderOf(onScreen) === 'pickFreely') await tierList.zen.pressUnavailableHideQueue(!on);
        else await tierList.zen.setHideQueue(on);
      };
      return modelSut<ZenOrderSnapshot, ZenOrderEvent>(page, {
        reset: async () => {
          onScreen = null;
          await tierList.goto(TANKS, TRAY_STATE);
          address = page.url();
          entries = await tierList.historyLength();
        },
        events: {
          TOGGLE_ZEN: () => tierList.zen.setZenMode(true),
          EXIT_ZEN: () => tierList.zen.setZenMode(false),
          CHOOSE_PICK_FREELY: () => tierList.zen.chooseRankingOrder(RANKING_ORDER_NAMES.pickFreely),
          CHOOSE_IN_ORDER: () => tierList.zen.chooseRankingOrder(RANKING_ORDER_NAMES.inOrder),
          CHOOSE_SHUFFLE: () => tierList.zen.chooseRankingOrder(RANKING_ORDER_NAMES.shuffle),
          HIDE_QUEUE: () => pressHideQueue(true),
          SHOW_QUEUE: () => pressHideQueue(false),
        },
        states: {
          '*': async (_page, snapshot) => {
            onScreen = snapshot;
            // View settings: no new link and no history entry.
            await expect(page).toHaveURL(address);
            expect(await tierList.historyLength(), 'view settings should add no history entry').toBe(entries);
            const order = orderOf(snapshot);
            if (!order) {
              // Out of Zen the tray is the editor's, whatever the order.
              await expect(tierList.zen.zenBar).toHaveCount(0);
              await expect(tierList.tierLabel('Unranked')).toHaveText('Unranked');
              await expect(tierList.hints).toBeVisible();
              await expect(tierList.itemsIn(tierList.unranked)).toHaveText(TRAY);
              return;
            }
            await expect(tierList.zen.rankingOrderButton).toHaveAccessibleName(`Ranking order: ${RANKING_ORDER_NAMES[order]}`);
            if (order !== 'pickFreely') {
              await expectUpNext(tierList, snapshot);
              return;
            }
            // Pick freely: the whole tray, with no queue, also with "Hide the queue" left on.
            await expect(tierList.tierLabel('Unranked')).toHaveText('Unranked');
            await expect(tierList.unranked.getByText(`· ${TRAY.length} left`)).toBeVisible();
            await expect(tierList.itemsIn(tierList.unranked)).toHaveText(TRAY);
            await expect(tierList.unranked.getByRole('list')).toHaveCount(0);
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(zenOrderModel)) {
      test(`renders each state of the Zen ranking order machine when the user walks every transition (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(zenOrderModel, zenOrderSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, zenOrderModel, coverage, part);
      });
    }
  });

  /**
   * The Zen steps machine (tests/machines/zen-steps.ts): the Zen bar's Back and Forward and its
   * step count, beside the browser's own Back and Forward, over the list as opened and two
   * changes made in Zen. Each change ranks the next Unranked item into row A, so version n has
   * n - 1 items in row A.
   */
  test.describe('model: steps', () => {
    const STEPS_TRAY = TRAY.slice(0, MAX_ZEN_STEPS - 1);
    const STEPS_LIST = rankingState('image-overwatch', {'': STEPS_TRAY});

    /** The Zen steps machine's events and checks, run on this test's page (modelSut). */
    const zenStepsSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => modelSut<ZenStepsSnapshot, ZenStepsEvent>(page, {
      reset: async () => {
        await tierList.openAfterBlankPage(TANKS, STEPS_LIST);
        await tierList.zen.setZenMode(true);
      },
      events: {
        CHANGE_LIST: () => tierList.rankFirstUnrankedItem('A'),
        ZEN_BACK: () => tierList.zen.stepInZenBar('Back'),
        ZEN_FORWARD: () => tierList.zen.stepInZenBar('Forward'),
        BROWSER_BACK: () => tierList.goBack(),
        BROWSER_FORWARD: () => tierList.goForward(),
      },
      // Web-first checks: after Back or Forward the address changes before the list on screen does.
      states: {
        '*': async (_page, snapshot) => {
          const {step, total} = zenStepsViewOf(snapshot);
          await expect(tierList.zen.zenBar).toBeVisible();
          await expect(tierList.zen.zenStepCount).toHaveText(`${step} / ${total}`);
          await expect(tierList.itemsIn('A')).toHaveText(STEPS_TRAY.slice(0, step - 1));
          await expect(tierList.itemsIn(tierList.unranked)).toHaveText(STEPS_TRAY.slice(step - 1));
          if (step > 1) await expect(tierList.zen.zenBarButton('Back')).toBeEnabled();
          else await expect(tierList.zen.zenBarButton('Back')).toBeDisabled();
          if (step < total) await expect(tierList.zen.zenBarButton('Forward')).toBeEnabled();
          else await expect(tierList.zen.zenBarButton('Forward')).toBeDisabled();
        },
      },
      testInfo,
      step: (name, body) => test.step(name, body),
    });

    test.describe.configure({retries: 0});
    for (const part of walkParts(zenStepsModel)) {
      test(`renders the step count and Back and Forward on or off when the user steps with the Zen bar and the browser (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(zenStepsModel, zenStepsSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, zenStepsModel, coverage, part);
      });
    }
  });
});
