import {expect, test} from '../support/test';

// The editor's layout (owner decisions, 2026-10-28): three tools beside the title, the site
// header keeps site-level controls only, and rows are changed under the rows.
const TANKS = '/rank/overwatch/tank';

test.describe('Editor layout', () => {
  test('the title row holds Add images, Zen and Share, in that order', {tag: '@mobile'}, async ({tierList}) => {
    await tierList.goto(TANKS);
    await expect(tierList.editorTools.getByRole('button')).toHaveText(['Add images', 'Zen', 'Share']);
  });

  test('the site header holds Appearance, and Zen sits with the editor', async ({tierList, site}) => {
    await tierList.goto(TANKS);
    await expect(site.appearanceButton).toBeVisible();
    await expect(tierList.page.getByRole('banner').getByRole('button', {name: 'Zen', exact: true})).toHaveCount(0);
  });

  test('Add row and Row options sit under the rows, and hide in Zen', async ({tierList}) => {
    await tierList.goto(TANKS);
    await expect(tierList.addRowButton).toBeVisible();
    await expect(tierList.rowOptionsButton).toBeVisible();

    await tierList.setZenMode(true);
    await expect(tierList.addRowButton).toBeHidden();
    await expect(tierList.rowOptionsButton).toBeHidden();
  });
});
