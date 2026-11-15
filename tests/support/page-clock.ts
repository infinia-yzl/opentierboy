import {expect, type Locator, type Page} from '@playwright/test';


export const TOAST_MS = 4_000;

export const TOAST_UNMOUNT_MS = 200;

const SOON_MS = 1;

const REAL_TIMERS = '__otbRealTimers';

const pausedPages = new WeakSet<Page>();

export function pageTimePaused(page: Page): boolean {
  return pausedPages.has(page);
}

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
  await page.clock.pauseAt(start + 60_000);
  pausedPages.add(page);
}

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

export async function runPageClock(page: Page, ms: number) {
  await flushPage(page);
  await page.clock.runFor(ms);
  await flushPage(page);
}

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
