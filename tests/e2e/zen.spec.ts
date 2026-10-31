import {expect, test} from '../support/test';

const TANKS = '/rank/overwatch/tank';

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

  test('renders no menu item "Delete" in the item menu when the user turns on Zen', async ({tierList, page}) => {
    await tierList.goto(TANKS);
    await tierList.setZenMode(true);

    await tierList.item('Mauga').click({button: 'right'});
    await expect(tierList.menuItem('Delete')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await tierList.setZenMode(false);
    await tierList.item('Mauga').click({button: 'right'});
    await expect(tierList.menuItem('Delete')).toBeVisible();
  });
});
