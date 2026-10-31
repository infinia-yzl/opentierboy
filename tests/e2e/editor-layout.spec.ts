import {expect, test} from '../support/test';

// The editor's layout (owner decisions, 2026-10-28): three tools beside the title, the site
// header keeps site-level controls only, and rows are changed under the rows.
const TANKS = '/rank/overwatch/tank';

test.describe('editor layout', () => {
  test.describe('editor tools', () => {
    test('renders the buttons "Add images", "Zen" and "Share" in that order in Editor tools when the page opens', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);
      await expect(tierList.editorToolButtons).toHaveText(['Add images', 'Zen', 'Share']);
    });

    test('renders the buttons "Add images", "Zen" and "Share" inside the viewport when the screen is 320 px wide', async ({tierList}) => {
      await tierList.page.setViewportSize({width: 320, height: 700});
      await tierList.goto(TANKS);
      for (const name of ['Add images', 'Zen', 'Share']) {
        const box = await tierList.editorToolButtons.filter({hasText: name}).boundingBox();
        if (!box) throw new Error(`${name} is not on the page`);
        expect(box.x, `${name} starts on the screen`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${name} ends on the screen`).toBeLessThanOrEqual(320);
      }
    });

    test('renders button "Appearance" and no button "Zen" in the site header when the page opens the editor', async ({tierList, site}) => {
      await tierList.goto(TANKS);
      await expect(site.appearanceButton).toBeVisible();
      await expect(site.headerButton('Zen')).toHaveCount(0);
    });

    test('renders buttons "Add row" and "Row options" when the editor opens, and hides both when the user turns on Zen', async ({tierList}) => {
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
  test.describe('list title', () => {
    test('renders the title as the only h1, in a bigger font than row label S, when the page opens', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);
      await expect(tierList.pageHeadings).toHaveCount(1);
      await expect.poll(async () => await tierList.fontSize(tierList.title) - await tierList.fontSize(tierList.tierLabel('S'))).toBeGreaterThan(0);
    });

    test('renders the row label (h2) Unranked when the page opens a template', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);
      await expect(tierList.tierLabel('Unranked')).toHaveText('Unranked');
    });

    test('renders the new title when the user opens Edit title with Enter, types a title and presses Enter', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.editTitleButton.focus();
      await tierList.page.keyboard.press('Enter');
      await expect(tierList.titleInput).toBeFocused();
      await expect(tierList.titleInput).toHaveValue('OVERWATCH - Tank');

      await tierList.titleInput.fill('Best tanks');
      await tierList.titleInput.press('Enter');
      await expect(tierList.title).toHaveText('Best tanks');
    });

    test('renders the old title when the user presses Escape in the title text box', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.editTitleButton.click();
      await tierList.titleInput.fill('Not saved');
      await tierList.titleInput.press('Escape');
      await expect(tierList.title).toHaveText('OVERWATCH - Tank');
    });

    test('renders the title within 40 px above row S and the hints in the Unranked row when the page opens', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);
      await expect(tierList.unranked).toContainText('Drag to reorder.');
      await expect(async () => {
        const title = await tierList.title.boundingBox();
        const firstRow = await tierList.tier('S').boundingBox();
        const tools = await tierList.editorTools.boundingBox();
        if (!title || !firstRow || !tools) throw new Error('A part of the editor is not on the page');
        expect(firstRow.y - (title.y + title.height)).toBeLessThan(40);
        // Wide screens: the tools on the title's line. Phones: the tools above the title.
        if (tierList.page.viewportSize()!.width >= 640) {
          expect(tools.y).toBeLessThan(title.y + title.height);
        } else {
          expect(tools.y + tools.height).toBeLessThanOrEqual(title.y);
        }
      }).toPass();
    });

    test('renders no button "Edit title" and no hints when the user turns on Zen', async ({tierList}) => {
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
  test.describe('Unranked tray', () => {
    test('renders Unranked last, under button "Add row", with no row handle when the page opens', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS);
      await expect(tierList.tiers.last()).toHaveAccessibleName('Unranked');
      await expect(tierList.tierLabel('Unranked')).toHaveText('Unranked');
      await expect(tierList.rowHandle('Unranked')).toHaveCount(0);
      await expect(tierList.rowHandle('F')).toBeVisible();

      await expect(async () => {
        const lastRanked = await tierList.tier('F').boundingBox();
        const addRow = await tierList.addRowButton.boundingBox();
        const tray = await tierList.unranked.boundingBox();
        if (!lastRanked || !addRow || !tray) throw new Error('A part of the editor is not on the page');
        expect(addRow.y).toBeGreaterThanOrEqual(lastRanked.y + lastRanked.height);
        expect(tray.y).toBeGreaterThanOrEqual(addRow.y + addRow.height);
      }).toPass();
    });

    test('renders the Add images menu when the user clicks the tile "Add images to Unranked"', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.addImagesTile.click();
      await expect(tierList.menuItem('From template')).toBeVisible();
    });

    test('renders the Unranked row with no tile "Add images to Unranked" and no hints when the user turns on Zen', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.setZenMode(true);
      await expect(tierList.addImagesTile).toBeHidden();
      await expect(tierList.hints).toBeHidden();
      await expect(tierList.unranked).toBeVisible();
    });
  });
});
