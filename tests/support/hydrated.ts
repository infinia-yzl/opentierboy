import {expect, type Page} from '@playwright/test';

export async function expectHydrated(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true');
}
