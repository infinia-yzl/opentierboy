import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test as base, expect, type APIRequestContext, type Browser, type BrowserContext, type Page, type Request as PageRequest} from '@playwright/test';
import {TierListPage} from '../pages/tier-list-page';
import {SitePage} from '../pages/site-page';
import sharedLinks from '../fixtures/shared-links.json';
import {sendBypassOnlyToSite} from './vercel-bypass';
import {INSPECTOR_HOSTNAMES, modelInspectOn} from './model-inspect';
import {expectHydrated} from './hydrated';
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

export const SHARED_LINKS = sharedLinks as SharedLinkFixture[];

export interface VisitorOptions {
  beforeOpen?: (context: BrowserContext) => Promise<unknown>;
}

type Fixtures = {
  tips: boolean;
  tierList: TierListPage;
  site: SitePage;
  openAsVisitor: (link: string, options?: VisitorOptions) => Promise<TierListPage>;
  openInChromiumProfile: () => Promise<{tierList: TierListPage; context: BrowserContext}>;
  externalRequests: string[];
  consoleErrors: string[];
  allowedPageErrors: RegExp[];
  pageErrors: string[];
  cspViolations: () => Promise<string[]>;
};

type WorkerFixtures = {
  blockedOutsideTestsReport: void;
};

async function turnTipsOff(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      if (localStorage.getItem('otb-tips') === null) localStorage.setItem('otb-tips', JSON.stringify({seen: [], off: true}));
    } catch {
    }
  });
}

let requestSink: string[] | null = null;
const blockedOutsideTests: string[] = [];
const currentBlockedList = () => requestSink ?? blockedOutsideTests;

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];
const VERCEL_TOOLBAR_HOSTNAMES = ['vercel.live', 'vercel.com', 'assets.vercel.com'];

function isSiteOrLocal(url: URL, siteURL: URL | undefined): boolean {
  if (url.host === siteURL?.host || LOCAL_HOSTNAMES.includes(url.hostname)) return true;
  const deployed = siteURL !== undefined && !LOCAL_HOSTNAMES.includes(siteURL.hostname);
  return deployed && VERCEL_TOOLBAR_HOSTNAMES.includes(url.hostname);
}

const isExternal = (url: URL, siteURL: URL | undefined) =>
  (url.protocol === 'http:' || url.protocol === 'https:') && !isSiteOrLocal(url, siteURL);

const REQUEST_METHODS = new Set(['fetch', 'get', 'post', 'put', 'patch', 'delete', 'head']);

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

const SITE_URL_FROM_ENV = process.env.BASE_URL ? new URL(process.env.BASE_URL) : undefined;
const originalFetch = globalThis.fetch;
const guardedFetch = Object.assign((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  let url: URL;
  try {
    url = new URL(input instanceof Request ? input.url : String(input));
  } catch {
    return originalFetch(input, init);
  }
  if (!isExternal(url, SITE_URL_FROM_ENV)) return originalFetch(input, init);
  if (modelInspectOn && url.protocol === 'https:' && INSPECTOR_HOSTNAMES.includes(url.hostname)) return originalFetch(input, init);
  currentBlockedList().push(url.href);
  const error = new TypeError(`Blocked a request to an external host: ${url.href}`);
  if (requestSink === null) throw error;
  return Promise.reject(error);
}, {guardsExternalRequests: true});
if (!(globalThis.fetch as Partial<typeof guardedFetch>).guardsExternalRequests) globalThis.fetch = guardedFetch;

function watchPageErrors(context: BrowserContext, errors: string[]) {
  const watch = (page: Page) => page.on('pageerror', (error) => void errors.push(`${error.name}: ${error.message}`));
  context.pages().forEach(watch);
  context.on('page', watch);
}

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
  tips: [false, {option: true}],
  allowedPageErrors: [[], {option: true}],
  pageErrors: async ({allowedPageErrors}, use) => {
    const errors: string[] = [];
    await use(errors);
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
    if (testInfo.status !== testInfo.expectedStatus && testInfo.status !== 'skipped') {
      const report = new Error(`What the page was doing when the test failed:\n${network()}`);
      report.name = 'NetworkReport';
      throw report;
    }
  },
  page: async ({page}, use, testInfo) => {
    await use(page);
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
      await expectHydrated(page);
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

export async function expectTierNames(tierList: TierListPage, names: string[]) {
  await expect(tierList.tiers).toHaveCount(names.length);
  for (let index = 0; index < names.length; index++) {
    await expect(tierList.tiers.nth(index), `tier ${index + 1} name`).toHaveAccessibleName(names[index]);
  }
}

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
