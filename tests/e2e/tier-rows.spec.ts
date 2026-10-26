import {expect, expectTierList, test} from '../support/test';
import {rankingState, v3State} from '../support/links';

const TANKS = '/rank/overwatch/tank';

test.describe('Adding and removing rows (#182)', () => {
  test('add a row above Unranked; Back takes it away again', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston']}));
    const entries = await tierList.historyLength();

    await tierList.addTierRow();

    // The new row is labelled after its position.
    await expect(tierList.tiers).toHaveCount(7);
    await expect(tierList.tiers.nth(5)).toHaveAccessibleName('Tier 6');
    await expect(tierList.tiers.last()).toHaveAccessibleName('Unranked');
    expect(await tierList.historyLength()).toBe(entries + 1);

    await tierList.page.goBack();
    await expect(tierList.tiers).toHaveCount(6);
    await expect(tierList.tier('Tier 6')).toHaveCount(0);
  });

  test('a new row can be named and filled, and the link carries it', async ({tierList, openAsVisitor}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));

    await tierList.addTierRow();
    await tierList.renameTier('Tier 6', 'D');
    await tierList.dragItemToTier('Mauga', 'D');

    const friend = await openAsVisitor(await tierList.shareLink());
    await expectTierList(friend, {
      tiers: [
        {name: 'S', items: []},
        {name: 'A', items: []},
        {name: 'B', items: []},
        {name: 'C', items: []},
        {name: 'F', items: []},
        {name: 'D', items: ['Mauga']},
        {name: 'Unranked', items: ['Winston']},
      ],
    });
  });

  test('remove a row: its items go to Unranked, and Back brings the row back', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], B: ['Winston', 'Sigma'], '': ['D.Va']}));
    const entries = await tierList.historyLength();

    await tierList.removeTierRow('B');

    await expect(tierList.tier('B')).toHaveCount(0);
    await expect(tierList.tiers).toHaveCount(5);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['D.Va', 'Winston', 'Sigma']);
    expect(await tierList.historyLength()).toBe(entries + 1);

    await tierList.page.goBack();
    await expect(tierList.itemsIn('B')).toHaveText(['Winston', 'Sigma']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['D.Va']);
  });

  test('Unranked cannot be removed, and one ranked row always stays', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    await tierList.chooseRowCount(3);

    expect(await tierList.rowChanges()).toEqual({canAdd: true, canRemove: true, removable: ['S', 'A', 'B']});

    await tierList.removeTierRow('A');
    await tierList.removeTierRow('B');

    expect(await tierList.rowChanges()).toEqual({canAdd: true, canRemove: false, removable: []});
    await expect(tierList.tiers).toHaveCount(2);
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
  });

  test('a list holds at most 20 rows, Unranked included', async ({tierList}) => {
    const rows = Array.from({length: 19}, (_, index) => [`row-${index + 1}`, `R${index + 1}`, []]);
    await tierList.goto(TANKS, v3State({r: [...rows, ['uncategorized', '', []]]}));
    await expect(tierList.tiers).toHaveCount(20);

    expect((await tierList.rowChanges()).canAdd).toBe(false);

    await tierList.removeTierRow('R7');
    await expect(tierList.tiers).toHaveCount(19);
    expect((await tierList.rowChanges()).canAdd).toBe(true);
  });
});
