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

// The list title (owner decision, 2026-10-31): the page's h1 and its biggest text, right above
// the rows, with a pencil that shows it can be edited. The hints sit under the rows.
test.describe('List title', () => {
  test('the title is the page\'s only h1, and bigger than the row labels', {tag: '@mobile'}, async ({tierList}) => {
    await tierList.goto(TANKS);
    await expect(tierList.page.getByRole('heading', {level: 1})).toHaveCount(1);
    const size = (heading: typeof tierList.title) => heading.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    const titleSize = await size(tierList.title);
    const rowLabelSize = await size(tierList.tier('S').getByRole('heading', {level: 2}));
    expect(titleSize).toBeGreaterThan(rowLabelSize);
  });

  test('the Unranked row heading has a name', {tag: '@mobile'}, async ({tierList}) => {
    await tierList.goto(TANKS);
    await expect(tierList.unranked.getByRole('heading', {level: 2, name: 'Unranked'})).toBeAttached();
  });

  test('Edit title opens the title in a text box, and Enter saves it', async ({tierList}) => {
    await tierList.goto(TANKS);
    await tierList.editTitleButton.focus();
    await tierList.page.keyboard.press('Enter');
    await expect(tierList.titleInput).toBeFocused();
    await expect(tierList.titleInput).toHaveValue('OVERWATCH - Tank');

    await tierList.titleInput.fill('Best tanks');
    await tierList.titleInput.press('Enter');
    await expect(tierList.title).toHaveText('Best tanks');
  });

  test('Escape keeps the old title', async ({tierList}) => {
    await tierList.goto(TANKS);
    await tierList.editTitleButton.click();
    await tierList.titleInput.fill('Not saved');
    await tierList.titleInput.press('Escape');
    await expect(tierList.title).toHaveText('OVERWATCH - Tank');
  });

  test('the title sits right above the rows, and the hints sit in the Unranked tray', {tag: '@mobile'}, async ({tierList}) => {
    await tierList.goto(TANKS);
    const title = await tierList.title.boundingBox();
    const firstRow = await tierList.tier('S').boundingBox();
    const tools = await tierList.editorTools.boundingBox();
    if (!title || !firstRow || !tools) throw new Error('A part of the editor is not on the page');

    expect(firstRow.y - (title.y + title.height)).toBeLessThan(40);
    await expect(tierList.unranked.getByText('Drag to reorder.')).toBeVisible();
    // Wide screens: the tools on the title's line. Phones: the tools above the title.
    if (tierList.page.viewportSize()!.width >= 640) {
      expect(tools.y).toBeLessThan(title.y + title.height);
    } else {
      expect(tools.y + tools.height).toBeLessThanOrEqual(title.y);
    }
  });

  test('the pencil and the hints hide in Zen', async ({tierList}) => {
    await tierList.goto(TANKS);
    await expect(tierList.editTitleButton).toBeVisible();
    await tierList.setZenMode(true);
    await expect(tierList.editTitleButton).toBeHidden();
    await expect(tierList.hints).toBeHidden();
    await expect(tierList.title).toBeVisible();
  });
});

// The Clean rows (owner decisions, 2026-10-28 and 2026-10-31): flush rows, then Add row and Row
// options, then Unranked as a fixed tray with the hints and an "Add images" tile.
test.describe('Clean rows', () => {
  test('Unranked is a fixed tray under Add row, with no row handle', {tag: '@mobile'}, async ({tierList}) => {
    await tierList.goto(TANKS);
    await expect(tierList.tiers.last()).toHaveAccessibleName('Unranked');
    await expect(tierList.unranked.getByRole('heading', {level: 2, name: 'Unranked'})).toBeVisible();
    await expect(tierList.rowHandle('Unranked')).toHaveCount(0);
    await expect(tierList.rowHandle('F')).toBeVisible();

    const lastRanked = await tierList.tier('F').boundingBox();
    const addRow = await tierList.addRowButton.boundingBox();
    const tray = await tierList.unranked.boundingBox();
    if (!lastRanked || !addRow || !tray) throw new Error('A part of the editor is not on the page');
    expect(addRow.y).toBeGreaterThanOrEqual(lastRanked.y + lastRanked.height);
    expect(tray.y).toBeGreaterThanOrEqual(addRow.y + addRow.height);
  });

  test('the tray\'s Add images tile opens the Add images menu', async ({tierList}) => {
    await tierList.goto(TANKS);
    await tierList.addImagesTile.click();
    await expect(tierList.page.getByRole('menuitem', {name: 'From template'})).toBeVisible();
  });

  test('the tile and the hints hide in Zen; the tray stays', async ({tierList}) => {
    await tierList.goto(TANKS);
    await tierList.setZenMode(true);
    await expect(tierList.addImagesTile).toBeHidden();
    await expect(tierList.hints).toBeHidden();
    await expect(tierList.unranked).toBeVisible();
  });
});
