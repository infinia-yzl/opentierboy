import {expect, expectTierList, test} from '../support/test';
import {rankingState} from '../support/links';

const TANKS = '/rank/overwatch/tank';

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

/**
 * Known bugs. Each test describes the correct behaviour and is marked `test.fail`, so the
 * suite stays green while the bug exists. See items.spec.ts for the convention.
 */
test.describe('Known bugs', () => {
  test('Back to a template page without a link shows the template again', async ({tierList, page}) => {
    test.fail(true, 'The plain template address has no state, so the app keeps the list on screen.');
    await tierList.goto(TANKS);
    await tierList.dragItemToTier('Mauga', 'S');
    await tierList.dragItemToTier('Winston', 'A');

    await page.goBack();
    await page.goBack();

    await expect(page).toHaveURL(/\/rank\/overwatch\/tank$/);
    await expect(tierList.itemsIn('S')).toHaveCount(0, {timeout: 3_000});
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(13, {timeout: 3_000});
  });
});
