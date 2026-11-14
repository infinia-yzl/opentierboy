import {expect, type Page} from '@playwright/test';

/**
 * Waits until the page has finished what the last step started: its <main> no longer says
 * `aria-busy` (lib/busy.ts, components/BusyMain.tsx). Every page has that <main>
 * (app/layout.tsx). An open dialog hides <main> from the accessibility tree, so the lookup
 * includes hidden elements.
 */
export async function expectSettled(page: Page) {
  await expect(page.getByRole('main', {includeHidden: true})).not.toHaveAttribute('aria-busy', 'true');
}
