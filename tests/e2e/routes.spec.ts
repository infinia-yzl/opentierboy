import {expect, expectTierNames, test} from '../support/test';
import {templateItemCount} from '../support/links';

// Active sets grow with new versions, so counts come from imageset.config.json.
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

test.describe('routes', {tag: '@mobile'}, () => {
  test('renders the title, 5 rows and all template items in Unranked when the page opens /rank/overwatch/tank', async ({tierList}) => {
    await tierList.goto('/rank/overwatch/tank');

    await expect(tierList.title).toHaveText('OVERWATCH - Tank');
    await expectTierNames(tierList, ['S', 'A', 'B', 'C', 'F', 'Unranked']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);
  });

  test('renders the template when the page opens the npm package name path /rank/image-overwatch/tank', async ({tierList}) => {
    await tierList.goto('/rank/image-overwatch/tank');

    await expect(tierList.title).toHaveText('OVERWATCH - Tank');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);
  });

  test('renders Custom Tier List with 5 empty rows and no items when the page opens /rank', async ({tierList}) => {
    await tierList.goto('/rank');

    await expect(tierList.title).toHaveText('Custom Tier List');
    await expectTierNames(tierList, ['S', 'A', 'B', 'C', 'F', 'Unranked']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });
});
