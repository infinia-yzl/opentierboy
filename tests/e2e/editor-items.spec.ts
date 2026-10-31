/** Adding, removing and resetting items in the editor, and items the image sets do not know. */
import path from 'node:path';
import {expect, test} from '../support/test';
import {FIVE_ROW_TIERS, packageItemId, rankingState, rawState, templateItemCount, v3LinkJson} from '../support/links';

const TANKS = '/rank/overwatch/tank';

const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

const IMAGES = path.join(__dirname, '..', 'fixtures', 'images');

test.describe('editor items', () => {
  test.describe('item actions', () => {
    test('renders the item again in row S when the user deletes it and clicks Undo in the toast "Item deleted"', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));

      await tierList.deleteItem('Mauga');
      await expect(tierList.toast('Item deleted')).toBeVisible();
      await expect(tierList.itemsIn('S')).toHaveText(['Winston']);

      await tierList.undoFromToast('Item deleted');
      await expect(tierList.itemsIn('S')).toContainText(['Mauga']);
    });

    test('renders the Tank set items, then none after Undo, when the user adds the set to an empty list', async ({tierList}) => {
      await tierList.goto('/rank');
      await expect(tierList.title).toHaveText('Custom Tier List');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);

      await tierList.addItemsFromTemplate('OVERWATCH', 'Tank');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);

      await tierList.undoFromToast('Items Added');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders each item once when the user adds the template set the list already has', async ({tierList}) => {
      await tierList.goto(TANKS);

      await tierList.addItemsFromTemplate('OVERWATCH', 'Tank');

      // Wait for the add to happen: the count is already right before it does.
      await expect(tierList.toast('Items Added')).toBeVisible();
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);
    });

    test('renders the images as Unranked items when the user uploads 2 images from the device', async ({tierList}) => {
      await tierList.goto('/rank');

      await tierList.addItemsFromDevice([path.join(IMAGES, 'red-square.png'), path.join(IMAGES, 'blue-square.png')]);

      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['red-square', 'blue-square']);
      await expect.poll(() => tierList.itemImageHasLoaded('red-square')).toBe(true);
    });

    test('renders every item in Unranked and the toast "Items Reset" when the user chooses Reset', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], '': ['Sigma']}));

      await tierList.resetRankings();

      await expect(tierList.toast('Items Reset')).toBeVisible();
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Sigma', 'Winston']);
    });

    test('renders no items and the toast "All Items Deleted" when the user confirms Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Sigma']}));

      await tierList.removeAllItems();

      await expect(tierList.toast('All Items Deleted')).toBeVisible();
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders the previous ranking when the user clicks Undo after Reset', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));
      await tierList.resetRankings();

      await tierList.undoFromToast('Items Reset');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
    });

    test('renders the items from before the add when the user clicks Undo after adding a template set', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.addItemsFromTemplate('OVERWATCH', 'Tank');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT - 1);

      await tierList.undoFromToast('Items Added');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
    });

    test('renders each item once when the user goes Back after a delete and clicks Undo in the toast', async ({tierList, page}) => {
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

    test('renders the items again when the user clicks Undo after Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.removeAllItems();

      await tierList.undoFromToast('All Items Deleted');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });

    test('renders button "Share" uncovered and clickable when the user confirms Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.removeAllItems();

      // A trial click runs every check of a real click, including that nothing covers the button.
      await tierList.shareButton.click({trial: true, timeout: 3_000});
    });

    test('renders focus on button "Add images" when the user confirms Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.removeAllItems();

      await expect(tierList.manageItemsButton).toBeFocused();
    });

    test('renders focus on button "Add images" when the user cancels Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.cancelRemoveAllItems();

      await expect(tierList.manageItemsButton).toBeFocused();
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });
  });

  /** An id that names no image-set item (here one with a dot, like a removed image) keeps its label (A45). */
  test.describe('unknown items in v3 links', () => {
    test('writes an {i, c} item with its label to the link when the user moves an unknown item id from an old link', async ({tierList, openAsVisitor}) => {
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

    test('renders the label of an item with an empty id after a reload when the user moves it to row S', async ({tierList}) => {
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
   * Known bugs. Each test describes the correct behaviour and is marked `test.fail`, so the
   * suite passes while the bug exists. When a fix lands, remove the marker and move the test.
   */
  test.describe('Known bugs', () => {
    test('renders the restored item at its old position when the user clicks Undo after a delete', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));

      await tierList.deleteItem('Mauga');
      await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
      await tierList.undoFromToast('Item deleted');
      await expect(tierList.itemsIn('S')).toHaveCount(2);

      // Marked here, after the steps that must work: a failure above fails the test as usual.
      test.fail(true, 'Undo adds the restored item at the end of its tier (itemRestored in lib/tierListReducer.ts).');
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston'], {timeout: 3_000});
    });
  });
});
