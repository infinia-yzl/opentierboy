import {expect, expectTierList, test} from '../support/test';
import {rankingState, templateItemCount} from '../support/links';

const TANKS = '/rank/overwatch/tank';
// Official sets grow with new versions, so counts come from imageset.config.json.
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

test.describe('Ranking items', () => {
  test('drag an item from Unranked into a tier', async ({tierList}) => {
    await tierList.goto(TANKS);

    await tierList.dragItemToTier('Mauga', 'S');

    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT - 1);
    await expect(tierList.unranked.getByRole('button', {name: 'Mauga'})).toHaveCount(0);
  });

  test('drag an item from one tier to another', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));

    await tierList.dragItemToTier('Winston', 'B');

    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn('B')).toHaveText(['Winston']);
  });

  test('a friend who opens the link sees the same ranking', async ({tierList, openAsVisitor}) => {
    await tierList.goto(TANKS);
    await tierList.dragItemToTier('Mauga', 'S');
    await tierList.dragItemToTier('Winston', 'A');
    await expect(tierList.itemsIn('A')).toHaveText(['Winston']);

    const friend = await openAsVisitor(await tierList.shareLink());

    await expect(friend.title).toHaveText('OVERWATCH - Tank');
    await expect(friend.itemsIn('S')).toHaveText(['Mauga']);
    await expect(friend.itemsIn('A')).toHaveText(['Winston']);
    await expect(friend.itemsIn(friend.unranked)).toHaveCount(TANK_COUNT - 2);
  });

  test('drag an item onto another item in the same tier to reorder it', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston', 'Sigma']}));

    await tierList.dragItemOnto('Sigma', 'Mauga');

    await expect(tierList.itemsIn('S')).toHaveText(['Sigma', 'Mauga', 'Winston']);
  });

  test('moving a row moves its items, and the labels stay in order', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));

    await tierList.dragTierOnto('S', 'A');

    // The labels describe positions, so S stays on top and the contents swap.
    await expectTierList(tierList, {
      tiers: [
        {name: 'S', items: ['Winston']},
        {name: 'A', items: ['Mauga']},
        {name: 'B', items: []},
        {name: 'C', items: []},
        {name: 'F', items: []},
        {name: 'Unranked', items: []},
      ],
    });
  });
});

test.describe('Ranking with the keyboard', () => {
  test('move an item up into the tier above', async ({tierList}) => {
    await tierList.goto(TANKS);

    await tierList.moveItemWithKeyboard('Mauga', ['ArrowUp']);

    await expect(tierList.itemsIn('F')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT - 1);
  });

  test('reorder items inside a tier', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston', 'Sigma']}));

    await tierList.moveItemWithKeyboard('Sigma', ['ArrowLeft', 'ArrowLeft']);

    await expect(tierList.itemsIn('S')).toHaveText(['Sigma', 'Mauga', 'Winston']);
  });

  test('move a row down by its handle, and the labels stay in order', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));

    await tierList.moveTierWithKeyboard('S', ['ArrowDown']);

    await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
    await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
    await expect(tierList.tiers.first()).toHaveAccessibleName('S');
  });
});
