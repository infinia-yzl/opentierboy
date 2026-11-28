import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, expectTierNames, SHARED_LINKS, test} from '../support/test';
import {packageItemId, rankingState, templateItemCount, v3LinkJson, v3State} from '../support/links';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import type {TierListPage} from '../pages/tier-list-page';
import {historyModel, historyViewOf, MAX_VERSIONS, type HistoryEvent, type HistorySnapshot} from '../models/history';
import {leavingModel, leavingViewOf, type LeavingEvent, type LeavingSnapshot} from '../models/leaving';
import {serveImageSite} from '../support/image-sites';

const TANKS = '/rank/overwatch/tank';
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

test.describe('history', () => {
  test.describe('Back', () => {
    test('writes the change as its own history entry when the user goes Back right after it', async ({tierList, site, page}) => {
      await site.goto('/about');
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));
      const opened = page.url();
      const entries = await tierList.historyLength();

      await tierList.drag.moveItemWithKeyboard('Mauga', ['ArrowUp'], {waitForLink: false});
      await tierList.goBackNow();

      await expect(page).toHaveURL(opened);
      await expect(tierList.itemsIn('F')).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Winston']);
      expect(await tierList.historyLength()).toBe(entries + 1);
      await tierList.goForward();
      await expect(tierList.itemsIn('F')).toHaveText(['Mauga']);
    });

    test('renders the list of the entry before when the user goes Back in the same task as a change', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      const opened = page.url();
      const rows = await tierList.tiers.count();

      await tierList.rows.addTierRowAndGoBackInTheSameTask();

      await expect(page).toHaveURL(opened);
      await expect(tierList.tiers).toHaveCount(rows);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });

  });

  test.describe('quick changes', () => {
    test('writes 1 history entry per move when the user makes 3 quick keyboard moves', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
      const entries = await tierList.historyLength();

      for (const name of ['Mauga', 'Winston', 'Sigma']) {
        await tierList.drag.moveItemWithKeyboard(name, ['ArrowUp'], {waitForLink: false});
      }
      await expect(tierList.itemsIn('F')).toHaveCount(3);
      await expect.poll(() => tierList.historyLength(), {message: 'one history entry per move'}).toBe(entries + 3);

      for (const count of [2, 1, 0]) {
        await tierList.goBack();
        await expect(tierList.itemsIn('F')).toHaveCount(count);
      }
    });

    test('writes 1 history entry per rename when the user renames row S twice quickly', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      const entries = await tierList.historyLength();

      await tierList.rows.renameTier('S', 'First', 'First', {waitForLink: false});
      await tierList.rows.renameTier('First', 'Second', 'Second', {waitForLink: false});
      await expect.poll(() => tierList.historyLength(), {message: 'one history entry per rename'}).toBe(entries + 2);

      await tierList.goBack();
      await expect(tierList.tiers.first()).toHaveAccessibleName('First');
      await tierList.goBack();
      await expect(tierList.tiers.first()).toHaveAccessibleName('S');
    });
  });

  test.describe('template pages', () => {
    test('renders the template items, and writes no history entry, when the user goes Back to the template path', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      await tierList.drag.dragItemToTier('Mauga', 'S');
      await tierList.drag.dragItemToTier('Winston', 'A');
      const entries = await tierList.historyLength();

      await tierList.goBack();
      await tierList.goBack();

      await expect(page).toHaveURL(/\/rank\/overwatch\/tank$/);
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);
      expect(await tierList.historyLength()).toBe(entries);
      await tierList.goForward();
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveCount(0);
    });
  });

  test.describe('opened links', () => {
    for (const id of ['link-001', 'link-012', 'link-002']) {
      const link = SHARED_LINKS.find((entry) => entry.id === id)!;
      test(`writes no new state parameter and no extra history entry when the page opens a ${link.format} link (${id})`, async ({tierList, site, page}) => {
        await site.goto('/about');
        const entries = await tierList.historyLength();

        await tierList.goto(link.path, link.state);
        await expect(tierList.title).toHaveText(link.expected.title);
        const opened = new URL(`${link.path}?state=${link.state}`, page.url()).href;
        expect(page.url()).toBe(opened);
        expect(await tierList.historyLength()).toBe(entries + 1);

        await tierList.setTitle('Changed');
        await tierList.goBack();
        await expect(page).toHaveURL(opened);
        await expect(tierList.title).toHaveText(link.expected.title);
      });
    }

    test('writes no new state parameter and no extra history entry when the page opens a titled v3 link', async ({tierList, site, page}) => {
      const state = v3State({
        t: 'My v3 list', tp: 5, lp: 'right',
        r: [['S', [packageItemId('image-overwatch', 'Mauga')]], ['A', []], ['B', []], ['C', []], ['F', []], ['', [packageItemId('image-overwatch', 'Winston')]]],
      });
      await site.goto('/about');
      const entries = await tierList.historyLength();

      await tierList.goto(TANKS, state);
      await expect(tierList.title).toHaveText('My v3 list');
      const opened = new URL(`${TANKS}?state=${state}`, page.url()).href;
      expect(page.url()).toBe(opened);
      expect(await tierList.historyLength()).toBe(entries + 1);

      await tierList.setTitle('Changed');
      await tierList.goBack();
      await expect(page).toHaveURL(opened);
      await expect(tierList.title).toHaveText('My v3 list');
    });
  });

  test.describe('label settings', () => {
    test('writes no history entry when the user chooses Top and Hide Labels with the mouse on a template page', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      const entries = await tierList.historyLength();

      await tierList.rows.chooseLabelPosition('Top');
      await tierList.rows.setItemLabelsVisible(false);
      expect(await tierList.historyLength(), 'the settings replace the current entry').toBe(entries);
      const withSettings = page.url();
      await tierList.drag.dragItemToTier('Winston', 'A');

      await tierList.goBack();
      await expect(page).toHaveURL(withSettings);
      await expect(tierList.itemsIn('A')).toHaveCount(0);
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Top')).toBeChecked();
      await expect(tierList.rows.rowOption('Hide Labels')).toBeChecked();
      await tierList.closeMenus();
    });

    test('renders the label position Top when the user goes Back and Forward after a list change', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
      await tierList.drag.dragItemToTier('Mauga', 'S');
      const firstChange = page.url();
      await tierList.drag.dragItemToTier('Winston', 'A');
      await tierList.rows.chooseLabelPosition('Top');
      const withTop = page.url();

      await tierList.goBack();
      await expect(page).toHaveURL(firstChange);
      await expect(tierList.itemsIn('A')).toHaveCount(0);
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Top')).toBeChecked();
      await expect(tierList.rows.rowOption('Show Labels')).toBeChecked();
      await tierList.closeMenus();
      await expect.poll(() => tierList.rows.tierLabelIsAbove('S', 'Mauga')).toBe(true);

      await tierList.goForward();
      await expect(page).toHaveURL(withTop);
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Top')).toBeChecked();
      await expect(tierList.rows.rowOption('Show Labels')).toBeChecked();
      await tierList.closeMenus();
    });

    test('renders the label settings of the link when the user goes Back to the editor from another page', async ({tierList, site}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.rows.chooseLabelPosition('Right');
      await tierList.rows.setItemLabelsVisible(false);

      await site.goto('/about');
      await tierList.goBack();
      await expect(tierList.itemsIn('S')).toHaveText(['']);
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Right')).toBeChecked();
      await expect(tierList.rows.rowOption('Hide Labels')).toBeChecked();
      await tierList.closeMenus();
    });

  });

  test.describe('refused history write', () => {
    const OPENED = {'': ['Mauga', 'Winston']};

    test.beforeEach(async ({tierList}) => {
      await tierList.prepareListWriteRefusals();
    });

    async function expectOpenedList(tierList: TierListPage, opened: string, entries: number) {
      await expect(tierList.page).toHaveURL(opened);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Winston']);
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await expect(tierList.itemsIn('F')).toHaveCount(0);
      await expect(tierList.drag.heldHandles).toHaveCount(0);
      expect(await tierList.historyLength()).toBe(entries);
    }

    async function expectNextDragWritesOneEntry(tierList: TierListPage, opened: string, entries: number) {
      await tierList.drag.dragItemToTier('Mauga', 'S');
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      const moved = tierList.page.url();
      expect(await tierList.historyLength()).toBe(entries + 1);
      await tierList.goBack();
      await expect(tierList.page).toHaveURL(opened);
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await tierList.goForward();
      await expect(tierList.page).toHaveURL(moved);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    }

    test('renders the list of the address and the save toast when the browser refuses the write of a pointer drag', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', OPENED));
      const opened = page.url();
      const entries = await tierList.historyLength();
      await tierList.refuseNextListWrite();

      await tierList.drag.dragItemToTierRefused('Mauga', 'S');

      await tierList.expectSavePaused();
      await expectOpenedList(tierList, opened, entries);
      await expectNextDragWritesOneEntry(tierList, opened, entries);
    });

    test('renders the list of the address and the save toast when the browser refuses the write of a keyboard move', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', OPENED));
      const opened = page.url();
      const entries = await tierList.historyLength();
      await tierList.refuseNextListWrite();

      const heard = await tierList.drag.moveItemWithKeyboardRefused('Mauga', ['ArrowUp']);

      expect(heard.at(-1)).toMatch(/^Move cancelled\. /);
      await tierList.expectSavePaused();
      await expectOpenedList(tierList, opened, entries);
      await expectNextDragWritesOneEntry(tierList, opened, entries);
    });

    test('renders the list of the address and the save toast when the browser ignores the write of a pointer drag', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', OPENED));
      const opened = page.url();
      const entries = await tierList.historyLength();
      await tierList.refuseNextListWrite({silently: true});

      await tierList.drag.dragItemToTierRefused('Mauga', 'S');

      await tierList.expectSavePaused();
      await expectOpenedList(tierList, opened, entries);
      await expectNextDragWritesOneEntry(tierList, opened, entries);
    });

    test('renders the rows of the address and the save toast when the browser refuses the write of a row moved by its grip', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));
      const opened = page.url();
      const entries = await tierList.historyLength();
      await tierList.refuseNextListWrite();

      const heard = await tierList.drag.moveRowWithKeyboardRefused('S', ['ArrowDown']);

      expect(heard.at(-1)).toMatch(/^Move cancelled\. /);
      await tierList.expectSavePaused();
      await expect(page).toHaveURL(opened);
      await expectTierNames(tierList, ['S', 'A', 'B', 'C', 'F', 'Unranked']);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
      expect(await tierList.historyLength()).toBe(entries);
    });

    test('renders the rows of the address and the save toast when the browser refuses the write of items moved by a row stack', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));
      const opened = page.url();
      const entries = await tierList.historyLength();
      await tierList.refuseNextListWrite();

      const heard = await tierList.drag.moveRowItemsWithKeyboardRefused('S', ['ArrowDown']);

      expect(heard.at(-1)).toMatch(/^Move cancelled\. /);
      await tierList.expectSavePaused();
      await expect(page).toHaveURL(opened);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
      expect(await tierList.historyLength()).toBe(entries);
    });

    test('renders the title of the address and the save toast when the browser refuses the write of a new title', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', OPENED, 'Tanks'));
      const opened = page.url();
      const entries = await tierList.historyLength();
      await tierList.refuseNextListWrite();

      await tierList.typeTitleAndPressEnter('Best tanks');

      await tierList.expectSavePaused();
      await expect(tierList.title).toHaveText('Tanks');
      await expectOpenedList(tierList, opened, entries);
      await expectNextDragWritesOneEntry(tierList, opened, entries);
    });

    test('renders the deleted item again, the save toast and no Undo toast when the browser refuses the write of a delete', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', OPENED));
      const opened = page.url();
      const entries = await tierList.historyLength();
      await tierList.refuseNextListWrite();

      await tierList.items.deleteItemNow('Winston');

      await tierList.expectSavePausedAlone();
      await expectOpenedList(tierList, opened, entries);
      await expectNextDragWritesOneEntry(tierList, opened, entries);
    });

    test('renders the ranked items again, the save toast and no Undo toast when the browser refuses the write of Reset', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston']}));
      const opened = page.url();
      const entries = await tierList.historyLength();
      await tierList.refuseNextListWrite();

      await tierList.items.resetRankingsNow();

      await tierList.expectSavePausedAlone();
      await expect(page).toHaveURL(opened);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Winston']);
      expect(await tierList.historyLength()).toBe(entries);
    });

    test('renders the label position of the address and the save toast when the browser refuses the write of a label setting', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', OPENED));
      const opened = page.url();
      const entries = await tierList.historyLength();
      await tierList.refuseNextListWrite();

      await tierList.rows.chooseLabelPositionNow('Top');

      await tierList.expectSavePaused();
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Left')).toBeChecked();
      await tierList.closeMenus();
      await expectOpenedList(tierList, opened, entries);

      await tierList.rows.chooseLabelPosition('Top');
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Top')).toBeChecked();
      await tierList.closeMenus();
      expect(await tierList.historyLength()).toBe(entries);
    });
  });

  test.describe('model', () => {
    const TRAY = ['Mauga', 'Winston', 'Sigma'];
    const LIST = rankingState('image-overwatch', {S: ['Reinhardt'], '': TRAY});

    const historySut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let opened = '';
      let entries = 0;
      let addresses: string[] = [];
      let wrote = false;
      const step = (writes: boolean, act: () => Promise<void>) => async () => {
        wrote = writes;
        await act();
      };
      const layoutIn = (link: string): {lp: string; sl: boolean} => {
        if (link === opened) return {lp: 'left', sl: true};
        const {lp = 'left', sl = true} = v3LinkJson(link) as {lp?: string; sl?: boolean};
        return {lp, sl};
      };
      const setting = (inAddress: (layout: {lp: string; sl: boolean}) => boolean, choose: () => Promise<void>, chooseAndWaitForLink: () => Promise<void>) => async () => {
        wrote = !inAddress(layoutIn(page.url()));
        await (wrote ? chooseAndWaitForLink() : choose());
      };
      const rowAIn = (link: string): unknown => {
        if (link === opened) return [];
        const {r: rows} = v3LinkJson(link) as {r: unknown[][]};
        return rows.find((row) => row.at(-2) === 'A')?.at(-1);
      };
      return modelSut<HistorySnapshot, HistoryEvent>(page, {
        reset: async () => {
          await tierList.openAfterBlankPage(TANKS, LIST);
          opened = page.url();
          entries = await tierList.historyLength();
          addresses = [opened];
          wrote = false;
        },
        events: {
          CHANGE_LIST: step(true, () => tierList.drag.dragFirstUnrankedItemToTier('A')),
          CHANGE_REFUSED: step(false, () => tierList.refuseListWriteOf(() => tierList.drag.dragFirstUnrankedItemToTierRefused('A'))),
          BROWSER_BACK: step(false, () => tierList.goBack()),
          BROWSER_FORWARD: step(false, () => tierList.goForward()),
          CHOOSE_TOP: setting(({lp}) => lp === 'top', () => tierList.rows.chooseLabelPositionWithKeyboardNow('Top'), () => tierList.rows.chooseLabelPositionWithKeyboard('Top')),
          CHOOSE_LEFT: setting(({lp}) => lp === 'left', () => tierList.rows.chooseLabelPositionWithKeyboardNow('Left'), () => tierList.rows.chooseLabelPositionWithKeyboard('Left')),
          HIDE_ITEM_LABELS: setting(({sl}) => !sl, () => tierList.rows.setItemLabelsVisibleWithKeyboardNow(false), () => tierList.rows.setItemLabelsVisibleWithKeyboard(false)),
          SHOW_ITEM_LABELS: setting(({sl}) => sl, () => tierList.rows.setItemLabelsVisibleWithKeyboardNow(true), () => tierList.rows.setItemLabelsVisibleWithKeyboard(true)),
        },
        states: {
          '*': async (_page, snapshot) => {
            const {version, versions, labelPosition, itemLabels} = historyViewOf(snapshot);
            const rows: Readonly<Record<string, readonly string[]>> = {
              S: ['Reinhardt'], A: TRAY.slice(0, version - 1), B: [], C: [], F: [], Unranked: TRAY.slice(version - 1),
            };
            await expectTierNames(tierList, Object.keys(rows));
            for (const [row, names] of Object.entries(rows)) {
              await expect.poll(() => tierList.itemNamesIn(row), {message: `the items of row ${row}`}).toEqual(names);
            }
            await expect(tierList.itemsIn('S')).toHaveText([itemLabels ? 'Reinhardt' : '']);
            await expect.poll(() => tierList.rows.tierLabelIsAbove('S', 'Reinhardt'), {message: `the label of row S should sit ${labelPosition === 'top' ? 'above' : 'beside'} its items`})
              .toBe(labelPosition === 'top');
            await expect.poll(() => rowAIn(page.url()), {message: `the address should hold version ${version}`})
              .toEqual(TRAY.slice(0, version - 1).map((name) => packageItemId('image-overwatch', name)));
            if (wrote) addresses[version - 1] = page.url();
            else await expect(page, `the address of version ${version}`).toHaveURL(addresses[version - 1]);
            await expect.poll(() => tierList.historyLength(), {message: `the tab's history should hold ${versions} versions`})
              .toBe(entries + versions - 1);
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(historyModel)) {
      test(`renders each version of the list when the user walks every transition of changes, Back and Forward (${part.name})`, async ({tierList, page}, testInfo) => {
        expect(TRAY).toHaveLength(MAX_VERSIONS - 1);
        test.setTimeout(MODEL_PART_TIMEOUT);
        await tierList.prepareListWriteRefusals();
        const coverage = await walkModel(historyModel, historySut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, historyModel, coverage, part);
      });
    }
  });

  test.describe('model: leaving', () => {
    const LEAVE_TRAY = ['Mauga', 'Winston'];
    const LEAVE_LIST = rankingState('image-overwatch', {'': LEAVE_TRAY});
    const DROPPED = 'https://i.imgur.com/red.png';
    const DROPPED_NAME = 'red';

    const leavingSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let trip: {release: () => Promise<void>} | null = null;
      let opened = '';
      let entries = 0;
      const releaseTrip = async () => {
        const hold = trip;
        trip = null;
        await hold?.release();
      };
      const sut = modelSut<LeavingSnapshot, LeavingEvent>(page, {
        reset: async () => {
          await releaseTrip();
          await tierList.openAfterBlankPage(TANKS, LEAVE_LIST, {onBlankPage: async () => {
            trip = await tierList.holdTripHome();
          }});
          opened = page.url();
          entries = await tierList.historyLength();
        },
        events: {
          CHANGE_LIST: () => tierList.drag.moveFirstUnrankedItemUpWithKeyboard(),
          CLICK_HOME: () => tierList.clickHomeNow(),
          DROP_IMAGE_LINK: () => tierList.linkImages.dropImageAddressAndWaitForItem(DROPPED, DROPPED_NAME),
          HOME_ANSWERS: () => releaseTrip(),
          BROWSER_BACK: () => tierList.goBack(),
        },
        states: {
          '*': async (_page, snapshot) => {
            const view = leavingViewOf(snapshot);
            if (view.page === 'home') {
              await expect(page, 'the visitor should be on Home').toHaveURL(/^[^?]*\/$/);
              await expect(tierList.tiers).toHaveCount(0);
              return;
            }
            await expect(page).toHaveURL(new RegExp(`${TANKS}\\?`));
            const changes = view.version - 1 + (view.imageAdded ? 1 : 0);
            await expect.poll(() => tierList.itemNamesIn('F')).toEqual(view.version === 2 ? ['Mauga'] : []);
            await expect.poll(() => tierList.itemNamesIn('Unranked'))
              .toEqual([...(view.version === 2 ? LEAVE_TRAY.slice(1) : LEAVE_TRAY), ...(view.imageAdded ? [DROPPED_NAME] : [])]);
            if (changes === 0) {
              expect(page.url(), 'the address should hold the list as opened').toBe(opened);
            } else {
              await expect(page).not.toHaveURL(opened);
            }
            await expect.poll(() => tierList.historyLength(), {message: 'one history entry per change, and one for Home after Back from it'})
              .toBe(entries + changes + (view.homeAhead ? 1 : 0));
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
      return {sut, releaseTrip};
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(leavingModel)) {
      test(`renders Home, or the editor with each change written, when the user clicks the link to Home (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        await serveImageSite(page, 'i.imgur.com');
        const {sut, releaseTrip} = leavingSut(tierList, page, testInfo);
        try {
          const coverage = await walkModel(leavingModel, sut, part);
          await attachCoverage(testInfo, leavingModel, coverage, part);
        } finally {
          await releaseTrip();
        }
      });
    }
  });
});
