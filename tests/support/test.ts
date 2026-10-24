import {test as base, expect, type Browser} from '@playwright/test';
import {TierListPage} from '../pages/TierListPage';
import {SitePage} from '../pages/SitePage';
import sharedLinks from '../fixtures/shared-links.json';

export interface SharedLinkFixture {
  id: string;
  source: string;
  format: 'v0' | 'v1' | 'v2';
  path: string;
  state: string;
  expected: {
    title: string;
    tiers: {name: string; items: string[]}[];
  };
}

/** Real links that people have shared. They must keep opening exactly as captured. */
export const SHARED_LINKS = sharedLinks as SharedLinkFixture[];

type Fixtures = {
  tierList: TierListPage;
  site: SitePage;
  /** Opens a link in a fresh browser context, as a friend who receives the link would. */
  openAsVisitor: (link: string) => Promise<TierListPage>;
};

export const test = base.extend<Fixtures>({
  tierList: async ({page}, use) => {
    await use(new TierListPage(page));
  },
  site: async ({page}, use) => {
    await use(new SitePage(page));
  },
  openAsVisitor: async ({browser}, use) => {
    const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
    await use(async (link: string) => {
      const context = await browser.newContext();
      contexts.push(context);
      const visitor = new TierListPage(await context.newPage());
      await visitor.gotoLink(link);
      return visitor;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

export {expect};

/** Asserts that the tier rows have exactly these names, in this order. */
export async function expectTierNames(tierList: TierListPage, names: string[]) {
  await expect(tierList.tiers).toHaveCount(names.length);
  for (let index = 0; index < names.length; index++) {
    await expect(tierList.tiers.nth(index), `tier ${index + 1} name`).toHaveAccessibleName(names[index]);
  }
}

/** Asserts that a page shows exactly the expected tiers and items, in order. */
export async function expectTierList(
  tierList: TierListPage,
  expected: {title?: string; tiers: {name: string; items: string[]}[]},
) {
  if (expected.title !== undefined) {
    await expect(tierList.title).toHaveText(expected.title);
  }
  await expect(tierList.tiers).toHaveCount(expected.tiers.length);
  for (let index = 0; index < expected.tiers.length; index++) {
    const tier = expected.tiers[index];
    const row = tierList.tiers.nth(index);
    await expect(row, `tier ${index + 1} name`).toHaveAccessibleName(tier.name);
    await expect(tierList.itemsIn(row), `items in tier "${tier.name}"`).toHaveText(tier.items);
  }
}
