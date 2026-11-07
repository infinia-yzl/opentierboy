import {expect, test} from '../support/test';
import {LEGACY_SETS, legacyItems, packageItemId, rawState} from '../support/links';

/**
 * Legacy image sets are frozen in the repository (imageset.legacy.json, images in
 * public/images/<package>/). They are hidden from the template picker, the landing page and
 * the sitemap, but their pages, old links and previews keep working.
 */
test.describe('legacy sets', () => {
  test.describe('rank pages', {tag: '@mobile'}, () => {
    for (const set of LEGACY_SETS) {
      test(`renders all items of ${set.displayName} in Unranked when the page opens its package name path`, async ({tierList}) => {
        await tierList.goto(`/rank/${set.packageName}/all`);

        await expect(tierList.title).toHaveText(`${set.displayName} - All Items`);
        await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(legacyItems(set.packageName).length);
        await expect.poll(() => tierList.itemImageHasLoaded(legacyItems(set.packageName)[0])).toBe(true);
      });

      test(`renders all items of ${set.displayName} in Unranked when the page opens its display name path`, async ({tierList}) => {
        await tierList.goto(`/rank/${set.slug}/all`);

        await expect(tierList.title).toHaveText(`${set.displayName} - All Items`);
        await expect(tierList.itemsIn(tierList.unranked)).toHaveText(legacyItems(set.packageName));
      });

      test(`renders the tag items of ${set.displayName} in Unranked when the page opens its tag path by display name`, async ({tierList}) => {
        await tierList.goto(`/rank/${set.slug}/${set.tagPath}`);

        const items = legacyItems(set.packageName, set.tag);
        await expect(tierList.title).toHaveText(`${set.displayName} - ${set.tagTitle}`);
        await expect(tierList.itemsIn(tierList.unranked)).toHaveText(items);
        await expect.poll(() => tierList.itemImageHasLoaded(items[items.length - 1])).toBe(true);
      });
    }

    test('writes the hyphenated path with the same state parameter when the page opens an old tag path with underscores', async ({tierList, page}) => {
      await tierList.goto('/rank/wuthering-waves/c_all', 'this-state-must-survive');

      await expect(page).toHaveURL(/\/rank\/wuthering-waves\/c-all\?state=this-state-must-survive$/);
      await expect(tierList.title).toHaveText('WUTHERING WAVES - All Resonators');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(legacyItems('image-wutheringwaves', 'c_all').length);
    });

    test('renders every item image when the page opens a link with items from every legacy set', async ({tierList}) => {
      const firsts = LEGACY_SETS.map((set) => ({packageName: set.packageName, label: legacyItems(set.packageName)[0]}));
      const lasts = LEGACY_SETS.map((set) => ({packageName: set.packageName, label: legacyItems(set.packageName).at(-1)!}));
      await tierList.goto('/rank/supervive/hunter', rawState({
        title: 'Every legacy set',
        tiers: [
          {i: 'tier-s', n: 'S', t: firsts.map(({packageName, label}) => ({i: packageItemId(packageName, label)}))},
          {i: 'tier-a', n: 'A', t: lasts.map(({packageName, label}) => ({i: packageItemId(packageName, label)}))},
          {i: 'uncategorized', n: '', t: []},
        ],
      }));

      await expect(tierList.title).toHaveText('Every legacy set');
      await expect(tierList.itemsIn('S')).toHaveText(firsts.map(({label}) => label));
      await expect(tierList.itemsIn('A')).toHaveText(lasts.map(({label}) => label));
      for (const {label} of [...firsts, ...lasts]) {
        await expect.poll(() => tierList.itemImageHasLoaded(label), `image of ${label}`).toBe(true);
      }
    });
  });

  test.describe('template picker and landing page', () => {
    test('renders OVERWATCH and THE FINALS and no legacy set in the template picker when the user searches legacy names', async ({tierList}) => {
      await tierList.goto('/rank');
      await tierList.openTemplatePicker();

      await expect(tierList.templateOption()).toHaveText(['OVERWATCH', 'THE FINALS']);
      for (const set of LEGACY_SETS) {
        await tierList.searchTemplates(set.tagTitle);
        await expect(tierList.templateOption(set.displayName)).toHaveCount(0);
        await tierList.searchTemplates(set.packageName);
        await expect(tierList.templateOption(set.displayName)).toHaveCount(0);
      }
      // The search still finds the tags of the active sets.
      await tierList.searchTemplates('Tank');
      await expect(tierList.templateOption(/^Tank\b.*OVERWATCH/)).toBeVisible();
    });

    test('renders cards and links for the active sets and no legacy set when the landing page opens', {tag: '@mobile'}, async ({site}) => {
      await site.gotoHome();

      await expect(site.cardTitles).toHaveText(['THE FINALS', 'OVERWATCH', 'Your own list']);
      const targets = await site.linkTargets();
      expect(targets).toContain('/rank/the-finals/all');
      expect(targets).toContain('/rank/overwatch/tank');
      for (const set of LEGACY_SETS) {
        const legacyTargets = targets.filter((href) => href.includes(`/${set.slug}/`) || href.includes(`/${set.packageName}/`));
        expect(legacyTargets, `links to ${set.displayName}`).toEqual([]);
      }
    });
  });
});
