import {test as base, expect, type Browser, type BrowserContext} from '@playwright/test';
import {TierListPage} from '../pages/TierListPage';
import {SitePage} from '../pages/SitePage';
import sharedLinks from '../fixtures/shared-links.json';
import {sendBypassOnlyToSite} from './vercel-bypass';

export interface SharedLinkFixture {
  id: string;
  source: string;
  format: 'v0' | 'v1' | 'v2' | 'v3';
  path: string;
  state: string;
  expected: {
    title: string;
    tiers: {name: string; items: string[]}[];
  };
}

/** Real links that people have shared. They must keep opening exactly as captured. */
export const SHARED_LINKS = sharedLinks as SharedLinkFixture[];

export interface VisitorOptions {
  /** Runs on the new browser context before the link opens, for example to play an image site. */
  beforeOpen?: (context: BrowserContext) => Promise<unknown>;
}

type Fixtures = {
  tierList: TierListPage;
  site: SitePage;
  /** Opens a link in a fresh browser context, as a friend who receives the link would. */
  openAsVisitor: (link: string, options?: VisitorOptions) => Promise<TierListPage>;
  /**
   * Requests to hosts other than the site under test and local addresses that no test route
   * answered. They are blocked, and the test fails if there are any: tests never reach real
   * external sites (play them with tests/support/imageSites.ts).
   */
  externalRequests: string[];
  /** Errors that the page logged to the browser console or threw, collected during the test. */
  consoleErrors: string[];
  /**
   * Reads the Content Security Policy violations that the page reported so far (the
   * `securitypolicyviolation` events of every page load in this test).
   */
  cspViolations: () => Promise<string[]>;
};

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
/**
 * The Vercel Toolbar that Vercel adds to preview deployments (the hosts that
 * lib/security/csp.ts allows with `vercelToolbar`). Allowed only when the tests run against a
 * deployment.
 */
const VERCEL_TOOLBAR_HOSTNAMES = ['vercel.live', 'vercel.com', 'assets.vercel.com'];

/** True for the site under test, local addresses, and Vercel's toolbar on a deployment. */
function isSiteOrLocal(url: URL, siteURL: URL | undefined): boolean {
  if (url.host === siteURL?.host || LOCAL_HOSTNAMES.includes(url.hostname)) return true;
  const deployed = siteURL !== undefined && !LOCAL_HOSTNAMES.includes(siteURL.hostname);
  return deployed && VERCEL_TOOLBAR_HOSTNAMES.includes(url.hostname);
}

/**
 * Blocks and records every request to another host that no route of the test answers. Routes
 * registered later (a test's own) run first, so this one only sees what nothing else handled.
 */
async function blockExternalRequests(context: BrowserContext, baseURL: string | undefined, blocked: string[]) {
  const siteURL = baseURL ? new URL(baseURL) : undefined;
  await context.route(
    (url) => (url.protocol === 'http:' || url.protocol === 'https:') && !isSiteOrLocal(url, siteURL),
    async (route) => {
      blocked.push(route.request().url());
      await route.abort('blockedbyclient');
    },
  );
}

export const test = base.extend<Fixtures>({
  externalRequests: [async ({}, use) => {
    const blocked: string[] = [];
    await use(blocked);
    expect(blocked, 'requests to external hosts that no test route answered').toEqual([]);
  }, {auto: true}],
  // Against a protected Vercel deployment, send the bypass secret to that site only.
  context: async ({context, baseURL, externalRequests}, use) => {
    await blockExternalRequests(context, baseURL, externalRequests);
    await sendBypassOnlyToSite(context, baseURL);
    await use(context);
  },
  tierList: async ({page}, use) => {
    await use(new TierListPage(page));
  },
  site: async ({page}, use) => {
    await use(new SitePage(page));
  },
  openAsVisitor: async ({browser, baseURL, externalRequests}, use) => {
    const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
    await use(async (link: string, options: VisitorOptions = {}) => {
      const context = await browser.newContext();
      contexts.push(context);
      await blockExternalRequests(context, baseURL, externalRequests);
      await sendBypassOnlyToSite(context, baseURL);
      await options.beforeOpen?.(context);
      const visitor = new TierListPage(await context.newPage());
      await visitor.gotoLink(link);
      return visitor;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
  cspViolations: async ({page}, use) => {
    const violations: string[] = [];
    await page.exposeBinding('__reportCspViolation', (_source, text: string) => void violations.push(text));
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as {__reportCspViolation: (text: string) => void})
          .__reportCspViolation(`${event.violatedDirective} blocked ${event.blockedURI || 'inline code'} on ${location.pathname}`);
      });
    });
    await use(async () => [...violations]);
  },
  consoleErrors: async ({page}, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
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
