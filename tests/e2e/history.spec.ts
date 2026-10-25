import {expect, expectTierList, SHARED_LINKS, test} from '../support/test';
import {rankingState, templateItemCount} from '../support/links';

const TANKS = '/rank/overwatch/tank';
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

/**
 * Product rule: the browser history is the undo feature.
 *
 * Every change to the list writes a new link into the address bar as a new history
 * entry, so the browser Back button steps back to the previous version of the list, one
 * change at a time. This is intended. Do not change the app to replace history entries.
 */
test.describe('Browser history', () => {
  test('Back after Reset restores the previous ranking', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], '': ['Sigma']}));
    await tierList.resetRankings();
    await expect(tierList.itemsIn('S')).toHaveCount(0);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Sigma', 'Winston']);

    await page.goBack();

    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Sigma']);
  });

  test('Back steps back through edits one change at a time', async ({tierList, page}) => {
    // Start from a shared link, as a list that someone keeps editing does.
    await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
    await tierList.dragItemToTier('Mauga', 'S');
    await tierList.dragItemToTier('Winston', 'A');
    await expect(tierList.itemsIn('A')).toHaveText(['Winston']);

    await page.goBack();
    await expectTierList(tierList, {
      tiers: [
        {name: 'S', items: ['Mauga']},
        {name: 'A', items: []},
        {name: 'B', items: []},
        {name: 'C', items: []},
        {name: 'F', items: []},
        {name: 'Unranked', items: ['Winston', 'Sigma']},
      ],
    });

    await page.goBack();
    await expect(tierList.itemsIn('S')).toHaveCount(0);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Winston', 'Sigma']);

    await page.goForward();
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
  });
});

test.describe('Browser history and the template page', () => {
  test('Back to a template page without a link shows the template again', async ({tierList, page}) => {
    await tierList.goto(TANKS);
    await tierList.dragItemToTier('Mauga', 'S');
    await tierList.dragItemToTier('Winston', 'A');
    const entries = await tierList.historyLength();

    await page.goBack();
    await page.goBack();

    await expect(page).toHaveURL(/\/rank\/overwatch\/tank$/);
    await expect(tierList.itemsIn('S')).toHaveCount(0);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);
    // Showing the template again writes nothing: Forward still works (A6).
    expect(await tierList.historyLength()).toBe(entries);
    await page.goForward();
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn('A')).toHaveCount(0);
  });
});

/**
 * Opening a link never writes the address (A1): the address and the history stay as they
 * are, so Back leaves the list. Only a change to the list writes a new link.
 */
test.describe('Opening a link', () => {
  for (const id of ['link-001', 'link-012', 'link-002']) {
    const link = SHARED_LINKS.find((entry) => entry.id === id)!;
    test(`opening a ${link.format} link (${id}) leaves the address and the history as they are`, async ({tierList, page}) => {
      await page.goto('/about');
      const entries = await tierList.historyLength();

      await tierList.gotoAndSettle(link.path, link.state);
      await expect(tierList.title).toHaveText(link.expected.title);
      const opened = new URL(`${link.path}?state=${link.state}`, page.url()).href;
      expect(page.url()).toBe(opened);
      expect(await tierList.historyLength()).toBe(entries + 1);

      // One change, then Back, returns to exactly this link.
      await tierList.setTitle('Changed');
      await page.goBack();
      await expect(page).toHaveURL(opened);
      await expect(tierList.title).toHaveText(link.expected.title);
    });
  }
});

test.describe('Browser history and settings', () => {
  test('changing the label position or hiding the labels adds no history entry', async ({tierList, page}) => {
    for (const state of [undefined, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston']})]) {
      await tierList.goto(TANKS, state);
      const opened = page.url();

      await tierList.chooseLabelPosition('Top');
      await tierList.setItemLabelsVisible(false);
      await tierList.dragItemToTier('Winston', 'A');

      // Back after the one change to the list goes straight back to the page as opened.
      await page.goBack();
      await expect(page).toHaveURL(opened);
      await expect(tierList.itemsIn('A')).toHaveCount(0);
    }
  });

  test('Undo from a toast adds a new history entry', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));
    const entries = await tierList.historyLength();
    await tierList.resetRankings();

    const reset = page.url();
    await tierList.undoFromToast('Items Reset');
    await expect(page).not.toHaveURL(reset);
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    expect(await tierList.historyLength()).toBe(entries + 2);

    // Back steps to the reset list, then to the list as opened.
    await page.goBack();
    await expect(tierList.itemsIn('S')).toHaveCount(0);
    await page.goBack();
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
  });
});
