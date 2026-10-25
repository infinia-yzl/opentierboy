import {expect, expectTierList, expectTierNames, test} from '../support/test';
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

test.describe('Long labels', () => {
  test('a very long tier name survives the next change, Back and a reload', async ({tierList, page}) => {
    // The editor accepts text of any length, so links must keep opening with it (A43).
    const longName = 'A very long tier name. '.repeat(87).trim();
    expect(longName.length).toBe(2_000);
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston']}));

    await tierList.renameTier('S', longName);
    await tierList.dragItemToTier('Winston', 'A');
    await page.goBack();

    await expect(tierList.itemsIn(longName)).toHaveText(['Mauga']);
    await expect(tierList.itemsIn('A')).toHaveCount(0);
    await page.reload();
    await expect(tierList.itemsIn(longName)).toHaveText(['Mauga']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Winston']);
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

  test('a shared list with moved rows switches to 7 rows like the list it came from (A2)', async ({tierList, openAsVisitor}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], C: ['Sigma']}));
    // Moving row S onto A's place moves the items and the tier id; the labels stay in place.
    await tierList.dragTierOnto('S', 'A');
    await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
    await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
    const friend = await openAsVisitor(await tierList.shareLink());

    // The switch puts items in the row with their tier id, so the link must keep the moved ids.
    const expected = {tiers: [
      {name: 'SS', items: []}, {name: 'S', items: ['Mauga']}, {name: 'A', items: ['Winston']}, {name: 'B', items: []},
      {name: 'C', items: ['Sigma']}, {name: 'D', items: []}, {name: 'F', items: []}, {name: 'Unranked', items: []},
    ]};
    await tierList.chooseRowCount(7);
    await expectTierList(tierList, expected);
    await friend.chooseRowCount(7);
    await expectTierList(friend, expected);
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

    expect(await tierList.tierLabelIsAbove('S', 'Mauga')).toBe(true);
  });
});

test.describe('Cancelling an edit', () => {
  test('Escape cancels renaming a tier', async ({tierList, page}) => {
    await tierList.goto(TANKS);
    const opened = page.url();

    const input = await tierList.typeTierName('S', 'Changed my mind');
    await input.press('Escape');

    await expect(tierList.main.getByRole('textbox')).toHaveCount(0);
    await expect(tierList.tiers.first()).toHaveAccessibleName('S');
    // Nothing was saved: clicking elsewhere keeps the old name, and the link is unchanged.
    await page.getByText('Drag to reorder.').click();
    await expect(tierList.tiers.first()).toHaveAccessibleName('S');
    await tierList.dragItemToTier('Mauga', 'A');
    await page.goBack();
    await expect(page).toHaveURL(opened);
  });

  test('Escape cancels changing the title', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    const opened = page.url();

    const input = await tierList.typeTitle('Changed my mind');
    await input.press('Escape');

    await expect(tierList.title).toHaveText('OVERWATCH - Tank');
    await expect(tierList.main.getByRole('textbox')).toHaveCount(0);
    await page.getByText('Drag to reorder.').click();
    await expect(tierList.title).toHaveText('OVERWATCH - Tank');
    await tierList.dragItemToTier('Mauga', 'A');
    await page.goBack();
    await expect(page).toHaveURL(opened);
  });
});
