import {expect, type Locator, type Page} from '@playwright/test';

const TOAST_GONE_MS = 20_000;

export function toasts(page: Page): Locator {
  return page.getByRole('region', {name: /^Notifications\b/}).getByRole('listitem');
}

export async function untilToastGone(toast: Locator) {
  await expect(toast, 'an earlier toast with this text should have closed before the step').toHaveCount(0, {timeout: TOAST_GONE_MS});
}

export async function expectOneNewToast(page: Page, action: () => Promise<void>, text: string | RegExp) {
  const toast = toasts(page).filter({hasText: text});
  await untilToastGone(toast);
  await action();
  await expect(toast).toHaveCount(1);
}
