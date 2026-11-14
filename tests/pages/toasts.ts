import {expect, type Locator, type Page} from '@playwright/test';
import {pageTimePaused, runPageClock, TOAST_UNMOUNT_MS} from '../support/page-clock';

/**
 * Every toast on the page. Sonner puts them in a list in a region named "Notifications" with
 * its keyboard shortcut ("Notifications alt+T"). The region says aria-live, so an open dialog
 * does not hide it.
 */
export function toasts(page: Page): Locator {
  return page.getByRole('region', {name: /^Notifications\b/}).getByRole('listitem');
}

/**
 * Runs an action, and waits until the toasts it showed are exactly one toast that contains
 * `text`. The toasts already on screen are marked first, so an older toast with the same text
 * does not count, and a toast of another outcome (an error) fails the wait. It waits for the
 * toast, not for the page to settle: the page may be busy on purpose, for example while list
 * writes wait for a held server answer.
 */
export async function expectOnlyNewToast(page: Page, action: () => Promise<void>, text: string) {
  const marker = 'data-shown-before-step';
  await toasts(page).evaluateAll((items, name) => items.forEach((item) => item.setAttribute(name, '')), marker);
  await action();
  await expect.poll(() => toasts(page).evaluateAll((items, name) => items
    .filter((item) => !item.hasAttribute(name))
    .map((item) => item.textContent ?? ''), marker), {message: `the toasts this step showed should be one "${text}"`})
    .toEqual([expect.stringContaining(text)]);
}

// ---- Toasts while page time stands still (`pageTime: 'paused'`) -----------------------------

/**
 * Waits until a toast that a click closed has left the page. Sonner keeps a closed toast for its
 * exit (TOAST_UNMOUNT_MS, `data-removed="true"`) on a timer, so while page time stands still
 * (pausePageTime) the page clock runs that long. The pointer is still on the toasts then, which
 * holds the timers of the toasts that stay (letToastTimeOut checks them later to the ms).
 */
export async function letClosedToastLeave(page: Page, toast: Locator) {
  if (pageTimePaused(page)) {
    await expect(toast).toHaveAttribute('data-removed', 'true');
    await runPageClock(page, TOAST_UNMOUNT_MS);
  }
  await expect(toast).toHaveCount(0);
}
