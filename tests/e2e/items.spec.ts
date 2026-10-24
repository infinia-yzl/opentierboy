import path from 'node:path';
import {expect, test} from '../support/test';
import {rankingState} from '../support/links';
import {TierListPage} from '../pages/TierListPage';

const TANKS = '/rank/overwatch/tank';
const IMAGES = path.join(__dirname, '..', 'fixtures', 'images');

test.describe('Managing items', () => {
  test('delete an item, then undo the delete', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));

    await tierList.deleteItem('Mauga');
    await expect(tierList.toast('Item deleted')).toBeVisible();
    await expect(tierList.itemsIn('S')).toHaveText(['Winston']);

    await tierList.undoFromToast('Item deleted');
    await expect(tierList.itemsIn('S')).toContainText(['Mauga']);
  });

  test('add a template set to an empty tier list, then undo it', async ({tierList}) => {
    await tierList.goto('/rank');
    await expect(tierList.title).toHaveText('Custom Tier List');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);

    await tierList.addItemsFromTemplate('OVERWATCH', 'Tank');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(13);

    await tierList.undoFromToast('Items Added');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });

  test('adding a set twice does not create duplicates', async ({tierList}) => {
    await tierList.goto(TANKS);

    await tierList.addItemsFromTemplate('OVERWATCH', 'Tank');

    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(13);
  });

  test('upload images from the device', async ({tierList}) => {
    await tierList.goto('/rank');

    await tierList.addItemsFromDevice([path.join(IMAGES, 'red-square.png'), path.join(IMAGES, 'blue-square.png')]);

    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square', 'blue-square']);
    await expect.poll(() => imageHasLoaded(tierList.item('red-square').getByRole('img'))).toBe(true);
  });

  test('reset puts every item back in Unranked', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], '': ['Sigma']}));

    await tierList.resetRankings();

    await expect(tierList.toast('Items Reset')).toBeVisible();
    await expect(tierList.itemsIn('S')).toHaveCount(0);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Sigma', 'Winston']);
  });

  test('remove all items after confirming', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Sigma']}));

    await tierList.removeAllItems();

    await expect(tierList.toast('All Items Deleted')).toBeVisible();
    await expect(tierList.itemsIn('S')).toHaveCount(0);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });
});

/**
 * Known bugs. Each test describes the correct behaviour and is marked `test.fail`, so the
 * suite stays green while the bug exists. When a fix lands, the test starts to pass,
 * Playwright reports "Expected to fail, but passed", and the marker must be removed.
 */
test.describe('Known bugs', () => {
  test('uploaded images still show after the tab is closed and reopened', {
    annotation: {type: 'issue', description: 'https://github.com/infinia-yzl/opentierboy/issues/86'},
  }, async ({tierList, context}) => {
    test.fail(true, 'Uploads are kept as blob: URLs, which stop working once the tab closes.');
    await tierList.goto('/rank');
    await tierList.addItemsFromDevice([path.join(IMAGES, 'red-square.png')]);
    const link = await tierList.shareLink();
    await tierList.page.close();

    const reopened = new TierListPage(await context.newPage());
    await reopened.gotoLink(link);

    const image = reopened.item('red-square').getByRole('img');
    await expect(image).toBeVisible();
    await expect.poll(() => imageHasLoaded(image), {timeout: 3_000}).toBe(true);
  });

  test('undo after Reset restores the ranking', async ({tierList}) => {
    test.fail(true, 'TierListManager.handleTiersUpdate overwrites the saved ranking that Undo needs.');
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));
    await tierList.resetRankings();

    await tierList.undoFromToast('Items Reset');

    // Short timeouts: these assertions are expected to fail until the bug is fixed.
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga'], {timeout: 3_000});
    await expect(tierList.itemsIn('A')).toHaveText(['Winston'], {timeout: 3_000});
  });

  test('undo after Remove All brings the items back', async ({tierList, page}) => {
    test.fail(true, 'TierListManager.handleTiersUpdate overwrites the saved ranking that Undo needs.');
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    await tierList.removeAllItems();
    // Work around the frozen page (next test), so that this test checks Undo alone.
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await page.keyboard.press('Escape');
    await tierList.shareButton.click({trial: true});

    await tierList.undoFromToast('All Items Deleted');

    await expect(tierList.itemsIn('S')).toHaveText(['Mauga'], {timeout: 3_000});
  });

  test('the page responds to clicks again after Remove All', async ({tierList}) => {
    test.fail(true, 'The confirm dialog sits inside the open menu, and the menu stays open and blocks the page.');
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

    await tierList.removeAllItems();

    // A trial click runs every check of a real click, including that nothing covers the button.
    await tierList.shareButton.click({trial: true, timeout: 3_000});
  });
});

/** True when the browser decoded the image, so a broken image counts as not loaded. */
async function imageHasLoaded(image: import('@playwright/test').Locator) {
  return image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
}
