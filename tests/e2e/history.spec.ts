import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, expectTierNames, SHARED_LINKS, test} from '../support/test';
import {packageItemId, rankingState, templateItemCount, v3LinkJson, v3State} from '../support/links';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import type {TierListPage} from '../pages/tier-list-page';
import {historyModel, historyViewOf, MAX_VERSIONS, type HistoryEvent, type HistorySnapshot} from '../models/history';
import {clickHomeNow} from '../pages/tier-list-page';
import {leavingBusy, leavingModel, leavingViewOf, type LeavingEvent, type LeavingSnapshot} from '../models/leaving';
import {serveImageSite} from '../support/image-sites';

const TANKS = '/rank/overwatch/tank';
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

/**
 * Product rule: the browser history is the undo feature.
 *
 * Every change to the list writes a new link into the address bar as a new history
 * entry, so the browser Back button steps back to the previous version of the list, one
 * change at a time. This is intended. Do not change the app to replace history entries.
 * The editor writes the entry itself, in the event of the change (history.pushState), and asks
 * nothing of the server.
 */
test.describe('history', () => {
  /** Back right after a change, and leaving right after one: the entry is written in the change's own event. */
  test.describe('Back', () => {
    test('writes the change as its own history entry when the user goes Back right after it', async ({tierList, site, page}) => {
      await site.goto('/about');
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));
      const opened = page.url();
      const entries = await tierList.historyLength();

      await tierList.drag.moveItemWithKeyboard('Mauga', ['ArrowUp'], {waitForLink: false});
      // Back at once, before the page has done anything more, on purpose.
      await tierList.goBackNow();
      await tierList.settled();

      await expect(page).toHaveURL(opened);
      await expect(tierList.itemsIn('F')).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Winston']);
      expect(await tierList.historyLength()).toBe(entries + 1);
      await tierList.goForward();
      await expect(tierList.itemsIn('F')).toHaveText(['Mauga']);
    });

    test('writes the change before Home when the user clicks the link to Home right after a change', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));

      await tierList.drag.moveItemWithKeyboard('Mauga', ['ArrowUp'], {waitForLink: false});
      await tierList.leaveForHome();
      await tierList.goBack();

      await expect(tierList.itemsIn('F')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Winston']);
    });
  });

  /**
   * Quick changes each get their own history entry (A44): the editor writes each one in its own
   * event, and the router catching up with them later merges none.
   */
  test.describe('quick changes', () => {
    test('writes 1 history entry per move when the user makes 3 quick keyboard moves', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
      const entries = await tierList.historyLength();

      for (const name of ['Mauga', 'Winston', 'Sigma']) {
        await tierList.drag.moveItemWithKeyboard(name, ['ArrowUp'], {waitForLink: false});
      }
      await expect(tierList.itemsIn('F')).toHaveCount(3);
      await tierList.settled();
      expect(await tierList.historyLength(), 'one history entry per move').toBe(entries + 3);

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
      await tierList.settled();
      expect(await tierList.historyLength(), 'one history entry per rename').toBe(entries + 2);

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
      // Showing the template again writes nothing: Forward still works (A6).
      expect(await tierList.historyLength()).toBe(entries);
      await tierList.goForward();
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveCount(0);
    });
  });

  /**
   * Opening a link never writes the address (A1): the address and the history stay as they
   * are, so Back leaves the list. Only a change to the list writes a new link.
   */
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

        // One change, then Back, returns to exactly this link.
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

  /**
   * Label position and label visibility travel in the link (A3). The owner chose on 2026-10-25
   * that they replace the current history entry, so they add no Back step, as before; Back and
   * Forward inside the editor keep the settings on screen.
   */
  test.describe('label settings', () => {
    // On a list opened from a link, the history model checks the same with the keyboard. A
    // template page has no state parameter until the first setting.
    test('writes no history entry when the user chooses Top and Hide Labels with the mouse on a template page', async ({tierList, page}) => {
      await tierList.goto(TANKS);
      const entries = await tierList.historyLength();

      await tierList.rows.chooseLabelPosition('Top');
      await tierList.rows.setItemLabelsVisible(false);
      await tierList.settled();
      expect(await tierList.historyLength(), 'the settings replace the current entry').toBe(entries);
      const withSettings = page.url();
      await tierList.drag.dragItemToTier('Winston', 'A');

      // Back after the one change to the list goes straight back to the page as opened, whose
      // link now holds the settings.
      await tierList.goBack();
      await expect(page).toHaveURL(withSettings);
      await expect(tierList.itemsIn('A')).toHaveCount(0);
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Top')).toBeChecked();
      await expect(tierList.rows.rowOption('Hide Labels')).toBeChecked();
      await tierList.closeMenus();
    });

    test('renders the label position Top when the user goes Back and Forward after a list change', async ({tierList, page}) => {
      // The owner's example: Mauga to S, Winston to A, labels on Top, then Back.
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
      await tierList.drag.dragItemToTier('Mauga', 'S');
      const firstChange = page.url();
      await tierList.drag.dragItemToTier('Winston', 'A');
      await tierList.rows.chooseLabelPosition('Top');
      const withTop = page.url();

      await tierList.goBack();
      // Top rewrote the entry of the second change only (A3).
      await expect(page).toHaveURL(firstChange);
      await expect(tierList.itemsIn('A')).toHaveCount(0);
      await tierList.rows.openRowOptions();
      await expect(tierList.rows.rowOption('Top')).toBeChecked();
      await expect(tierList.rows.rowOption('Show Labels')).toBeChecked();
      await tierList.closeMenus();
      await expect.poll(() => tierList.rows.tierLabelIsAbove('S', 'Mauga')).toBe(true);

      // Forward shows Winston in A again, still with labels on Top.
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

  /**
   * The history machine (tests/machines/history.ts). Back and Forward are
   * the browser's own buttons (page.goBack, page.goForward): product rule 2 makes the browser
   * history the undo, for every visitor. The Zen bar's Back and Forward call the same history
   * (components/useListSteps.ts), but only in Zen, which hides Row options and with them the
   * label settings; zen.spec.ts checks them.
   */
  test.describe('model', () => {
    // One item in row S shows the label settings. Each change ranks the next Unranked item into
    // row A, so version n of the list has n items in row A.
    const TRAY = ['Mauga', 'Winston', 'Sigma'];
    const LIST = rankingState('image-overwatch', {S: ['Reinhardt'], '': TRAY});

    /** The history machine's events and checks, run on this test's page (modelSut). */
    const historySut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      /** The address of the list as opened (version 1), and the history entries then. */
      let opened = '';
      let entries = 0;
      /** The address of each version, by version - 1, as the step that wrote it left it. */
      let addresses: string[] = [];
      /** True when the last step wrote the address of the version on screen: a change or a label setting. */
      let wrote = false;
      /** Runs a step, and notes whether it writes the address of the version on screen. */
      const step = (writes: boolean, act: () => Promise<void>) => async () => {
        wrote = writes;
        await act();
      };
      /** The item ids in row A of a link. The list as opened has a link of an older format, with none. */
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
          CHANGE_LIST: step(true, () => tierList.drag.rankFirstUnrankedItem('A')),
          BROWSER_BACK: step(false, () => tierList.goBack()),
          BROWSER_FORWARD: step(false, () => tierList.goForward()),
          CHOOSE_TOP: step(true, () => tierList.rows.chooseLabelPositionWithKeyboard('Top')),
          CHOOSE_LEFT: step(true, () => tierList.rows.chooseLabelPositionWithKeyboard('Left')),
          HIDE_ITEM_LABELS: step(true, () => tierList.rows.setItemLabelsVisibleWithKeyboard(false)),
          SHOW_ITEM_LABELS: step(true, () => tierList.rows.setItemLabelsVisibleWithKeyboard(true)),
        },
        // Web-first checks, no read(): after Back or Forward the address changes before the list
        // on screen does, so one read could still see the version before.
        states: {
          '*': async (_page, snapshot) => {
            // Version 1 is the list as opened; each later version ranks one more item into row A.
            const {version, versions, labelPosition, itemLabels} = historyViewOf(snapshot);
            // Every row, by name, with its items by name (the item labels may be hidden): a
            // change moves only the item it ranks, and Back and Forward move nothing else.
            const rows: Readonly<Record<string, readonly string[]>> = {
              S: ['Reinhardt'], A: TRAY.slice(0, version - 1), B: [], C: [], F: [], Unranked: TRAY.slice(version - 1),
            };
            await expectTierNames(tierList, Object.keys(rows));
            for (const [row, names] of Object.entries(rows)) {
              await expect.poll(() => tierList.itemNamesIn(row), {message: `the items of row ${row}`}).toEqual(names);
            }
            await expect(tierList.itemsIn('S')).toHaveText([itemLabels ? 'Reinhardt' : '']);
            await expect.poll(() => tierList.rows.tierLabelIsAbove('S', 'Reinhardt')).toBe(labelPosition === 'top');
            // The address holds the version on screen. The label settings rewrite it in place.
            await expect.poll(() => rowAIn(page.url()), {message: `the address should hold version ${version}`})
              .toEqual(TRAY.slice(0, version - 1).map((name) => packageItemId('image-overwatch', name)));
            // Back and Forward return to exactly the address each version had; Forward on the
            // latest version leaves it as it is.
            if (wrote) addresses[version - 1] = page.url();
            else await expect(page, `the address of version ${version}`).toHaveURL(addresses[version - 1]);
            // One history entry per version: a change after Back drops the later ones.
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
        const coverage = await walkModel(historyModel, historySut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, historyModel, coverage, part);
      });
    }
  });

  /**
   * The leaving machine (tests/machines/leaving.ts): the visitor clicks the logo link to Home, with
   * or without a change right before. The test holds the server's answer for Home from before the
   * list opens (holdTripHome), and HOME_ANSWERS releases it. Each change moves the first Unranked
   * item up into row F with the keyboard.
   */
  test.describe('model: leaving', () => {
    const LEAVE_TRAY = ['Mauga', 'Winston'];
    const LEAVE_LIST = rankingState('image-overwatch', {'': LEAVE_TRAY});
    /** An image of a trusted site, dropped as a link from another page. */
    const DROPPED = 'https://i.imgur.com/red.png';

    /** The leaving machine's events and checks, run on this test's page (modelSut). */
    const leavingSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let trip: {release: () => Promise<void>} | null = null;
      /** The address of the list as opened (version 1), and the history entries then. */
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
          // The editor asks for Home as soon as the logo shows, so the trip is held first.
          trip = await tierList.holdTripHome();
          await tierList.openAfterBlankPage(TANKS, LEAVE_LIST);
          opened = page.url();
          entries = await tierList.historyLength();
        },
        events: {
          CHANGE_LIST: () => tierList.drag.moveFirstUnrankedItemUpWithKeyboard(),
          CLICK_HOME: () => clickHomeNow(tierList),
          DROP_IMAGE_LINK: () => tierList.linkImages.dropImageAddressNow(DROPPED),
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
            await expect(tierList.itemsIn('F')).toHaveText(view.version === 2 ? ['Mauga'] : []);
            await expect(tierList.itemsIn(tierList.unranked)).toHaveText(view.version === 2 ? LEAVE_TRAY.slice(1) : LEAVE_TRAY);
            if (view.version === 1) {
              expect(page.url(), 'the address should hold the list as opened').toBe(opened);
            } else {
              await expect(page).not.toHaveURL(opened);
            }
            await expect.poll(() => tierList.historyLength(), {message: 'one history entry per change, and one for Home after Back from it'})
              .toBe(entries + view.version - 1 + (view.homeAhead ? 1 : 0));
            if (view.busy) await expect(tierList.main).toHaveAttribute('aria-busy', 'true');
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      // While the trip home waits for its held answer, the page is busy on purpose.
      }, {machine: leavingModel.machine, busyIn: leavingBusy});
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
