import {expect, expectTierNames, test} from '../support/test';
import {rankingState} from '../support/links';

const TANKS = '/rank/overwatch/tank';

test.describe('Editing labels', () => {
  test('rename a tier, and the new name is part of the shared link', async ({tierList, openAsVisitor}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

    await tierList.renameTier('S', 'Must pick');

    await expect(tierList.itemsIn('Must pick')).toHaveText(['Mauga']);
    const friend = await openAsVisitor(await tierList.shareLink());
    await expect(friend.itemsIn('Must pick')).toHaveText(['Mauga']);
  });

  test('change the title, and the new title is part of the shared link', async ({tierList, openAsVisitor}) => {
    await tierList.goto(TANKS);

    await tierList.setTitle('My tank picks for ranked');

    const friend = await openAsVisitor(await tierList.shareLink());
    await expect(friend.title).toHaveText('My tank picks for ranked');
  });
});

test.describe('Editing labels, other ways', () => {
  test('clicking away from a tier label keeps the new name', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

    await tierList.typeTierName('S', 'Must pick');
    await tierList.page.getByText('Drag to reorder.').click();

    await expect(tierList.itemsIn('Must pick')).toHaveText(['Mauga']);
    await expect(tierList.tier('Must pick').getByRole('textbox')).toHaveCount(0);
  });

  test('clearing a tier label keeps the row and its items, also in the shared link', async ({
    tierList,
    openAsVisitor,
  }) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {A: ['Winston']}));

    await tierList.renameTier('A', '', 'Tier 2');

    await expectTierNames(tierList, ['S', 'Tier 2', 'B', 'C', 'F', 'Unranked']);
    await expect(tierList.itemsIn('Tier 2')).toHaveText(['Winston']);
    const friend = await openAsVisitor(await tierList.shareLink());
    await expectTierNames(friend, ['S', 'Tier 2', 'B', 'C', 'F', 'Unranked']);
    await expect(friend.itemsIn('Tier 2')).toHaveText(['Winston']);
  });
});

test.describe('Row settings', () => {
  test('switching to 3 rows moves items from removed rows into Unranked', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], C: ['Winston'], F: ['Sigma']}));

    await tierList.chooseRowCount(3);

    await expectTierNames(tierList, ['S', 'A', 'B', 'Unranked']);
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn(tierList.unranked)).toContainText(['Winston', 'Sigma']);
    await expect(tierList.tier('C')).toHaveCount(0);
  });

  test('switching to 7 rows adds the SS and D rows and keeps every item', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], F: ['Sigma']}));

    await tierList.chooseRowCount(7);

    await expectTierNames(tierList, ['SS', 'S', 'A', 'B', 'C', 'D', 'F', 'Unranked']);
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn('F')).toHaveText(['Sigma']);
  });

  test('hiding item labels keeps the items, without the captions', async ({tierList}) => {
    await tierList.goto(TANKS);

    await tierList.setItemLabelsVisible(false);
    await expect(tierList.item('Mauga')).toBeVisible();
    await expect(tierList.item('Mauga')).toHaveText('');

    await tierList.setItemLabelsVisible(true);
    await expect(tierList.item('Mauga')).toHaveText('Mauga');
  });

  test('putting tier labels on top places each label above its items', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

    await tierList.chooseLabelPosition('Top');

    const label = await tierList.tier('S').getByRole('heading', {name: 'S'}).boundingBox();
    const item = await tierList.item('Mauga').boundingBox();
    expect(label && item && label.y + label.height <= item.y).toBe(true);
  });
});

/**
 * Known bugs. Each test describes the correct behaviour and is marked `test.fail`, so the
 * suite stays green while the bug exists. See items.spec.ts for the convention.
 */
test.describe('Known bugs', () => {
  test('Escape cancels renaming a tier', async ({tierList}) => {
    test.fail(true, 'EditableLabel ignores Escape: the editor stays open and the next click saves the typed name.');
    await tierList.goto(TANKS);

    const input = await tierList.typeTierName('S', 'Changed my mind');
    await input.press('Escape');

    await expect(tierList.main.getByRole('textbox')).toHaveCount(0, {timeout: 3_000});
    await expect(tierList.tiers.first()).toHaveAccessibleName('S', {timeout: 3_000});
  });
});
