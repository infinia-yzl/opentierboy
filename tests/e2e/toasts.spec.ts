import {expect, test} from '../support/test';
import type {ColorTheme, ThemeMode} from '../pages/SitePage';

const TANKS = '/rank/overwatch/tank';

// Toasts take the page's colours in every theme. Sonner, the toast library, ships its own
// styles; if they win, a toast can turn transparent over the tier list.
const THEMES: [ColorTheme, ThemeMode][] = [['classic', 'light'], ['classic', 'dark'], ['ocean', 'dark']];

test.describe('Toasts', () => {
  for (const [colorTheme, mode] of THEMES) {
    test(`a toast uses the page colours in the ${colorTheme} ${mode} theme`, {tag: '@mobile'}, async ({site, tierList}) => {
      await tierList.goto(TANKS);
      await site.chooseTheme(colorTheme, mode);

      await tierList.setZenMode(true);

      const toast = tierList.toast('Entered Zen Mode');
      await expect(toast).toBeVisible();
      const colors = await site.colorsOf(toast);
      expect(colors.background, 'toast background').not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);
      expect(colors.background, 'toast background').toBe(colors.pageBackground);
      expect(colors.text, 'toast text colour').toBe(colors.pageText);
    });
  }
});
