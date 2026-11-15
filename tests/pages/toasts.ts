import {expect, type Locator, type Page} from '@playwright/test';
import {pageTimePaused, runPageClock, TOAST_UNMOUNT_MS} from '../support/page-clock';

export function toasts(page: Page): Locator {
  return page.getByRole('region', {name: /^Notifications\b/}).getByRole('listitem');
}

export async function expectOnlyNewToast(page: Page, action: () => Promise<void>, text: string) {
  const marker = 'data-shown-before-step';
  await toasts(page).evaluateAll((items, name) => items.forEach((item) => item.setAttribute(name, '')), marker);
  await action();
  await expect.poll(() => toasts(page).evaluateAll((items, name) => items
    .filter((item) => !item.hasAttribute(name))
    .map((item) => item.textContent ?? ''), marker), {message: `the toasts this step showed should be one "${text}"`})
    .toEqual([expect.stringContaining(text)]);
}


export async function letClosedToastLeave(page: Page, toast: Locator) {
  if (pageTimePaused(page)) {
    await expect(toast).toHaveAttribute('data-removed', 'true');
    await runPageClock(page, TOAST_UNMOUNT_MS);
  }
  await expect(toast).toHaveCount(0);
}
