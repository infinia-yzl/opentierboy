import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test as base, expect, type APIRequestContext, type Browser, type BrowserContext, type Page, type Request as PageRequest} from '@playwright/test';
import {TierListPage} from '../pages/tier-list-page';
import {SitePage} from '../pages/site-page';
import sharedLinks from '../fixtures/shared-links.json';
import {sendBypassOnlyToSite} from './vercel-bypass';
import {INSPECTOR_HOSTNAMES, modelInspectOn} from './model-inspect';
import {expectSettled} from './settled';
import {BENIGN_PAGE_ERRORS} from './machines';

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
  /**
   * The one-time tips (components/EditorTips.tsx). Off unless a test turns them on with
   * `test.use({tips: true})` (tests/e2e/tips.spec.ts): other tests check the page without them.
   */
  tips: boolean;
  /**
   * Installs Playwright's page clock before the first page opens, so a test can let a toast end
   * by itself without waiting for it (tests/support/page-clock.ts). Off unless a test turns it on
   * with `test.use({pageClock: true})`: the clock gives the page no navigation entry, which the
   * shared-list tip needs (components/EditorTips.tsx).
   */
  pageClock: boolean;
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
   * answered: from the browser, the `request` fixture, page.request and context.request, or
   * the test runner's `fetch`. They are blocked, and the test fails if there are any, also a
   * test marked test.fail(): tests never reach real external sites (play them with
   * tests/support/image-sites.ts).
   */
  externalRequests: string[];
  /** Errors that the page logged to the browser console or threw, collected during the test. */
  consoleErrors: string[];
  /**
   * Page errors (exceptions a page threw and nothing caught) that a test expects, besides the
   * benign browser notices every test passes over. Set it with `test.use({allowedPageErrors: [...]})`.
   */
  allowedPageErrors: RegExp[];
  /**
   * The page errors of every page this test opened (its own, openAsVisitor's and
   * openInChromiumProfile's). After the test, any error that is neither a benign browser notice
   * (BENIGN_PAGE_ERRORS, tests/support/machines.ts) nor in allowedPageErrors fails it.
   */
  pageErrors: string[];
  /**
   * Reads, once, the Content Security Policy violations that the page reported in this test (the
   * `securitypolicyviolation` events of every page load). It first waits until the page has
   * settled, then breaks the policy once on purpose (an <object>, which `object-src 'none'`
   * blocks before any request) and waits for that report: reports arrive in order, so every
   * earlier one has arrived too. The test's own report is left out of the list.
   */
  cspViolations: () => Promise<string[]>;
};

type WorkerFixtures = {
  /**
   * Fails the worker when it finishes if a request to an external host was blocked outside a
   * test (at module scope or in a hook such as beforeAll).
   */
  blockedOutsideTestsReport: void;
};

/**
 * Turns the tips off in a context before its pages start, as "Hide tips" would, unless the
 * browser already holds a tips value. The key and value follow lib/tips/tips.ts.
 */
async function turnTipsOff(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      if (localStorage.getItem('otb-tips') === null) localStorage.setItem('otb-tips', JSON.stringify({seen: [], off: true}));
    } catch {
      // Pages without storage (about:blank) show no tips either.
    }
  });
}

/** Where blocked requests are recorded: the running test's list, while a test runs. */
let requestSink: string[] | null = null;
/** Requests blocked outside a test; blockedOutsideTestsReport reports them. */
const blockedOutsideTests: string[] = [];
/** The list a request blocked now belongs to. */
const currentBlockedList = () => requestSink ?? blockedOutsideTests;

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
 * Guards a browser context against external requests. Its route blocks and records every
 * request to another host that no route of the test answers (routes registered later, a
 * test's own, run first, so this one only sees what nothing else handled). Routes do not cover
 * the context's own API requests (context.request, page.request), so those are wrapped like
 * the `request` fixture, for the pages the context has and every page it opens later.
 */
const guardedContexts = new WeakSet<BrowserContext>();

async function guardContext(context: BrowserContext, baseURL: string | undefined, blocked: string[]) {
  if (guardedContexts.has(context)) return;
  guardedContexts.add(context);
  const siteURL = baseURL ? new URL(baseURL) : undefined;
  await context.route(
    (url) => isExternal(url, siteURL),
    async (route) => {
      blocked.push(route.request().url());
      await route.abort('blockedbyclient');
    },
  );
  const request = guardRequestContext(context.request, baseURL, blocked);
  Object.defineProperty(context, 'request', {value: request, configurable: true});
  const guardPage = (page: Page) => Object.defineProperty(page, 'request', {value: request, configurable: true});
  context.pages().forEach(guardPage);
  context.on('page', guardPage);
}

/**
 * Makes the worker's browser guard every context it creates: browser.newContext() and
 * browser.newPage() (which opens a context of its own), however the test reaches the browser
 * (the `browser` fixture under any name, page.context().browser()). The methods are replaced on
 * the instance, so every reference to it gets them. A context records into the list of the
 * test that created it (or, outside a test, into blockedOutsideTests).
 */
function guardBrowser(browser: Browser, baseURL: string | undefined) {
  const newContext = browser.newContext.bind(browser);
  const newPage = browser.newPage.bind(browser);
  browser.newContext = async (...args: Parameters<Browser['newContext']>) => {
    const context = await newContext(...args);
    await guardContext(context, baseURL, currentBlockedList());
    return context;
  };
  browser.newPage = async (...args: Parameters<Browser['newPage']>) => {
    const page = await newPage(...args);
    await guardContext(page.context(), baseURL, currentBlockedList());
    return page;
  };
}

/**
 * The test runner's own fetch(), guarded from the moment this module is first imported (before
 * a spec's own code runs, in the runner process and in the workers), so that module-scope calls
 * and a fetch captured at module scope (`const realFetch = globalThis.fetch`) are guarded too.
 * In a test, a blocked call rejects and counts for the test. Outside a test it throws at once,
 * so a call nobody awaits still breaks the file: loading it fails, in the runner too.
 */
const SITE_URL_FROM_ENV = process.env.BASE_URL ? new URL(process.env.BASE_URL) : undefined;
const originalFetch = globalThis.fetch;
const guardedFetch = Object.assign((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  let url: URL;
  try {
    url = new URL(input instanceof Request ? input.url : String(input));
  } catch {
    return originalFetch(input, init); // not an absolute address: fetch() refuses it itself
  }
  if (!isExternal(url, SITE_URL_FROM_ENV)) return originalFetch(input, init);
  // The hosted inspector opens its session with fetch(), only in a local run with MODEL_INSPECT=1.
  if (modelInspectOn && url.protocol === 'https:' && INSPECTOR_HOSTNAMES.includes(url.hostname)) return originalFetch(input, init);
  currentBlockedList().push(url.href);
  const error = new TypeError(`Blocked a request to an external host: ${url.href}`);
  if (requestSink === null) throw error;
  return Promise.reject(error);
}, {guardsExternalRequests: true});
if (!(globalThis.fetch as Partial<typeof guardedFetch>).guardsExternalRequests) globalThis.fetch = guardedFetch;

/** Records the page errors of every page of a context, the ones it has and the ones it opens later. */
function watchPageErrors(context: BrowserContext, errors: string[]) {
  const watch = (page: Page) => page.on('pageerror', (error) => void errors.push(`${error.name}: ${error.message}`));
  context.pages().forEach(watch);
  context.on('page', watch);
}

/**
 * What the pages of a context did with the network, kept for a test that fails: the requests that
 * never finished, and the last page events (navigations, DOMContentLoaded, load, failed
 * requests). A step that waits for a page to load and times out names nothing else, so this is
 * how a failure shows what the page was still waiting for.
 */
/** The network watch of each context, so the page fixture can probe its pages before they close. */
const watches = new WeakMap<BrowserContext, {probe: () => Promise<void>}>();

function watchNetwork(context: BrowserContext) {
  const started = Date.now();
  const at = () => `${((Date.now() - started) / 1000).toFixed(1)} s`;
  const short = (url: string) => (url.length > 160 ? `${url.slice(0, 157)}...` : url);
  const waiting = new Map<PageRequest, string>();
  const events: string[] = [];
  const note = (event: string) => {
    events.push(`${at()} ${event}`);
    if (events.length > 30) events.shift();
  };
  const watch = (page: Page) => {
    page.on('request', (request) => void waiting.set(request, `${at()} ${request.method()} ${request.resourceType()} ${short(request.url())}`));
    page.on('requestfinished', (request) => void waiting.delete(request));
    page.on('requestfailed', (request) => {
      waiting.delete(request);
      note(`request failed (${request.failure()?.errorText ?? 'no reason'}): ${short(request.url())}`);
    });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) note(`navigated to ${short(frame.url())}`);
    });
    page.on('response', (response) => {
      if (response.request().isNavigationRequest()) note(`document answered ${response.status()}: ${short(response.url())}`);
    });
    page.on('requestfinished', (request) => {
      if (request.isNavigationRequest()) note(`document received in full: ${short(request.url())}`);
    });
    page.on('domcontentloaded', () => note(`DOMContentLoaded of ${short(page.url())}`));
    page.on('load', () => note(`load of ${short(page.url())}`));
    page.on('close', () => note('page closed'));
  };
  context.pages().forEach(watch);
  context.on('page', watch);
  /**
   * Asks each open page where it stands, while it is still open: how far its document is
   * (document.readyState) and its address. A page whose main thread is blocked does not answer
   * within 3 s; a page whose parser waits for the rest of its document answers "loading".
   */
  const probe = async () => {
    for (const page of context.pages()) {
      if (page.isClosed()) continue;
      const answer = page.evaluate(() => `${document.readyState} at ${location.href}`).catch((error: Error) => `no answer: ${error.message.split('\n')[0]}`);
      const silence = new Promise<string>((resolve) => void setTimeout(() => resolve('no answer in 3 s: its main thread is blocked'), 3_000));
      note(`probe of the page: ${short(await Promise.race([answer, silence]))}`);
    }
  };
  watches.set(context, {probe});
  return () => [
    `Requests still waiting (started at): ${waiting.size === 0 ? 'none' : ''}`,
    ...[...waiting.values()].map((line) => `  ${line}`),
    'Last page events:',
    ...events.map((line) => `  ${line}`),
  ].join('\n');
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  externalRequests: [async ({}, use, testInfo) => {
    const blocked: string[] = [];
    requestSink = blocked;
    try {
      await use(blocked);
    } finally {
      requestSink = null;
    }
    // Runs after the test and its afterEach hooks. A test marked test.fail() would count this
    // failure as the one it expects and pass: make the failure unexpected, so it is loud.
    if (blocked.length === 0) return;
    testInfo.expectedStatus = 'passed';
    throw new Error(`Requests to external hosts that no test route answered (tests must never reach real sites):\n${blocked.join('\n')}`);
  }, {auto: true}],
  blockedOutsideTestsReport: [async ({}, use) => {
    await use();
    if (blockedOutsideTests.length > 0) {
      throw new Error(`Requests to external hosts outside a test, for example at module scope or in beforeAll (tests must never reach real sites):\n${blockedOutsideTests.join('\n')}`);
    }
  }, {scope: 'worker', auto: true}],
  browser: [async ({browser}, use, workerInfo) => {
    guardBrowser(browser, workerInfo.project.use.baseURL);
    await use(browser);
  }, {scope: 'worker'}],
  request: async ({request, baseURL, externalRequests}, use) => {
    await use(guardRequestContext(request, baseURL, externalRequests));
  },
  // Against a protected Vercel deployment, send the bypass secret to that site only.
  tips: [false, {option: true}],
  allowedPageErrors: [[], {option: true}],
  pageErrors: async ({allowedPageErrors}, use) => {
    const errors: string[] = [];
    await use(errors);
    // Runs after every fixture that opened a page has closed it.
    const unexpected = errors.filter((message) => ![...BENIGN_PAGE_ERRORS, ...allowedPageErrors].some((allowed) => allowed.test(message)));
    if (unexpected.length > 0) {
      throw new Error(`The page threw errors that nothing caught (allow an expected one with test.use({allowedPageErrors})):\n${unexpected.join('\n')}`);
    }
  },
  context: async ({context, baseURL, externalRequests, pageErrors, tips}, use, testInfo) => {
    watchPageErrors(context, pageErrors);
    const network = watchNetwork(context);
    await guardContext(context, baseURL, externalRequests);
    await sendBypassOnlyToSite(context, baseURL);
    if (!tips) await turnTipsOff(context);
    await use(context);
    // A failed or timed-out test reports what its pages were still waiting for, as an error of its
    // own after the test's: the reporters print every error of a test, also in CI logs.
    if (testInfo.status !== testInfo.expectedStatus && testInfo.status !== 'skipped') {
      const report = new Error(`What the page was doing when the test failed:\n${network()}`);
      report.name = 'NetworkReport';
      throw report;
    }
  },
  pageClock: [false, {option: true}],
  page: async ({page, pageClock}, use, testInfo) => {
    if (pageClock) await page.clock.install();
    await use(page);
    // Before the page closes: a failed or timed-out test notes where its pages stand (watchNetwork).
    if (testInfo.status !== testInfo.expectedStatus && testInfo.status !== 'skipped') {
      await watches.get(page.context())?.probe();
    }
  },
  tierList: async ({page}, use) => {
    await use(new TierListPage(page));
  },
  site: async ({page}, use) => {
    await use(new SitePage(page));
  },
  openAsVisitor: async ({browser, baseURL, externalRequests, pageErrors, tips}, use) => {
    const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
    await use(async (link: string, options: VisitorOptions = {}) => {
      const context = await browser.newContext();
      contexts.push(context);
      watchPageErrors(context, pageErrors);
      await guardContext(context, baseURL, externalRequests);
      await sendBypassOnlyToSite(context, baseURL);
      if (!tips) await turnTipsOff(context);
      await options.beforeOpen?.(context);
      const visitor = new TierListPage(await context.newPage());
      await visitor.gotoLink(link);
      return visitor;
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
  openInChromiumProfile: async ({playwright, baseURL, externalRequests, pageErrors, browserName, tips}, use) => {
    const opened: {context: BrowserContext; directory: string}[] = [];
    await use(async () => {
      if (browserName !== 'chromium') throw new Error('openInChromiumProfile works in Chromium only.');
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'otb-profile-'));
      const context = await playwright.chromium.launchPersistentContext(directory, {baseURL});
      opened.push({context, directory});
      watchPageErrors(context, pageErrors);
      await guardContext(context, baseURL, externalRequests);
      await sendBypassOnlyToSite(context, baseURL);
      if (!tips) await turnTipsOff(context);
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
    let probes = 0;
    await use(async () => {
      await page.waitForLoadState('load');
      await expectSettled(page);
      probes += 1;
      const probe = `/csp-reporting-probe-${probes}`;
      const object = await page.evaluateHandle((data) => {
        const element = document.createElement('object');
        element.data = data;
        element.style.cssText = 'position: fixed; width: 0; height: 0;';
        document.body.append(element);
        return element;
      }, probe);
      const isProbe = (text: string) => text.includes(probe);
      await expect.poll(() => violations.some(isProbe), {message: 'the test report should come back through the reporting path'}).toBe(true);
      await object.evaluate((element) => element.remove());
      await object.dispose();
      return violations.filter((text) => !/\/csp-reporting-probe-\d+/.test(text));
    });
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

/**
 * Asserts that a page shows exactly the expected tiers and items, in order. It waits until the
 * page has settled first: each row has a check of its own, so on a page still on its way from one
 * version of the list to another (after Back), the rows could pass on a mix of the two.
 */
export async function expectTierList(
  tierList: TierListPage,
  expected: {title?: string; tiers: {name: string; items: string[]}[]},
) {
  await tierList.settled();
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
