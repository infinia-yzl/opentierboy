import {expect, test} from '../support/test';
import {rankingState} from '../support/links';

const TANKS = '/rank/overwatch/tank';
const SUPPORT = '/rank/overwatch/sup';

test.describe('Recently viewed', () => {
  test('the landing page shows no section before any list was opened', {tag: '@mobile'}, async ({site}) => {
    await site.gotoHome();
    await expect(site.main.getByRole('heading', {name: 'Create a New Tier List'})).toBeVisible();
    await expect(site.recentlyViewed).toHaveCount(0);
  });

  test('records opened lists; pin, unpin and remove; keeps them after a reload', {tag: '@mobile'}, async ({tierList, site, page}) => {
    // The editor records a list once it has started in the browser.
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Tanks list'));
    await tierList.waitUntilInteractive();
    await tierList.goto(SUPPORT, rankingState('image-overwatch', {S: ['Ana']}, 'Support list'));
    await tierList.waitUntilInteractive();
    // A template without a list is not recorded.
    await tierList.goto(TANKS);
    await tierList.waitUntilInteractive();

    await site.gotoHome();
    await expect(site.recentlyViewed).toContainText('Bookmark a list to keep it anywhere.');
    await expect(site.recentLinks).toHaveText(['Support list', 'Tanks list']);

    await site.recentPinButton('Tanks list').click();
    await expect(site.recentPinButton('Tanks list')).toHaveAttribute('aria-pressed', 'true');
    await expect(site.recentLinks).toHaveText(['Tanks list', 'Support list']);

    await page.reload();
    await expect(site.recentLinks).toHaveText(['Tanks list', 'Support list']);
    await expect(site.recentPinButton('Tanks list')).toHaveAttribute('aria-pressed', 'true');

    await site.recentPinButton('Tanks list').click();
    await expect(site.recentPinButton('Tanks list')).toHaveAttribute('aria-pressed', 'false');
    await expect(site.recentLinks).toHaveText(['Support list', 'Tanks list']);

    await site.removeRecentLink('Support list');
    await expect(site.recentLinks).toHaveText(['Tanks list']);
    await page.reload();
    await expect(site.recentLinks).toHaveText(['Tanks list']);

    await site.recentLinks.first().click();
    await expect(tierList.title).toHaveText('Tanks list');
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
  });

  test('records a list when it opens, not on every edit', async ({tierList, site}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}, 'Edited list'));
    await tierList.renameTier('A', 'Great');
    await tierList.dragItemToTier('Winston', 'S');

    await site.gotoHome();
    await expect(site.recentLinks).toHaveText(['Edited list']);
  });

  test('a list without its own title shows the page name', {tag: '@mobile'}, async ({tierList, site}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    await tierList.waitUntilInteractive();
    await site.gotoHome();
    await expect(site.recentLinks).toHaveText(['OVERWATCH - Tank']);
  });
});
