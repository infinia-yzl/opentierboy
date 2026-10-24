import {expect, test} from '../support/test';

const TANKS = '/rank/overwatch/tank';

test.describe('Zen mode', () => {
  test('zen mode hides the editing toolbar, and turning it off brings it back', {tag: '@mobile'}, async ({
    tierList,
  }) => {
    await tierList.goto(TANKS);
    const toolbar = [tierList.rowOptionsButton, tierList.manageItemsButton, tierList.shareButton];

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

  test('items cannot be deleted in zen mode', async ({tierList, page}) => {
    await tierList.goto(TANKS);
    await tierList.setZenMode(true);

    await tierList.item('Mauga').click({button: 'right'});
    await expect(page.getByRole('menuitem', {name: 'Delete'})).toHaveCount(0);

    await page.keyboard.press('Escape');
    await tierList.setZenMode(false);
    await tierList.item('Mauga').click({button: 'right'});
    await expect(page.getByRole('menuitem', {name: 'Delete'})).toBeVisible();
  });
});
