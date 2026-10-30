import {expect, test} from '../support/test';

// The editor's layout (owner decisions, 2026-10-28): three tools beside the title, the site
// header keeps site-level controls only, and rows are changed under the rows.
const TANKS = '/rank/overwatch/tank';

test.describe('Editor layout', () => {
  test('the title row holds Add images, Zen and Share, in that order', {tag: '@mobile'}, async ({tierList}) => {
    await tierList.goto(TANKS);
    await expect(tierList.editorTools.getByRole('button')).toHaveText(['Add images', 'Zen', 'Share']);
  });

  test('on a 320 px screen the three tools stay on the screen', async ({tierList}) => {
    await tierList.page.setViewportSize({width: 320, height: 700});
    await tierList.goto(TANKS);
    for (const name of ['Add images', 'Zen', 'Share']) {
      const box = await tierList.editorTools.getByRole('button', {name, exact: true}).boundingBox();
      if (!box) throw new Error(`${name} is not on the page`);
      expect(box.x, `${name} starts on the screen`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${name} ends on the screen`).toBeLessThanOrEqual(320);
    }
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
