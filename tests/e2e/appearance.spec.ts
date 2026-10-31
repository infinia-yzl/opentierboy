import {expect, test} from '../support/test';

// The Appearance menu (owner decisions, 2026-10-28): Mode, Game colours and Font.
const TANKS = '/rank/overwatch/tank';
// The page background in each mode, and the primary colour of the Share button (app/globals.css).
const LIGHT_BACKGROUND = 'rgb(255, 255, 255)';
const DARK_BACKGROUND = 'rgb(12, 10, 9)';
const BRAND_BLUE = 'rgb(13, 98, 181)';
const OVERWATCH_ORANGE = 'rgb(194, 65, 12)';

test.describe('Appearance', () => {
  test('the mode choice changes the page and is remembered', {tag: '@mobile'}, async ({site, page}) => {
    await site.gotoHome();
    await site.chooseMode('dark');
    await expect.poll(() => site.pageBackground()).toBe(DARK_BACKGROUND);

    await page.reload();
    await expect.poll(() => site.pageBackground()).toBe(DARK_BACKGROUND);

    await site.chooseMode('light');
    await expect.poll(() => site.pageBackground()).toBe(LIGHT_BACKGROUND);
  });

  test('System follows the device\'s light or dark setting, also when it changes', {tag: '@mobile'}, async ({site, page}) => {
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

  test('visitors who chose the retired Ocean or Forest themes keep their mode', async ({site}) => {
    await site.rememberBeforeLoad('theme', 'ocean-dark');
    await site.gotoHome();
    await expect.poll(() => site.pageBackground()).toBe(DARK_BACKGROUND);

    await site.openAppearance();
    await expect(site.modeOption('dark')).toBeChecked();
  });

  test('Modern is the default font, and Classic is remembered', async ({site, page}) => {
    await site.gotoHome();
    await expect.poll(() => site.bodyFont()).toContain('Geologica');

    await site.chooseFont('Classic');
    await expect.poll(() => site.bodyFont()).toContain('Nunito Sans');

    await page.reload();
    await expect.poll(() => site.bodyFont()).toContain('Nunito Sans');

    await site.chooseFont('Modern');
    await expect.poll(() => site.bodyFont()).toContain('Geologica');
  });

  test('an image set\'s pages take its game colour until game colours are turned off', async ({site, tierList, page}) => {
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
