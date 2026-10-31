import {expect, test} from '../support/test';
import {rankingState} from '../support/links';

const TANKS = '/rank/overwatch/tank';
const TRAY = ['Mauga', 'Winston', 'Sigma', 'Orisa'];
/** A list with four items in Unranked and none ranked. */
const TRAY_STATE = rankingState('image-overwatch', {'': TRAY});

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
      await expect(tierList.zenBar.getByRole('button')).toHaveCount(5);
      for (const button of [tierList.zenBarButton('Back'), tierList.zenBarButton('Forward'), tierList.rankingOrderButton, tierList.layoutButton, tierList.zenBarButton('Exit Zen')]) {
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

    test('renders the Zen bar see-through while the mouse is still, and opaque again when the mouse moves', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);
      await page.mouse.move(20, 400);

      await expect(tierList.zenBar).toHaveCSS('opacity', '0');

      await page.mouse.move(40, 420);
      await expect(tierList.zenBar).toHaveCSS('opacity', '1');
    });

    test('renders focus on the Zen bar when the user turns on Zen, and on button "Zen" when the user exits Zen', async ({tierList}) => {
      await tierList.goto(TANKS);

      await tierList.setZenMode(true);
      await expect(tierList.zenBar).toBeFocused();

      await tierList.setZenMode(false);
      await expect(tierList.zenModeToggle).toBeFocused();
    });

    test('renders the Zen bar opaque when the user presses Tab while the mouse is still', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);
      await page.mouse.move(20, 400);
      await expect(tierList.zenBar).toHaveCSS('opacity', '0');

      await tierList.pressKey('Tab');

      await expect(tierList.rankingOrderButton).toBeFocused();
      await expect(tierList.zenBar).toHaveCSS('opacity', '1');
    });

    test('renders the Zen bar see-through when the user clicks a button of the bar and the mouse then rests', async ({tierList, page}) => {
      await tierList.goto(TANKS, TRAY_STATE);
      await tierList.setZenMode(true);
      // Closing the menu with Escape first: the click after it counts as a click.
      await tierList.openRankingOrderMenu();
      await tierList.pressKey('Escape');
      await tierList.chooseRankingOrder('In order');
      await page.mouse.move(20, 400);

      await expect(tierList.zenBar).toHaveCSS('opacity', '0');
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
