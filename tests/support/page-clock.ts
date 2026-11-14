import {expect, type Locator, type Page} from '@playwright/test';

/**
 * The page clock: Playwright's fake timers. A test moves the page's time on by the app's own
 * durations, so it never waits for a timer in real time. Two ways to use it:
 *
 * - `test.use({pageClock: true})` (tests/support/test.ts) installs the clock before the first
 *   page opens. Its time still runs with real time, and a test moves it on further.
 * - `pausePageTime` (for a model's walk: modelSut's `pageTime: 'paused'`) stops page time: it
 *   moves only when a step runs the clock (runPageClock), so a slow step never lets a toast or
 *   an image check time out.
 */

/** How long a toast shows: Sonner's default, which the app keeps (components/ui/sonner.tsx). */
export const TOAST_MS = 4_000;

/**
 * How long Sonner keeps a toast that has closed, for its exit animation (sonner's
 * TIME_BEFORE_UNMOUNT): it says `data-removed="true"` until then.
 */
export const TOAST_UNMOUNT_MS = 200;

/**
 * Timers of at most this delay run in real time while page time is paused: they mean "as soon
 * as possible" (`setTimeout(fn)`, `setTimeout(fn, 0)`, Next.js's `setTimeout(fn, 1)`).
 */
const SOON_MS = 1;

/** Where the page keeps the browser's own timers, from before the page clock replaced them. */
const REAL_TIMERS = '__otbRealTimers';

/** Pages whose time pausePageTime stopped. */
const pausedPages = new WeakSet<Page>();

/** True when pausePageTime stopped this page's time: it moves only in runPageClock. */
export function pageTimePaused(page: Page): boolean {
  return pausedPages.has(page);
}

/**
 * Stops page time for the rest of the test, in every page of the page's browser context: Date,
 * performance.now() and every timer with a delay stand still until a step runs the page clock
 * (runPageClock). Call it before the page opens anything, without `pageClock`.
 *
 * Only real waits stop. What the browser runs "as soon as possible" still runs at once, as it
 * would without the clock: timers of at most SOON_MS, animation frames and idle callbacks. A page
 * needs them to settle: React reveals streamed content in an animation frame, Sonner shows a toast
 * in a zero-delay timer, lib/toast.ts ends `aria-busy` in another, and Radix dialogs add their
 * listeners and give back the focus in them. Playwright's runFor(0) cannot run them instead: its
 * clock gives a zero-delay timer set while timers run a delay of 1 ms, so it would wait forever.
 * React's reveal throttles also run on the real timers, so a move inside the site shows the next
 * page without a step for it (see below). The browser's own timers are kept by a first init
 * script, before the clock replaces them, and a second one routes those calls to them.
 */
export async function pausePageTime(page: Page) {
  if (pausedPages.has(page)) return;
  if (await page.evaluate(() => (Date as unknown as {isFake?: boolean}).isFake === true)) {
    throw new TypeError('pausePageTime needs a page without the page clock: do not combine it with `pageClock`.');
  }
  const context = page.context();
  await context.addInitScript((key: string) => {
    const timers = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      requestAnimationFrame: globalThis.requestAnimationFrame?.bind(globalThis),
      cancelAnimationFrame: globalThis.cancelAnimationFrame?.bind(globalThis),
      requestIdleCallback: globalThis.requestIdleCallback?.bind(globalThis),
      cancelIdleCallback: globalThis.cancelIdleCallback?.bind(globalThis),
    };
    Object.defineProperty(globalThis, key, {value: timers});
  }, REAL_TIMERS);
  // React's streaming runtime (`$RC` in the page's HTML) throttles reveals: once a first frame has
  // set `$RT`, a part that streams in later waits `$RT + 300 - performance.now()` ms on a timer,
  // which never runs while page time stands still. Without `$RT`, React reveals the part in the next
  // animation frame, which runs on the real timers. The page looks the same.
  await context.addInitScript(() => {
    Object.defineProperty(window, '$RT', {configurable: false, get: () => undefined, set: () => {}});
  });
  const start = Date.now();
  await page.clock.install({time: start});
  await context.addInitScript(({key, soonMs}: {key: string; soonMs: number}) => {
    const real = (globalThis as unknown as Record<string, Record<string, (...args: unknown[]) => number> | undefined>)[key];
    if (!real) return;
    const clocked = {setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout};
    const onRealTimers = new Set<unknown>();
    const realTimeout = (handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      const id = real.setTimeout(handler, delay, ...args);
      onRealTimers.add(id);
      return id;
    };
    const pageTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (typeof delay === 'number' && delay > soonMs) return clocked.setTimeout(handler, delay, ...args);
      return realTimeout(handler, delay, ...args);
    }) as typeof globalThis.setTimeout;
    // React DOM keeps the setTimeout it finds when it loads, and uses it only to pace reveals: once
    // a Suspense boundary has shown its fallback, the content that replaces it waits until 300 ms
    // of page time have passed since then (React's FALLBACK_THROTTLE_MS). A move inside the site
    // can show two fallbacks in turn (the route's loading state, then the editor's while its code
    // loads), and the second wait would never end while page time stands still. So React gets its
    // own setTimeout, which uses the real timers once React DOM has loaded: React announces itself
    // to the DevTools hook right after it has kept its timers, and the page's setTimeout takes over
    // from then on. Code that loads before React DOM sees no difference.
    let reactLoaded = false;
    globalThis.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => (
      reactLoaded ? realTimeout(handler, delay, ...args) : pageTimeout(handler, delay, ...args)
    )) as typeof globalThis.setTimeout;
    if (!('__REACT_DEVTOOLS_GLOBAL_HOOK__' in globalThis)) {
      Object.defineProperty(globalThis, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
        configurable: true,
        value: {
          supportsFiber: true,
          inject: () => {
            reactLoaded = true;
            globalThis.setTimeout = pageTimeout;
            return 1;
          },
        },
      });
    }
    globalThis.clearTimeout = ((id?: number) => {
      if (onRealTimers.delete(id)) real.clearTimeout(id);
      else clocked.clearTimeout(id);
    }) as typeof globalThis.clearTimeout;
    for (const name of ['requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback'] as const) {
      if (real[name]) (globalThis as unknown as Record<string, unknown>)[name] = real[name];
    }
  }, {key: REAL_TIMERS, soonMs: SOON_MS});
  // The clock runs from `start` until it pauses, a moment later: pause it a minute ahead, which
  // only moves the time of the blank page the test has not left yet.
  await page.clock.pauseAt(start + 60_000);
  pausedPages.add(page);
}

/**
 * Lets the page finish what is queued: React renders and runs effects in message tasks (its
 * scheduler), which the page clock does not fake. Two round trips of a message run after those.
 */
export async function flushPage(page: Page) {
  await page.evaluate(async () => {
    for (let round = 0; round < 2; round++) {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(null);
      });
    }
  });
}

/** Moves the page clock on by `ms`, then lets the page handle what those timers started. */
export async function runPageClock(page: Page, ms: number) {
  await flushPage(page);
  await page.clock.runFor(ms);
  await flushPage(page);
}

/**
 * Lets a toast end by itself after `ms`. The pointer leaves the toasts first: Sonner holds a
 * toast while the toasts are expanded (`data-expanded`, under the pointer), and starts its timer
 * again in an effect once they are not.
 *
 * While page time is paused (pausePageTime), it checks the exact duration: the toast still shows
 * at `ms` − 1 and closes 1 ms later, then leaves after Sonner's exit time. That holds when no page
 * time passed since the toast showed, or only while the pointer held it. With the running clock
 * of `pageClock`, the toast's time also runs in real time, so the clock runs by the whole `ms`.
 */
export async function letToastTimeOut(page: Page, toast: Locator, ms = TOAST_MS) {
  await page.mouse.move(0, 0);
  await expect(toast).toHaveAttribute('data-expanded', 'false');
  if (!pageTimePaused(page)) {
    await runPageClock(page, ms);
    await expect(toast).toHaveCount(0);
    return;
  }
  await runPageClock(page, ms - 1);
  await expect(toast, `the toast should still show ${ms - 1} ms after it started`).toHaveAttribute('data-removed', 'false');
  await runPageClock(page, 1);
  await expect(toast, `the toast should close after ${ms} ms`).toHaveAttribute('data-removed', 'true');
  await runPageClock(page, TOAST_UNMOUNT_MS);
  await expect(toast).toHaveCount(0);
}
