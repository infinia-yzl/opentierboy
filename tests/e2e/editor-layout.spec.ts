import {expect, test} from '../support/test';
import {rankingState} from '../support/links';

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
        await expect(tierList.editorToolButton(name), `${name} is wholly on the screen`).toBeInViewport({ratio: 1});
      }
    });

    test('renders button "Appearance" and no button "Zen" in the site header when the page opens the editor', async ({tierList, site}) => {
      await tierList.goto(TANKS);
      await expect(site.appearanceButton).toBeVisible();
      await expect(site.headerButton('Zen')).toHaveCount(0);
    });

    test('renders buttons "Add row" and "Row options" when the page opens', async ({tierList}) => {
      await tierList.goto(TANKS);
      await expect(tierList.addRowButton).toBeVisible();
      await expect(tierList.rowOptionsButton).toBeVisible();
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
      await tierList.zen.setZenMode(true);
      await expect(tierList.editTitleButton).toBeHidden();
      await expect(tierList.hints).toBeHidden();
      await expect(tierList.title).toBeVisible();
    });
  });

  // The Clean rows (owner decisions, 2026-10-28 and 2026-10-31): flush rows, then Add row and Row
  // options, then Unranked as a fixed tray with the hints and an "Add images" tile.
  test.describe('Unranked tray', () => {
    test('renders Unranked last, under button "Add row", with no row grip or stack when the page opens', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {F: ['Mauga'], '': ['Winston']}));
      await expect(tierList.tiers.last()).toHaveAccessibleName('Unranked');
      await expect(tierList.tierLabel('Unranked')).toHaveText('Unranked');
      await expect(tierList.rowGrip('Unranked')).toHaveCount(0);
      await expect(tierList.rowStack('Unranked')).toHaveCount(0);
      await expect(tierList.rowGrip('F')).toBeAttached();
      await expect(tierList.rowStack('F')).toBeVisible();

      await expect(async () => {
        const lastRanked = await tierList.tier('F').boundingBox();
        const addRow = await tierList.addRowButton.boundingBox();
        const tray = await tierList.unranked.boundingBox();
        if (!lastRanked || !addRow || !tray) throw new Error('A part of the editor is not on the page');
        expect(addRow.y).toBeGreaterThanOrEqual(lastRanked.y + lastRanked.height);
        expect(tray.y).toBeGreaterThanOrEqual(addRow.y + addRow.height);
      }).toPass();
    });

    test('renders the Add images menu when the user clicks the tile "Add images"', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.addImagesTile.click();
      await expect(tierList.menuItem('From template')).toBeVisible();
    });

    test('renders the Unranked row with no tile "Add images to Unranked" and no hints when the user turns on Zen', async ({tierList}) => {
      await tierList.goto(TANKS);
      await tierList.zen.setZenMode(true);
      await expect(tierList.addImagesTile).toBeHidden();
      await expect(tierList.hints).toBeHidden();
      await expect(tierList.unranked).toBeVisible();
    });
  });

  // The dense editor (owner decision, 2026-10-31): Compact and Comfortable tiles, a view setting
  // of this browser in the Row options menu.
  test.describe('tile size', () => {
    test.use({viewport: {width: 1280, height: 800}});
    const LIST = rankingState('image-overwatch', {S: ['Reinhardt', 'Zarya'], '': ['Mauga', 'Winston']});

    test('renders 48 px tiles and rows with no names on the tiles when the user chooses Compact', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 80, height: 80});

      await tierList.rows.chooseTileSize('Compact');

      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 48, height: 48});
      expect(await tierList.sizeOf(tierList.item('Mauga'))).toEqual({width: 48, height: 48});
      expect((await tierList.sizeOf(tierList.tier('C'))).height).toBeLessThanOrEqual(49);
      await expect(tierList.item('Reinhardt')).not.toContainText('Reinhardt', {useInnerText: true});
      await expect(tierList.itemNameTag('Reinhardt')).toBeHidden();
    });

    test('renders the name under a Compact tile when the mouse is over the tile', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.rows.chooseTileSize('Compact');

      await tierList.hoverItem('Zarya');

      await expect(tierList.itemNameTag('Zarya')).toBeVisible();
      await expect(tierList.itemNameTag('Zarya')).toHaveText('Zarya');
      await expect(tierList.itemNameTag('Reinhardt')).toBeHidden();
    });

    test('renders Compact tiles when the page reloads after the user chose Compact', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.rows.chooseTileSize('Compact');

      await tierList.reload();

      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 48, height: 48});
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Compact')).toHaveAttribute('aria-checked', 'true');
    });

    test('renders 80 px tiles with their names when the user chooses Comfortable after Compact and restores item labels', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.rows.chooseTileSize('Compact');

      await tierList.rows.chooseTileSize('Comfortable');
      await tierList.rows.setItemLabelsVisible(true);

      expect(await tierList.sizeOf(tierList.item('Reinhardt'))).toEqual({width: 80, height: 80});
      await expect(tierList.item('Reinhardt')).toContainText('Reinhardt', {useInnerText: true});
    });

    test('writes no history entry when the user chooses Compact and Comfortable', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.rows.chooseTileSize('Compact');
      await tierList.rows.chooseTileSize('Comfortable');

      expect(await newEntries()).toBe(0);
    });

    // Owner decision, 2026-11-01: Compact tiles follow Show Labels, and choosing Compact turns it
    // off. Show Labels is a label setting, written in place of the current history entry (A3).
    test('writes no history entry and renders menu item "Hide Labels" checked when the user chooses Compact with item labels on', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await expect(tierList.itemCaption('Reinhardt')).toBeVisible();
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Show Labels')).toHaveAttribute('aria-checked', 'true');
      await tierList.pressKey('Escape');
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.rows.chooseTileSize('Compact');

      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Hide Labels')).toHaveAttribute('aria-checked', 'true');
      // The open menu hides the page from role queries, so the caption is checked after it closes.
      // A Compact tile keeps its name in a hidden tooltip, so the caption is hidden, not gone.
      await tierList.pressKey('Escape');
      await expect(tierList.rowOptionsButton).toHaveAttribute('aria-expanded', 'false');
      await expect(tierList.itemCaption('Reinhardt')).toBeHidden();
      expect(await newEntries()).toBe(0);
    });

    test('renders each name under its 48 px Compact tile when the user restores item labels after choosing Compact', async ({tierList}) => {
      await tierList.goto(TANKS, LIST);
      await tierList.rows.chooseTileSize('Compact');

      await tierList.rows.setItemLabelsVisible(true);

      for (const name of ['Reinhardt', 'Zarya', 'Mauga', 'Winston']) {
        await expect(tierList.itemCaption(name)).toBeVisible();
        const tile = (await tierList.item(name).getByRole('img').boundingBox())!;
        const caption = (await tierList.itemCaption(name).boundingBox())!;
        expect(Math.round(tile.width)).toBe(48);
        expect(caption.y).toBeGreaterThanOrEqual(tile.y + tile.height - 0.5);
      }
      await expect(tierList.itemNameTag('Reinhardt')).toHaveCount(0);
    });
  });
});
