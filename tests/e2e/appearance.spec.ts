import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, test} from '../support/test';
import type {SitePage, ThemeMode} from '../pages/site-page';
import type {TierListPage} from '../pages/tier-list-page';
import {rankingState} from '../support/links';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {
  appearanceModel, appearanceViewOf, STORED_THEME, type AppearanceEvent, type AppearanceSnapshot, type AppearanceView,
} from '../models/appearance';

// The Appearance menu (owner decisions, 2026-10-28): Mode, Game colours and Font.
const TANKS = '/rank/overwatch/tank';

// The page background in each mode, and the primary colour of the Share button (app/globals.css).
const LIGHT_BACKGROUND = 'rgb(255, 255, 255)';

const DARK_BACKGROUND = 'rgb(12, 10, 9)';

const BRAND_BLUE = 'rgb(13, 98, 181)';

const OVERWATCH_ORANGE = 'rgb(182, 61, 11)';

/** The Share button's primary colour in dark mode, without and with OVERWATCH's colours (app/globals.css). */
const DARK_BRAND_BLUE = 'rgb(138, 182, 240)';

const DARK_OVERWATCH_ORANGE = 'rgb(251, 146, 60)';

// Toasts take the page's colours in every theme. Sonner, the toast library, ships its own
// styles; if they win, a toast can turn transparent over the tier list.
const MODES: ThemeMode[] = ['light', 'dark'];
/** Themes saved before 2.0.0, and the mode each one applies (THEME_CLASSES in lib/appearance.ts). */
const RETIRED_THEMES: [string, 'light' | 'dark'][] = [['ocean-light', 'light'], ['ocean-dark', 'dark'], ['forest-light', 'light'], ['forest-dark', 'dark']];
const MODE_LABELS = {light: 'Light', dark: 'Dark'} as const;

test.describe('appearance', () => {
  test.describe('settings', () => {
    test('renders the page background of the device colour scheme, also after it changes, when the user chooses System', {tag: '@mobile'}, async ({site, page}) => {
      // Emulate after the first load: the Cross-Origin-Opener-Policy header moves the page into
      // a new browsing context in Firefox, and Playwright's emulation set before it is lost.
      await site.gotoHome();
      await page.emulateMedia({colorScheme: 'dark'});
      await site.chooseMode('light');
      await expect(site.body).toHaveCSS('background-color', LIGHT_BACKGROUND);

      await site.chooseMode('system');
      await expect(site.body).toHaveCSS('background-color', DARK_BACKGROUND);
      await page.emulateMedia({colorScheme: 'light'});
      await expect(site.body).toHaveCSS('background-color', LIGHT_BACKGROUND);

      await site.reload();
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

    // The model checks Game colours on and off, and after a reload, on an image set's page.
    test('renders button "Share" in brand blue with Game colours on when the page opens /rank, a list of no image set', async ({tierList}) => {
      await tierList.goto('/rank');

      await expect(tierList.shareButton).toHaveCSS('background-color', BRAND_BLUE);
    });
  });

  test.describe('toasts', () => {
    for (const mode of MODES) {
      test(`renders the toast in the page background and text colours when the user turns on Zen in ${mode} mode`, {tag: '@mobile'}, async ({site, tierList}) => {
        await tierList.goto(TANKS);
        await site.chooseMode(mode);

        await tierList.zen.setZenMode(true);

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

  test.describe('model', () => {
    /** Two ranked items and two in Unranked, on OVERWATCH's tank template. */
    const ITEMS = ['Reinhardt', 'Zarya', 'Mauga', 'Winston'];
    const LIST = rankingState('image-overwatch', {S: ITEMS.slice(0, 2), '': ITEMS.slice(2)});

    /** What the page shows, and what this browser keeps, for one state of the appearance machine. */
    const expectAppearance = async (site: SitePage, tierList: TierListPage, view: AppearanceView) => {
      // Playwright's browsers report a light colour scheme, so System shows the light page.
      const dark = view.mode === 'dark';
      await expect(site.body).toHaveCSS('background-color', dark ? DARK_BACKGROUND : LIGHT_BACKGROUND);
      await expect(site.body).toHaveCSS('font-family', view.font === 'classic' ? /Nunito Sans/ : /Geologica/);
      const shareColour = view.gameColours
        ? (dark ? DARK_OVERWATCH_ORANGE : OVERWATCH_ORANGE)
        : (dark ? DARK_BRAND_BLUE : BRAND_BLUE);
      await expect(tierList.shareButton).toHaveCSS('background-color', shareColour);
      const tileWidth = view.tileSize === 'compact' ? 48 : 80;
      for (const name of ITEMS) {
        await expect.poll(async () => (await tierList.sizeOf(tierList.itemPicture(name))).width, {message: `${name}'s tile width`}).toBe(tileWidth);
        // Without labels, a Compact tile keeps its name in a hidden tag that shows on hover.
        if (view.labelsShown) await expect(tierList.itemCaption(name)).toBeVisible();
        else await expect(tierList.itemCaption(name)).toBeHidden();
      }
      await expect.poll(async () => STORED_THEME[view.mode].includes(await site.storedValue('theme')), {message: 'the stored theme'}).toBe(true);
      expect(await site.storedValue('otb-font'), 'the stored font').toBe(view.font === 'classic' ? 'classic' : null);
      expect(await site.storedValue('otb-game-colours'), 'the stored game colours').toBe(view.gameColours ? null : 'off');
      expect(await site.storedValue('otb-tile-size'), 'the stored tile size').toBe(view.tileSize === 'compact' ? 'compact' : null);
    };

    /** The appearance machine's events and checks (modelSut). Each run starts as a new browser on the list. */
    const appearanceSut = (site: SitePage, tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      /** A choice in the Appearance menu, once the menu opens (right after a load it may not yet). */
      const inAppearanceMenu = (choose: () => Promise<void>) => async () => {
        await site.appearanceMenuReady();
        await choose();
      };
      return modelSut<AppearanceSnapshot, AppearanceEvent>(page, {
        reset: async () => {
          await tierList.openAsNewBrowser(TANKS, LIST);
          await site.appearanceMenuReady();
        },
        events: {
          CHOOSE_LIGHT: inAppearanceMenu(() => site.chooseMode('light')),
          CHOOSE_DARK: inAppearanceMenu(() => site.chooseMode('dark')),
          CHOOSE_SYSTEM: inAppearanceMenu(() => site.chooseMode('system')),
          CHOOSE_MODERN: inAppearanceMenu(() => site.chooseFont('Modern')),
          CHOOSE_CLASSIC: inAppearanceMenu(() => site.chooseFont('Classic')),
          TURN_OFF_GAME_COLOURS: inAppearanceMenu(() => site.setGameColours(false)),
          TURN_ON_GAME_COLOURS: inAppearanceMenu(() => site.setGameColours(true)),
          CHOOSE_COMPACT: () => tierList.rows.chooseTileSizeWithKeyboard('Compact'),
          CHOOSE_COMFORTABLE: () => tierList.rows.chooseTileSizeWithKeyboard('Comfortable'),
          SHOW_LABELS: () => tierList.rows.setItemLabelsVisibleWithKeyboard(true),
          HIDE_LABELS: () => tierList.rows.setItemLabelsVisibleWithKeyboard(false),
          RELOAD: async () => {
            await tierList.reload();
            await site.appearanceMenuReady();
          },
          VISIT_ABOUT_AND_GO_BACK: async () => {
            await site.visitAboutAndGoBack();
            await expect(tierList.tiers.first()).toBeVisible();
          },
        },
        states: {
          '*': (_page, snapshot) => expectAppearance(site, tierList, appearanceViewOf(snapshot)),
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(appearanceModel)) {
      test(`renders each state of the appearance machine when the user walks every transition (${part.name})`, async ({site, tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(appearanceModel, appearanceSut(site, tierList, page, testInfo), part);
        await attachCoverage(testInfo, appearanceModel, coverage, part);
      });
    }
  });
});
