import {expect, test} from '../support/test';

test.describe('site pages', () => {
  test('renders the 4 feature headings when the user opens About from the navigation', async ({site}) => {
    await site.gotoHome();
    await site.openFromNavigation('About');

    for (const heading of ['Community Driven & Open-Source', 'Ad-Free Experience', 'Easy Sharing', 'Customizable']) {
      await expect(site.heading(heading)).toBeVisible();
    }
  });

  test('renders the list title and 6 items in row S when the user opens the tier list link of a blog article', async ({site, tierList}) => {
    await site.gotoHome();
    await site.openFromNavigation('Blog');
    await site.mainLink(/THE FINALS Season 3 World/).click();

    // Article links point at the live site and open in a new tab. The test checks the
    // link, then opens the same path on the server under test, so it never depends on
    // production.
    const link = site.mainLink(/THE FINALS S3 - LIGHT All-/).first();
    await expect(link).toHaveAttribute('href', /^https:\/\/(www\.)?opentierboy\.com\/rank\/.+\?state=/);
    const href = new URL((await link.getAttribute('href'))!);
    await tierList.gotoLink(href.pathname + href.search);

    await expect(tierList.title).toHaveText('THE FINALS S3 - LIGHT All-Rounder');
    await expect(tierList.itemsIn('S')).toHaveCount(6);
  });
});
