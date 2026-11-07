import {expect, test} from '../support/test';
import {SCRIPTED_PASTE_SKIP} from '../pages/tier-list-page';
import {imageFile, serveImageSite} from '../support/image-sites';
import {rankingState} from '../support/links';

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

    await tierList.setZenMode(true);

    await expect(tierList.toast('Entered Zen Mode')).toBeVisible();
    for (const button of toolbar) {
      await expect(button).toBeHidden();
    }
    await expect(tierList.item('Mauga')).toBeVisible();

    await tierList.setZenMode(false);

    for (const button of toolbar) {
      await expect(button).toBeVisible();
    }
  });

  test('renders no menu item "Delete" in the item menu when the user turns on Zen', async ({tierList}) => {
    await tierList.goto(TANKS);
    await tierList.setZenMode(true);

    await tierList.item('Mauga').click({button: 'right'});
    await expect(tierList.menuItem('Delete')).toHaveCount(0);

    await tierList.setZenMode(false);
    await tierList.item('Mauga').click({button: 'right'});
    await expect(tierList.menuItem('Delete')).toBeVisible();
  });

  // Zen turns off adding and removing items (its toast says so). Dropped and pasted links add
  // nothing in Zen, and the drop overlay stays away. Dropped and pasted picture files are added in
  // Zen, as they were before links could be dropped.
  test.describe('dropping and pasting', () => {
    test('renders no drop overlay when the user drags a link over the editor in Zen', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);

      await tierList.dragLinkOver('https://i.imgur.com/red.png');
      // The overlay would stay until the drag ends: turning Zen off first lets the page render.
      await tierList.setZenMode(false);

      await expect(tierList.dropOverlay).toHaveCount(0);
    });

    test('writes 1 history entry, for the picture only, when the user drops a link and then a picture in Zen', async ({tierList, page}) => {
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.dropText({uriList: 'https://i.imgur.com/red.png', plain: 'https://i.imgur.com/red.png'});
      await tierList.dropFile(imageFile('blue-square.png'));

      await expect(tierList.item('blue-square')).toBeVisible();
      await expect.poll(newEntries).toBe(1);
      await expect(tierList.item('red')).toHaveCount(0);
    });

    test('writes 1 history entry, for the picture only, when the user pastes an image address and then a picture in Zen', async ({tierList, page, browserName}) => {
      test.skip(browserName === 'firefox', SCRIPTED_PASTE_SKIP);
      await serveImageSite(page, 'i.imgur.com');
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.pasteText('https://i.imgur.com/red.png');
      await tierList.pasteImages([imageFile('blue-square.png')]);

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
      await expect(tierList.zenWordmark).toBeHidden();

      await tierList.setZenMode(true);

      await expect(page.getByRole('banner')).toBeHidden();
      await expect(tierList.editorTools).toBeHidden();
      await expect(tierList.title).toBeVisible();
      await expect(tierList.zenWordmark).toBeVisible();
      await expect(tierList.zenBar.getByRole('button')).toHaveCount(4);
      for (const button of [tierList.zenBarButton('Back'), tierList.zenBarButton('Forward'), tierList.rankingOrderButton, tierList.zenBarButton('Exit Zen')]) {
        await expect(button).toBeAttached();
      }
      await expect(tierList.rankingOrderButton).toHaveAccessibleName('Ranking order: Pick freely');
    });

    test('renders the site header and the editor tools, and no Zen bar, when the user clicks button "Exit Zen"', {tag: '@mobile'}, async ({
      tierList, page,
    }) => {
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);

      await tierList.setZenMode(false);

      await expect(tierList.toast('Exited Zen Mode')).toBeVisible();
      await expect(page.getByRole('banner')).toBeVisible();
      await expect(tierList.editorTools).toBeVisible();
      await expect(tierList.zenWordmark).toBeHidden();
    });

    test('renders the editor tools and no Zen bar when the user presses Escape in Zen', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);

      await page.keyboard.press('Escape');

      await expect(tierList.zenBar).toHaveCount(0);
      await expect(tierList.editorTools).toBeVisible();
      await expect(tierList.zenModeToggle).toHaveAttribute('aria-pressed', 'false');
    });

    test('renders the Zen bar when the user presses Escape to close the ranking order menu', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);
      const menu = await tierList.openRankingOrderMenu();
      await expect(menu).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(menu).toHaveCount(0);
      await expect(tierList.zenBar).toBeVisible();
      await expect(tierList.editorTools).toBeHidden();
    });

    test('renders the Zen bar when the user presses Escape while renaming a row in Zen', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);
      await tierList.tierLabel('S').click();
      await expect(tierList.tierNameInput('S')).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(tierList.tierNameInput('S')).toHaveCount(0);
      await expect(tierList.zenBar).toBeVisible();
    });
  });

  test.describe('Zen bar', () => {
    test('renders the step count 3 / 3 with button "Back" on and "Forward" off when the user turns on Zen after 2 drags', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');

      await tierList.setZenMode(true);

      await expect(tierList.zenStepCount).toHaveText('3 / 3');
      await expect(tierList.zenBarButton('Back')).toBeEnabled();
      await expect(tierList.zenBarButton('Forward')).toBeDisabled();
    });

    test('renders each earlier version and its step count when the user clicks button "Back" and then "Forward"', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');
      await tierList.setZenMode(true);

      await tierList.stepInZenBar('Back');
      await expect(tierList.zenStepCount).toHaveText('2 / 3');
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveCount(0);

      await tierList.stepInZenBar('Back');
      await expect(tierList.zenStepCount).toHaveText('1 / 3');
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(TRAY);
      // The list's first version: Back stops here, and never leaves the list.
      await expect(tierList.zenBarButton('Back')).toBeDisabled();

      await tierList.stepInZenBar('Forward');
      await expect(tierList.zenStepCount).toHaveText('2 / 3');
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.zenBarButton('Forward')).toBeEnabled();
    });

    test('renders the step count 3 / 3 when the user reloads the page after 2 drags and turns on Zen', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');

      await tierList.reload();
      await tierList.setZenMode(true);

      await expect(tierList.zenStepCount).toHaveText('3 / 3');
      await expect(tierList.zenBarButton('Back')).toBeEnabled();
    });

    test('renders the step count 1 / 1 with buttons "Back" and "Forward" off when the page opens a link and the user turns on Zen', {tag: '@mobile'}, async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, TRAY_STATE);

      await tierList.setZenMode(true);

      await expect(tierList.zenStepCount).toHaveText('1 / 1');
      await expect(tierList.zenBarButton('Back')).toBeDisabled();
      await expect(tierList.zenBarButton('Forward')).toBeDisabled();
    });

    test('renders the step count 2 / 2 when the user drags an item in Zen after going Back', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');
      await tierList.setZenMode(true);
      await tierList.stepInZenBar('Back');
      await tierList.stepInZenBar('Back');

      await tierList.dragItemToTier('Sigma', 'B');

      await expect(tierList.zenStepCount).toHaveText('2 / 2');
      await expect(tierList.zenBarButton('Forward')).toBeDisabled();
    });

    // Owner decision, 2026-11-01: the bar never fades. Ranking moves the mouse anyway.
    test('renders the Zen bar opaque and clickable when the mouse rests for 10 seconds in Zen', async ({tierList, page}) => {
      await page.clock.install();
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);
      await page.mouse.move(20, 400);

      await tierList.letTimePass(10_000);

      // Pointer events change at once; a fading bar's opacity would still read 1 here.
      await expect(tierList.zenBar).toHaveCSS('pointer-events', 'auto');
      await expect(tierList.zenBar).toHaveCSS('opacity', '1');
    });

    // Owner decision, 2026-11-01: the bar has its own row above the title, at the top centre,
    // and covers nothing of the list.
    test('renders the Zen bar above the title at the top centre, overlapping no title, row or item, when the user turns on Zen', {tag: '@mobile'}, async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston', 'Sigma']}, LONG_TITLE));

      await tierList.setZenMode(true);

      expect(await tierList.listPartsUnderZenBar()).toEqual([]);
      const bar = (await tierList.zenBar.boundingBox())!;
      const title = (await tierList.title.boundingBox())!;
      const main = (await tierList.main.boundingBox())!;
      expect(bar.y + bar.height).toBeLessThanOrEqual(title.y);
      expect(Math.abs(bar.x + bar.width / 2 - (main.x + main.width / 2))).toBeLessThan(2);
    });

    test('renders focus on the Zen bar when the user turns on Zen, and on button "Zen" when the user exits Zen', async ({tierList}) => {
      await tierList.goto(TANKS);

      await tierList.setZenMode(true);
      await expect(tierList.zenBar).toBeFocused();

      await tierList.setZenMode(false);
      await expect(tierList.zenModeToggle).toBeFocused();
    });
  });

  test.describe('ranking order', () => {
    test('renders "· 4 left" beside heading "Unranked" when the user turns on Zen', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await expect(tierList.unranked.getByText('4 left')).toHaveCount(0);

      await tierList.setZenMode(true);

      await expect(tierList.tierLabel('Unranked')).toHaveText('Unranked');
      await expect(tierList.unranked.getByText('· 4 left')).toBeVisible();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(TRAY);
    });

    test('renders the first Unranked item up next and the others in the queue in tray order when the user chooses In order', {tag: '@mobile'}, async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.setZenMode(true);

      await tierList.chooseRankingOrder('In order');

      await expect(tierList.unranked.getByRole('heading', {level: 2})).toHaveText('Up next');
      await expect(tierList.unranked.getByText('4 left', {exact: true})).toBeVisible();
      await expect(tierList.upNextItem).toHaveAccessibleName('Mauga');
      await expect(tierList.queueItems).toHaveText(['Winston', 'Sigma', 'Orisa']);
    });

    test('renders the next item up next and "3 left" when the user drags the item up next to row S', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.setZenMode(true);
      await tierList.chooseRankingOrder('In order');

      await tierList.dragItemToTier('Mauga', 'S');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.upNextItem).toHaveAccessibleName('Winston');
      await expect(tierList.unranked.getByText('3 left', {exact: true})).toBeVisible();
      await expect(tierList.queueItems).toHaveText(['Sigma', 'Orisa']);
    });

    test('writes each item up next to its row when the user drags three items up next in a row', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.setZenMode(true);
      await tierList.chooseRankingOrder('In order');

      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');
      await tierList.dragItemToTier('Sigma', 'B');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
      await expect(tierList.itemsIn('B')).toHaveText(['Sigma']);
      await expect(tierList.upNextItem).toHaveAccessibleName('Orisa');
    });

    // The whole queue, one item after another: each drop leaves a new tile up next, and every
    // tile on the page must still take a drag (the drop helpers check it after each drop).
    for (const order of ['In order', 'Shuffle'] as const) {
      test(`writes 1 history entry per drop and each item to its row when the user ranks the queue to empty by mouse with ${order}`, async ({
        tierList,
      }) => {
        await tierList.goto(TANKS, TRAY_STATE);
        await tierList.setZenMode(true);
        await tierList.chooseRankingOrder(order);
        const newEntries = await tierList.countNewHistoryEntries();
        const ranked: Record<string, string> = {};

        for (const [drop, row] of RANKED_ROWS.entries()) {
          const name = await tierList.upNextItem.getAttribute('aria-label') ?? '';
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
        await expect(tierList.upNextItem).toHaveCount(0);
        await expect(tierList.zenStepCount).toHaveText(`${TRAY.length + 1} / ${TRAY.length + 1}`);
      });
    }

    test('writes 1 history entry per drop and each item to its row when the user ranks the queue to empty by keyboard, In order', async ({
      tierList,
    }) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.setZenMode(true);
      await tierList.chooseRankingOrder('In order');
      const newEntries = await tierList.countNewHistoryEntries();

      for (const [drop, row] of RANKED_ROWS.entries()) {
        await expect(tierList.upNextItem).toHaveAccessibleName(TRAY[drop]);
        // The Up arrow goes one row up per press, from the tray: row F first, then C... up to S.
        const presses = ALL_RANKED_ROWS.length - ALL_RANKED_ROWS.indexOf(row);
        await tierList.moveItemWithKeyboard(TRAY[drop], Array(presses).fill('ArrowUp'));

        expect(await newEntries()).toBe(drop + 1);
        await expect(tierList.itemsIn(row)).toHaveText([TRAY[drop]]);
      }

      for (const [drop, row] of RANKED_ROWS.entries()) {
        await expect(tierList.itemsIn(row)).toHaveText([TRAY[drop]]);
      }
      await expect(tierList.upNextItem).toHaveCount(0);
      await expect(tierList.zenStepCount).toHaveText(`${TRAY.length + 1} / ${TRAY.length + 1}`);
    });

    test('renders every Unranked item once, up next or in the queue, when the user chooses Shuffle', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.setZenMode(true);

      await tierList.chooseRankingOrder('Shuffle');

      await expect(tierList.upNextItem).toHaveCount(1);
      await expect(tierList.queueItems).toHaveCount(3);
      const shown = [
        await tierList.upNextItem.getAttribute('aria-label'),
        ...await tierList.queueItems.evaluateAll(items => items.map(item => item.getAttribute('aria-label'))),
      ];
      expect(shown.sort()).toEqual([...TRAY].sort());
    });

    test('renders "Queue (hidden)" with no item names after the item up next when the user turns on "Hide the queue"', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.setZenMode(true);
      await tierList.chooseRankingOrder('In order');

      await tierList.setHideQueue(true);

      await expect(tierList.queue('Queue (hidden)')).toBeVisible();
      await expect(tierList.queue()).toHaveCount(0);
      await expect(tierList.upNextItem).toHaveAccessibleName('Mauga');
      for (const name of ['Winston', 'Sigma', 'Orisa']) {
        await expect(tierList.unranked.getByText(name)).toHaveCount(0);
      }

      await tierList.setHideQueue(false);
      await expect(tierList.queueItems).toHaveText(['Winston', 'Sigma', 'Orisa']);
    });

    test('renders menu item "Hide the queue" turned off and unavailable when the ranking order is Pick freely', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);

      await tierList.openRankingOrderMenu();

      await expect(page.getByRole('menuitemradio', {name: 'Pick freely'})).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('menuitemcheckbox', {name: 'Hide the queue'})).toHaveAttribute('aria-disabled', 'true');
    });

    test('renders the Unranked tray with every item when the user chooses Pick freely after In order', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.setZenMode(true);
      await tierList.chooseRankingOrder('In order');

      await tierList.chooseRankingOrder('Pick freely');

      await expect(tierList.tierLabel('Unranked')).toHaveText('Unranked');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(TRAY);
      await expect(tierList.queue()).toHaveCount(0);
    });

    test('writes no history entry and leaves the address as it is when the user chooses each ranking order and "Hide the queue"', async ({
      tierList, page,
    }) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.setZenMode(true);
      const address = page.url();
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.chooseRankingOrder('In order');
      await tierList.setHideQueue(true);
      await tierList.chooseRankingOrder('Shuffle');
      await tierList.chooseRankingOrder('Pick freely');

      expect(await newEntries()).toBe(0);
      expect(page.url()).toBe(address);
      await expect(tierList.zenStepCount).toHaveText('1 / 1');
    });

    test('renders the tray as it was when the user leaves Zen with In order chosen', async ({tierList}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.setZenMode(true);
      await tierList.chooseRankingOrder('In order');

      await tierList.setZenMode(false);

      await expect(tierList.tierLabel('Unranked')).toHaveText('Unranked');
      await expect(tierList.hints).toBeVisible();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(TRAY);
    });
  });
});
