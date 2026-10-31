import {expect, test} from '../support/test';
import {rankingState} from '../support/links';
import type {TierListPage} from '../pages/TierListPage';

const TANKS = '/rank/overwatch/tank';
const SUPPORT = '/rank/overwatch/sup';

/** Opens two lists, Tanks list then Support list. The editor records a list once it has started in the browser. */
async function openTwoLists(tierList: TierListPage) {
  await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Tanks list'));
  await tierList.waitUntilInteractive();
  await tierList.goto(SUPPORT, rankingState('image-overwatch', {S: ['Ana']}, 'Support list'));
  await tierList.waitUntilInteractive();
}

test.describe('home', () => {
  test('renders no section "Recently viewed" when the landing page opens before any list was opened', {tag: '@mobile'}, async ({site}) => {
    await site.gotoHome();
    await expect(site.heading('Create a New Tier List')).toBeVisible();
    await expect(site.recentlyViewed).toHaveCount(0);
  });

  test('renders the opened lists, newest first, and no template page when the landing page opens', {tag: '@mobile'}, async ({tierList, site}) => {
    await openTwoLists(tierList);
    // A template without a list is not recorded.
    await tierList.goto(TANKS);
    await tierList.waitUntilInteractive();

    await site.gotoHome();
    await expect(site.recentlyViewed).toContainText('Bookmark a list to keep it anywhere.');
    await expect(site.recentLinks).toHaveText(['Support list', 'Tanks list']);
  });

  test('renders the pinned list first, also after a reload, when the user pins it', {tag: '@mobile'}, async ({tierList, site, page}) => {
    await openTwoLists(tierList);
    await site.gotoHome();

    await site.recentPinButton('Tanks list').click();

    await expect(site.recentPinButton('Tanks list')).toHaveAttribute('aria-pressed', 'true');
    await expect(site.recentLinks).toHaveText(['Tanks list', 'Support list']);
    await page.reload();
    await expect(site.recentLinks).toHaveText(['Tanks list', 'Support list']);
    await expect(site.recentPinButton('Tanks list')).toHaveAttribute('aria-pressed', 'true');
  });

  test('renders the list in its opened place when the user unpins it', {tag: '@mobile'}, async ({tierList, site}) => {
    await openTwoLists(tierList);
    await site.gotoHome();
    await site.recentPinButton('Tanks list').click();
    await expect(site.recentLinks).toHaveText(['Tanks list', 'Support list']);

    await site.recentPinButton('Tanks list').click();

    await expect(site.recentPinButton('Tanks list')).toHaveAttribute('aria-pressed', 'false');
    await expect(site.recentLinks).toHaveText(['Support list', 'Tanks list']);
  });

  test('renders the other lists, also after a reload, when the user removes a list', {tag: '@mobile'}, async ({tierList, site, page}) => {
    await openTwoLists(tierList);
    await site.gotoHome();

    await site.removeRecentLink('Support list');

    await expect(site.recentLinks).toHaveText(['Tanks list']);
    await page.reload();
    await expect(site.recentLinks).toHaveText(['Tanks list']);
  });

  test('renders the list with its title and items when the user clicks it in Recently viewed', {tag: '@mobile'}, async ({tierList, site}) => {
    await openTwoLists(tierList);
    await site.gotoHome();

    await site.recentLink('Tanks list').click();

    await expect(tierList.title).toHaveText('Tanks list');
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
  });

  test('renders the list once in Recently viewed, with its opened title, when the user edits it after opening', async ({tierList, site}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}, 'Edited list'));
    await tierList.setTitle('New title');
    await tierList.renameTier('A', 'Great');
    await tierList.dragItemToTier('Winston', 'S');

    await site.gotoHome();
    await expect(site.recentLinks).toHaveText(['Edited list']);
  });

  test('renders the page name OVERWATCH - Tank in Recently viewed when the opened link has no title', {tag: '@mobile'}, async ({tierList, site}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    await tierList.waitUntilInteractive();
    await site.gotoHome();
    await expect(site.recentLinks).toHaveText(['OVERWATCH - Tank']);
  });
});
