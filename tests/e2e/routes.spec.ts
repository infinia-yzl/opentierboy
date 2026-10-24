import {expect, expectTierNames, test} from '../support/test';
import {templateItemCount} from '../support/links';

// Official sets grow with new versions, so counts come from imageset.config.json.
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

test.describe('Template pages', {tag: '@mobile'}, () => {
  test('a template opens with all its items in Unranked', async ({tierList}) => {
    await tierList.goto('/rank/overwatch/tank');

    await expect(tierList.title).toHaveText('OVERWATCH - Tank');
    await expectTierNames(tierList, ['S', 'A', 'B', 'C', 'F', 'Unranked']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);
  });

  test('the npm package name works as the path too', async ({tierList}) => {
    await tierList.goto('/rank/image-overwatch/tank');

    await expect(tierList.title).toHaveText('OVERWATCH - Tank');
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);
  });

  test('an old tag path with underscores redirects and keeps the shared state', async ({tierList, page}) => {
    await tierList.goto('/rank/overwatch/h_all', 'this-state-must-survive');

    await expect(page).toHaveURL(/\/rank\/overwatch\/h-all\?state=this-state-must-survive$/);
    await expect(tierList.title).toHaveText('OVERWATCH - All Heroes');
  });

  test('/rank opens an empty custom tier list', async ({tierList}) => {
    await tierList.goto('/rank');

    await expect(tierList.title).toHaveText('Custom Tier List');
    await expectTierNames(tierList, ['S', 'A', 'B', 'C', 'F', 'Unranked']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(0);
  });
});
