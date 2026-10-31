import {expect, expectTierList, expectTierNames, test} from '../support/test';
import {rankingState} from '../support/links';

const TANKS = '/rank/overwatch/tank';

test.describe('editor labels', () => {
  test.describe('renames', () => {
    test('renders the new row label, also for a visitor of the share link, when the user renames row S', async ({tierList, openAsVisitor}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.renameTier('S', 'Must pick');

      await expect(tierList.itemsIn('Must pick')).toHaveText(['Mauga']);
      const friend = await openAsVisitor(await tierList.shareLink());
      await expect(friend.itemsIn('Must pick')).toHaveText(['Mauga']);
    });

    test('renders the new title for a visitor of the share link when the user changes the title', async ({tierList, openAsVisitor}) => {
      await tierList.goto(TANKS);

      await tierList.setTitle('My tank picks for ranked');

      const friend = await openAsVisitor(await tierList.shareLink());
      await expect(friend.title).toHaveText('My tank picks for ranked');
    });
  });

  test.describe('blur and clear', () => {
    test('renders the new row label and no text box when the user types a name and clicks outside the label', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.typeTierName('S', 'Must pick');
      await tierList.hints.click();

      await expect(tierList.itemsIn('Must pick')).toHaveText(['Mauga']);
      await expect(tierList.tierNameInput('Must pick')).toHaveCount(0);
    });

    test('renders the label Tier 2 and the row items, also from the share link, when the user clears row label A', async ({
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

  test.describe('long labels', () => {
    test('renders a 2,000-character row label after a later change, Back and a reload when the user renames row S', async ({tierList, page}) => {
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

  test.describe('row settings', () => {
    test('renders the items of removed rows in Unranked when the user chooses 3 Rows', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], C: ['Winston'], F: ['Sigma']}));

      await tierList.chooseRowCount(3);

      await expectTierNames(tierList, ['S', 'A', 'B', 'Unranked']);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn(tierList.unranked)).toContainText(['Winston', 'Sigma']);
      await expect(tierList.tier('C')).toHaveCount(0);
    });

    test('renders rows SS and D and every item in its row when the user chooses 7 Rows', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], F: ['Sigma']}));

      await tierList.chooseRowCount(7);

      await expectTierNames(tierList, ['SS', 'S', 'A', 'B', 'C', 'D', 'F', 'Unranked']);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('F')).toHaveText(['Sigma']);
    });

    test('renders the same 7 rows for the user and a share link visitor when both choose 7 Rows after a row move', async ({tierList, openAsVisitor}) => {
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

    test('renders items without captions, then with captions, when the user hides, then restores item labels', async ({tierList}) => {
      await tierList.goto(TANKS);

      await tierList.setItemLabelsVisible(false);
      await expect(tierList.item('Mauga')).toBeVisible();
      await expect(tierList.item('Mauga')).toHaveText('');

      await tierList.setItemLabelsVisible(true);
      await expect(tierList.item('Mauga')).toHaveText('Mauga');
    });

    test('renders each row label above its items when the user chooses the label position Top', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.chooseLabelPosition('Top');

      await expect.poll(() => tierList.tierLabelIsAbove('S', 'Mauga')).toBe(true);
    });
  });

  test.describe('cancelled edits', () => {
    test('renders the old row label and writes no URL change when the user presses Escape while renaming row S', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      const opened = page.url();

      const input = await tierList.typeTierName('S', 'Changed my mind');
      await input.press('Escape');

      await expect(tierList.openTextBoxes).toHaveCount(0);
      await expect(tierList.tiers.first()).toHaveAccessibleName('S');
      // Nothing was saved: clicking elsewhere keeps the old name, and the link is unchanged.
      await tierList.hints.click();
      await expect(tierList.tiers.first()).toHaveAccessibleName('S');
      await tierList.dragItemToTier('Mauga', 'A');
      await page.goBack();
      await expect(page).toHaveURL(opened);
    });

    test('renders the old title and writes no URL change when the user presses Escape while editing the title', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      const opened = page.url();

      const input = await tierList.typeTitle('Changed my mind');
      await input.press('Escape');

      await expect(tierList.title).toHaveText('OVERWATCH - Tank');
      await expect(tierList.openTextBoxes).toHaveCount(0);
      await tierList.hints.click();
      await expect(tierList.title).toHaveText('OVERWATCH - Tank');
      await tierList.dragItemToTier('Mauga', 'A');
      await page.goBack();
      await expect(page).toHaveURL(opened);
    });
  });
});
