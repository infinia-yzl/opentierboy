import fs from 'node:fs';
import path from 'node:path';
import {expect, test} from '../support/test';
import {FIVE_ROW_TIERS, packageItemId, rankingState, rawState, templateItemCount, v3LinkJson} from '../support/links';
import {TierListPage} from '../pages/TierListPage';

const TANKS = '/rank/overwatch/tank';
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');
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
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);

    await tierList.undoFromToast('Items Added');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });

  test('adding a set twice does not create duplicates', async ({tierList}) => {
    await tierList.goto(TANKS);

    await tierList.addItemsFromTemplate('OVERWATCH', 'Tank');

    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);
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

  test('undo after Reset restores the ranking', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));
    await tierList.resetRankings();

    await tierList.undoFromToast('Items Reset');

    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
  });

  test('undo after adding a set keeps the items that were in the list before', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    await tierList.addItemsFromTemplate('OVERWATCH', 'Tank');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT - 1);

    await tierList.undoFromToast('Items Added');

    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });

  test('undo of a delete after Back does not show the item twice', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));
    const opened = page.url();
    await tierList.deleteItem('Mauga');
    await expect(page).not.toHaveURL(opened);

    await page.goBack();
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston']);
    await tierList.undoFromToast('Item deleted');

    await expect(tierList.toast('Item restored')).toBeVisible();
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston']);
  });

  test('undo after Remove All brings the items back', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    await tierList.removeAllItems();

    await tierList.undoFromToast('All Items Deleted');

    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
  });

  test('the page responds to clicks again after Remove All', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

    await tierList.removeAllItems();

    // A trial click runs every check of a real click, including that nothing covers the button.
    await tierList.shareButton.click({trial: true, timeout: 3_000});
  });

  test('closing the Remove All confirmation gives focus back to the Manage items button', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

    await tierList.removeAllItems();
    await expect(tierList.manageItemsButton).toBeFocused();

    await tierList.cancelRemoveAllItems();
    await expect(tierList.manageItemsButton).toBeFocused();
  });
});

/**
 * Uploads made before Phase 5c have ids from Math.random().toString(36).slice(2, 11), which can
 * be shorter than the 8 characters a v3 device image id needs (A40). The app writes such an id
 * as "legacy-<id>" (A42), and keeps its image in the device image store under that id.
 */
test.describe('Uploads from before v3 links', () => {
  test('an upload with a 5-character id survives open, change, share and reopen', async ({tierList, page}) => {
    await keepUploadInThisBrowser(page, {i: 'ab3c9', c: 'My cat', d: redSquareDataUrl()});

    await tierList.goto(TANKS, linkWithUpload('ab3c9', 'My cat'));
    await tierList.dragItemToTier('My cat', 'S');
    // The upload moved from localStorage into the device image store, under "legacy-ab3c9".
    await expect.poll(async () => isRed(await tierList.itemImageCenterColor('My cat'))).toBe(true);

    const link = await tierList.shareLink();
    expect(JSON.stringify(v3LinkJson(link))).toContain('{"d":"legacy-ab3c9","c":"My cat"}');
    await tierList.gotoLink(link);
    await expect(tierList.itemsIn('S')).toHaveText(['My cat']);
    await tierList.dragItemToTier('My cat', 'A');
    await expect.poll(async () => isRed(await tierList.itemImageCenterColor('My cat'))).toBe(true);
  });
});

/** An id that names no image-set item (here one with a dot, like a removed image) keeps its label (A45). */
test.describe('Unknown items in v3 links', () => {
  test('an unknown id with a label from an old link keeps its label after a change and a reopen', async ({tierList, openAsVisitor}) => {
    const oldLink = rawState({tiers: FIVE_ROW_TIERS.map((tier) => ({
      i: tier.id,
      n: tier.name,
      t: tier.id === 'uncategorized' ? [{i: 'image-overwatch-gone.webp', c: 'Gone hero'}, {i: packageItemId('image-overwatch', 'Mauga')}] : [],
    }))});
    await tierList.goto(TANKS, oldLink);
    await expect(tierList.item('Gone hero')).toBeVisible();

    await tierList.dragItemToTier('Gone hero', 'S');

    const link = await tierList.shareLink();
    expect(JSON.stringify(v3LinkJson(link))).toContain('{"i":"image-overwatch-gone.webp","c":"Gone hero"}');
    const friend = await openAsVisitor(link);
    await expect(friend.itemsIn('S')).toHaveText(['Gone hero']);
    await expect(friend.itemsIn(friend.unranked)).toHaveText(['Mauga']);
  });

  test('an item with an empty id from a hand-made link keeps its label after a change and a reload', async ({tierList}) => {
    // v3 links refuse empty ids, so the app gives the item an id of its own (item~1) when it opens.
    const handMade = rawState({tiers: FIVE_ROW_TIERS.map((tier) => ({
      i: tier.id,
      n: tier.name,
      t: tier.id === 'uncategorized' ? [{i: '', c: 'No id'}, {i: packageItemId('image-overwatch', 'Mauga')}] : [],
    }))});
    await tierList.goto(TANKS, handMade);

    await tierList.dragItemToTier('No id', 'S');
    await tierList.reload();

    await expect(tierList.itemsIn('S')).toHaveText(['No id']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga']);
  });
});

/**
 * Uploads live in the device image store (IndexedDB) since Phase 5c. The editor loads them in an
 * effect, after the page has started, so the server and the browser render the same list.
 */
test.describe('Uploads kept in this browser', () => {
  test('an upload kept in this browser shows its image right after the page loads', async ({tierList, page}) => {
    await keepUploadInThisBrowser(page, {i: 'k3j9x0a1b', c: 'My cat', d: redSquareDataUrl()});
    await tierList.goto(TANKS, linkWithUpload('k3j9x0a1b', 'My cat'));
    await expect.poll(async () => isRed(await tierList.itemImageCenterColor('My cat'))).toBe(true);
    // The upload moved into the device image store.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('customItems'))).toBeNull();
  });

  test('uploaded images still show after the tab is closed and reopened', {
    annotation: {type: 'issue', description: 'https://github.com/infinia-yzl/opentierboy/issues/86'},
  }, async ({tierList, context}) => {
    await tierList.goto('/rank');
    await tierList.addItemsFromDevice([path.join(IMAGES, 'red-square.png')]);
    const link = await tierList.shareLink();
    await tierList.page.close();

    const reopened = new TierListPage(await context.newPage());
    await reopened.gotoLink(link);

    const image = reopened.item('red-square').getByRole('img');
    await expect(image).toBeVisible();
    // The tile must show the uploaded red square. Checking only that an image loaded is not
    // enough: an item the app cannot find shows the placeholder image, which loads too.
    await expect.poll(async () => isRed(await reopened.itemImageCenterColor('red-square'))).toBe(true);
  });

});
/** The red test square as a data: URL, as an upload kept in localStorage holds its image. */
function redSquareDataUrl(): string {
  return `data:image/png;base64,${fs.readFileSync(path.join(IMAGES, 'red-square.png')).toString('base64')}`;
}

/** Keeps an upload in this browser's localStorage, as the app kept uploads before Phase 5c. */
async function keepUploadInThisBrowser(page: import('@playwright/test').Page, upload: {i: string; c: string; d: string}) {
  await page.addInitScript((stored) => localStorage.setItem('customItems', stored), JSON.stringify([upload]));
}

/** A v2 link with the upload and Mauga in Unranked. */
function linkWithUpload(id: string, label: string): string {
  return rawState({tiers: FIVE_ROW_TIERS.map((tier) => ({
    i: tier.id,
    n: tier.name,
    t: tier.id === 'uncategorized' ? [{i: id, c: label}, {i: packageItemId('image-overwatch', 'Mauga')}] : [],
  }))});
}

function isRed(color: [number, number, number] | null) {
  return color !== null && color[0] > 200 && color[1] < 60 && color[2] < 60;
}

/**
 * Known bugs. Each test describes the correct behaviour and is marked `test.fail`, so the
 * suite passes while the bug exists. When a fix lands, remove the marker and move the test.
 */
test.describe('Known bugs', () => {
  test('undo puts a deleted item back where it was', async ({tierList}) => {
    test.fail(true, 'Undo adds the restored item at the end of its tier (itemRestored in lib/tierListReducer.ts).');
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));

    await tierList.deleteItem('Mauga');
    await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
    await tierList.undoFromToast('Item deleted');

    await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston'], {timeout: 3_000});
  });
});

/** True when the browser decoded the image, so a broken image counts as not loaded. */
async function imageHasLoaded(image: import('@playwright/test').Locator) {
  return image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
}
