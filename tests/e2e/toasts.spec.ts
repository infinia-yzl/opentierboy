import {expect, test} from '../support/test';
import type {ThemeMode} from '../pages/SitePage';

const TANKS = '/rank/overwatch/tank';

// Toasts take the page's colours in every theme. Sonner, the toast library, ships its own
// styles; if they win, a toast can turn transparent over the tier list.
const MODES: ThemeMode[] = ['light', 'dark'];

test.describe('Toasts', () => {
  for (const mode of MODES) {
    test(`a toast uses the page colours in ${mode} mode`, {tag: '@mobile'}, async ({site, tierList}) => {
      await tierList.goto(TANKS);
      await site.chooseMode(mode);

      await tierList.setZenMode(true);

      const toast = tierList.toast('Entered Zen Mode');
      await expect(toast).toBeVisible();
      await expect(async () => {
        const colors = await site.colorsOf(toast);
        expect(colors.background, 'toast background').not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);
        expect(colors.background, 'toast background').toBe(colors.pageBackground);
        expect(colors.text, 'toast text colour').toBe(colors.pageText);
      }).toPass();
    });
  }
});
