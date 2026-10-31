import {expect, test} from '../support/test';
import type {ThemeMode} from '../pages/site-page';

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
/** Themes saved before 2.0.0, and the mode each one applies (THEME_CLASSES in lib/appearance.ts). */
const RETIRED_THEMES: [string, 'light' | 'dark'][] = [['ocean-light', 'light'], ['ocean-dark', 'dark'], ['forest-light', 'light'], ['forest-dark', 'dark']];
const MODE_LABELS = {light: 'Light', dark: 'Dark'} as const;

test.describe('appearance', () => {
  test.describe('settings', () => {
    test('renders the page background of the chosen mode, also after a reload, when the user chooses Dark or Light', {tag: '@mobile'}, async ({site, page}) => {
      await site.gotoHome();
      await site.chooseMode('dark');
      await expect(site.body).toHaveCSS('background-color', DARK_BACKGROUND);

      await page.reload();
      await expect(site.body).toHaveCSS('background-color', DARK_BACKGROUND);

      await site.chooseMode('light');
      await expect(site.body).toHaveCSS('background-color', LIGHT_BACKGROUND);
    });

    test('renders the page background of the device colour scheme, also after it changes, when the user chooses System', {tag: '@mobile'}, async ({site, page}) => {
      await page.emulateMedia({colorScheme: 'dark'});
      await site.gotoHome();
      await site.chooseMode('light');
      await expect(site.body).toHaveCSS('background-color', LIGHT_BACKGROUND);

      await site.chooseMode('system');
      await expect(site.body).toHaveCSS('background-color', DARK_BACKGROUND);
      await page.emulateMedia({colorScheme: 'light'});
      await expect(site.body).toHaveCSS('background-color', LIGHT_BACKGROUND);

      await page.reload();
      await expect(site.body).toHaveCSS('background-color', LIGHT_BACKGROUND);
      await page.emulateMedia({colorScheme: 'dark'});
      await expect(site.body).toHaveCSS('background-color', DARK_BACKGROUND);
    });

    for (const [retired, mode] of RETIRED_THEMES) {
      test(`renders the ${mode} page background and the option ${MODE_LABELS[mode]} checked when localStorage theme is the retired value ${retired}`, async ({site}) => {
        await site.rememberBeforeLoad('theme', retired);
        await site.gotoHome();
        await expect(site.body).toHaveCSS('background-color', mode === 'dark' ? DARK_BACKGROUND : LIGHT_BACKGROUND);

        await site.openAppearance();
        await expect(site.modeOption(mode)).toBeChecked();
      });
    }

    test('renders Geologica by default, and Nunito Sans after a reload, when the user chooses the font Classic', async ({site, page}) => {
      await site.gotoHome();
      await expect(site.body).toHaveCSS('font-family', /Geologica/);

      await site.chooseFont('Classic');
      await expect(site.body).toHaveCSS('font-family', /Nunito Sans/);

      await page.reload();
      await expect(site.body).toHaveCSS('font-family', /Nunito Sans/);

      await site.chooseFont('Modern');
      await expect(site.body).toHaveCSS('font-family', /Geologica/);
    });

    test('renders button "Share" in brand blue, also after a reload, when the user turns off Game colours on an image set page', async ({site, tierList, page}) => {
      await tierList.goto('/rank');
      await expect(tierList.shareButton).toHaveCSS('background-color', BRAND_BLUE);

      await tierList.goto(TANKS);
      await expect(tierList.shareButton).toHaveCSS('background-color', OVERWATCH_ORANGE);

      await site.setGameColours(false);
      await expect(tierList.shareButton).toHaveCSS('background-color', BRAND_BLUE);

      await page.reload();
      await expect(tierList.shareButton).toHaveCSS('background-color', BRAND_BLUE);
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
