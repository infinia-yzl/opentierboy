import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test as base, expect, type APIRequestContext, type Browser, type BrowserContext} from '@playwright/test';
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
   * Opens the editor in a Chromium profile on disk instead of an incognito context, for what
   * only such a profile does: Chromium ignores a storage quota set through the DevTools
   * Protocol in incognito contexts. Chromium only. The profile is removed after the test.
   */
  openInChromiumProfile: () => Promise<{tierList: TierListPage; context: BrowserContext}>;
  /**
   * Requests to hosts other than the site under test and local addresses that no test route
   * answered: from the browser, the `request` fixture or the test runner's `fetch`. They are
   * blocked, and the test fails if there are any, also a test marked test.fail(): tests never
   * reach real external sites (play them with tests/support/imageSites.ts).
   */
  externalRequests: string[];
  /** Blocks and records the test runner's own fetch() calls to external hosts. */
  externalFetchGuard: void;
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

const isExternal = (url: URL, siteURL: URL | undefined) =>
  (url.protocol === 'http:' || url.protocol === 'https:') && !isSiteOrLocal(url, siteURL);

/** Requests that can go out through the `request` fixture (APIRequestContext). */
const REQUEST_METHODS = new Set(['fetch', 'get', 'post', 'put', 'patch', 'delete', 'head']);

/**
 * The `request` fixture, with every request to an external host refused and recorded. It
 * resolves a relative address against `baseURL`, as the fixture does.
 */
function guardRequestContext(request: APIRequestContext, baseURL: string | undefined, blocked: string[]): APIRequestContext {
  const siteURL = baseURL ? new URL(baseURL) : undefined;
  return new Proxy(request, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (typeof property !== 'string' || !REQUEST_METHODS.has(property)) return value.bind(target);
      return (urlOrRequest: string | {url(): string}, ...rest: unknown[]) => {
        const url = new URL(typeof urlOrRequest === 'string' ? urlOrRequest : urlOrRequest.url(), baseURL);
        if (isExternal(url, siteURL)) {
          blocked.push(url.href);
          return Promise.reject(new Error(`Blocked a request to an external host: ${url.href}`));
        }
        return value.call(target, urlOrRequest, ...rest);
      };
    },
  });
}

/**
 * Blocks and records every request to another host that no route of the test answers. Routes
 * registered later (a test's own) run first, so this one only sees what nothing else handled.
 */
async function blockExternalRequests(context: BrowserContext, baseURL: string | undefined, blocked: string[]) {
  const siteURL = baseURL ? new URL(baseURL) : undefined;
  await context.route(
    (url) => isExternal(url, siteURL),
    async (route) => {
      blocked.push(route.request().url());
      await route.abort('blockedbyclient');
    },
  );
}

export const test = base.extend<Fixtures>({
  externalRequests: [async ({}, use, testInfo) => {
    const blocked: string[] = [];
    await use(blocked);
    // Runs after the test and its afterEach hooks. A test marked test.fail() would count this
    // failure as the one it expects and pass: make the failure unexpected, so it is loud.
    if (blocked.length === 0) return;
    testInfo.expectedStatus = 'passed';
    throw new Error(`Requests to external hosts that no test route answered (tests must never reach real sites):\n${blocked.join('\n')}`);
  }, {auto: true}],
  externalFetchGuard: [async ({baseURL, externalRequests}, use) => {
    const siteURL = baseURL ? new URL(baseURL) : undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), baseURL);
      if (isExternal(url, siteURL)) {
        externalRequests.push(url.href);
        throw new TypeError(`Blocked a request to an external host: ${url.href}`);
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      await use();
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, {auto: true}],
  request: async ({request, baseURL, externalRequests}, use) => {
    await use(guardRequestContext(request, baseURL, externalRequests));
  },
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
  openInChromiumProfile: async ({playwright, baseURL, externalRequests, browserName}, use) => {
    const opened: {context: BrowserContext; directory: string}[] = [];
    await use(async () => {
      if (browserName !== 'chromium') throw new Error('openInChromiumProfile works in Chromium only.');
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'otb-profile-'));
      const context = await playwright.chromium.launchPersistentContext(directory, {baseURL});
      opened.push({context, directory});
      await blockExternalRequests(context, baseURL, externalRequests);
      await sendBypassOnlyToSite(context, baseURL);
      const page = context.pages()[0] ?? await context.newPage();
      return {tierList: new TierListPage(page), context};
    });
    for (const {context, directory} of opened) {
      await context.close();
      fs.rmSync(directory, {recursive: true, force: true});
    }
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
