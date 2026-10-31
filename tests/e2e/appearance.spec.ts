import {expect, test} from '../support/test';
import type {ThemeMode} from '../pages/SitePage';

// The Appearance menu (owner decisions, 2026-10-28): Mode, Game colours and Font.
const TANKS = '/rank/overwatch/tank';

// The page background in each mode, and the primary colour of the Share button (app/globals.css).
const LIGHT_BACKGROUND = 'rgb(255, 255, 255)';

const DARK_BACKGROUND = 'rgb(12, 10, 9)';

const BRAND_BLUE = 'rgb(13, 98, 181)';

const OVERWATCH_ORANGE = 'rgb(194, 65, 12)';

// Toasts take the page's colours in every theme. Sonner, the toast library, ships its own
// styles; if they win, a toast can turn transparent over the tier list.
const MODES: ThemeMode[] = ['light', 'dark'];

test.describe('appearance', () => {
  test.describe('settings', () => {
    test('renders the page background of the chosen mode, also after a reload, when the user chooses Dark or Light', {tag: '@mobile'}, async ({site, page}) => {
      await site.gotoHome();
      await site.chooseMode('dark');
      await expect.poll(() => site.pageBackground()).toBe(DARK_BACKGROUND);

      await page.reload();
      await expect.poll(() => site.pageBackground()).toBe(DARK_BACKGROUND);

      await site.chooseMode('light');
      await expect.poll(() => site.pageBackground()).toBe(LIGHT_BACKGROUND);
    });

    test('renders the page background of the device colour scheme, also after it changes, when the user chooses System', {tag: '@mobile'}, async ({site, page}) => {
      await page.emulateMedia({colorScheme: 'dark'});
      await site.gotoHome();
      await site.chooseMode('light');
      await expect.poll(() => site.pageBackground()).toBe(LIGHT_BACKGROUND);

      await site.chooseMode('system');
      await expect.poll(() => site.pageBackground()).toBe(DARK_BACKGROUND);
      await page.emulateMedia({colorScheme: 'light'});
      await expect.poll(() => site.pageBackground()).toBe(LIGHT_BACKGROUND);

      await page.reload();
      await expect.poll(() => site.pageBackground()).toBe(LIGHT_BACKGROUND);
      await page.emulateMedia({colorScheme: 'dark'});
      await expect.poll(() => site.pageBackground()).toBe(DARK_BACKGROUND);
    });

    test('renders the dark page background and checks Dark when localStorage theme is the retired value ocean-dark', async ({site}) => {
      await site.rememberBeforeLoad('theme', 'ocean-dark');
      await site.gotoHome();
      await expect.poll(() => site.pageBackground()).toBe(DARK_BACKGROUND);

      await site.openAppearance();
      await expect(site.modeOption('dark')).toBeChecked();
    });

    test('renders Geologica by default, and Nunito Sans after a reload, when the user chooses the font Classic', async ({site, page}) => {
      await site.gotoHome();
      await expect.poll(() => site.bodyFont()).toContain('Geologica');

      await site.chooseFont('Classic');
      await expect.poll(() => site.bodyFont()).toContain('Nunito Sans');

      await page.reload();
      await expect.poll(() => site.bodyFont()).toContain('Nunito Sans');

      await site.chooseFont('Modern');
      await expect.poll(() => site.bodyFont()).toContain('Geologica');
    });

    test('renders button "Share" in brand blue, also after a reload, when the user turns off Game colours on an image set page', async ({site, tierList, page}) => {
      await tierList.goto('/rank');
      await expect.poll(() => site.colorsOf(tierList.shareButton).then((colors) => colors.background)).toBe(BRAND_BLUE);

      await tierList.goto(TANKS);
      await expect.poll(() => site.colorsOf(tierList.shareButton).then((colors) => colors.background)).toBe(OVERWATCH_ORANGE);

      await site.setGameColours(false);
      await expect.poll(() => site.colorsOf(tierList.shareButton).then((colors) => colors.background)).toBe(BRAND_BLUE);

      await page.reload();
      await expect.poll(() => site.colorsOf(tierList.shareButton).then((colors) => colors.background)).toBe(BRAND_BLUE);
    });
  });

  test.describe('toasts', () => {
    for (const mode of MODES) {
      test(`renders the toast in the page background and text colours when the user turns on Zen in ${mode} mode`, {tag: '@mobile'}, async ({site, tierList}) => {
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
});
