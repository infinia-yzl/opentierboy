import {expect, type Locator, type Page} from '@playwright/test';

/**
 * The page clock: Playwright's fake timers, installed with `test.use({pageClock: true})`
 * (tests/support/test.ts). A test moves the page's time on by the app's own durations, so it
 * never waits for a timer in real time.
 */

/** How long a toast shows: Sonner's default, which the app keeps (components/ui/sonner.tsx). */
export const TOAST_MS = 4_000;

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
 */
export async function letToastTimeOut(page: Page, toast: Locator, ms = TOAST_MS) {
  await page.mouse.move(0, 0);
  await expect(toast).toHaveAttribute('data-expanded', 'false');
  await runPageClock(page, ms);
  await expect(toast).toHaveCount(0);
}
