import {expect, test} from '../support/test';

// The Appearance menu (owner decisions, 2026-10-28): Mode, Game colours and Font.
const TANKS = '/rank/overwatch/tank';
const BRAND_BLUE = '209.6 86.6% 38%';
const OVERWATCH_ORANGE = '17.5 88.3% 40.4%';

test.describe('Appearance', () => {
  test('the mode choice changes the page and is remembered', {tag: '@mobile'}, async ({site, page}) => {
    await site.gotoHome();
    await site.chooseMode('dark');
    await expect.poll(() => site.pageHasClass('dark')).toBe(true);

    await page.reload();
    await expect.poll(() => site.pageHasClass('dark')).toBe(true);

    await site.chooseMode('light');
    await expect.poll(() => site.pageHasClass('dark')).toBe(false);
  });

  test('System follows the device\'s light or dark setting, also when it changes', {tag: '@mobile'}, async ({site, page}) => {
    await page.emulateMedia({colorScheme: 'dark'});
    await site.gotoHome();
    await site.chooseMode('light');
    await expect.poll(() => site.pageHasClass('dark')).toBe(false);

    await site.chooseMode('system');
    await expect.poll(() => site.pageHasClass('dark')).toBe(true);
    await page.emulateMedia({colorScheme: 'light'});
    await expect.poll(() => site.pageHasClass('dark')).toBe(false);

    await page.reload();
    await expect.poll(() => site.pageHasClass('dark')).toBe(false);
    await page.emulateMedia({colorScheme: 'dark'});
    await expect.poll(() => site.pageHasClass('dark')).toBe(true);
  });

  test('visitors who chose the retired Ocean or Forest themes keep their mode', async ({site}) => {
    await site.rememberBeforeLoad('theme', 'ocean-dark');
    await site.gotoHome();
    await expect.poll(() => site.pageHasClass('dark')).toBe(true);
    await expect.poll(() => site.pageHasClass('ocean-dark')).toBe(false);

    const menu = await site.openAppearance();
    await expect(menu.getByRole('menuitemradio', {name: 'Dark'})).toHaveAttribute('aria-checked', 'true');
  });

  test('Modern is the default font, and Classic is remembered', async ({site, page}) => {
    await site.gotoHome();
    expect(await site.bodyFont()).toContain('Geologica');

    await site.chooseFont('Classic');
    expect(await site.bodyFont()).toContain('Nunito Sans');

    await page.reload();
    expect(await site.bodyFont()).toContain('Nunito Sans');

    await site.chooseFont('Modern');
    expect(await site.bodyFont()).toContain('Geologica');
  });

  test('an image set\'s pages take its game colour until game colours are turned off', async ({site, tierList, page}) => {
    await site.gotoHome();
    expect(await site.token('--primary')).toBe(BRAND_BLUE);

    await tierList.goto(TANKS);
    await expect.poll(() => site.token('--primary')).toBe(OVERWATCH_ORANGE);

    await site.setGameColours(false);
    await expect.poll(() => site.token('--primary')).toBe(BRAND_BLUE);

    await page.reload();
    await expect.poll(() => site.pageHasClass('no-game-colours')).toBe(true);
    expect(await site.token('--primary')).toBe(BRAND_BLUE);
  });

  test('the footer shows the current year', async ({site}) => {
    await site.gotoHome();
    await expect(site.footer).toContainText('© 2026 OpenTierBoy');
  });
});
