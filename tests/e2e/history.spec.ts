import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, expectTierList, SHARED_LINKS, test} from '../support/test';
import {packageItemId, rankingState, templateItemCount, v3LinkJson, v3State} from '../support/links';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import type {HeldListWrites, TierListPage} from '../pages/tier-list-page';
import {historyModel, historyViewOf, MAX_VERSIONS, type HistoryEvent, type HistorySnapshot} from '../models/history';
import {linkWritesModel, linkWritesViewOf, MAX_LINK_VERSIONS, type LinkWritesEvent, type LinkWritesSnapshot} from '../models/link-writes';
import {chooseLabelPositionNow, clickHomeNow, dropImageAddressNow} from '../pages/tier-list-page';
import {leavingWritesBusy, leavingWritesModel, leavingWritesViewOf, type LeavingWritesEvent, type LeavingWritesSnapshot} from '../models/leaving-writes';
import {labelWritesModel, labelWritesViewOf, type LabelWritesEvent, type LabelWritesSnapshot} from '../models/label-writes';
import {serveImageSite} from '../support/image-sites';

const TANKS = '/rank/overwatch/tank';
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

/**
 * Product rule: the browser history is the undo feature.
 *
 * Every change to the list writes a new link into the address bar as a new history
 * entry, so the browser Back button steps back to the previous version of the list, one
 * change at a time. This is intended. Do not change the app to replace history entries.
 */
test.describe('history', () => {
  test.describe('Back', () => {
    test('renders the ranking from before Reset when the user goes Back after Reset', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], '': ['Sigma']}));
      await tierList.resetRankings();
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Sigma', 'Winston']);

      await tierList.goBack();

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Sigma']);
    });

    test('renders the list one change earlier on each Back step when the user goes Back after 2 drags', async ({tierList, page}) => {
      // Start from a shared link, as a list that someone keeps editing does.
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);

      await tierList.goBack();
      await expectTierList(tierList, {
        tiers: [
          {name: 'S', items: ['Mauga']},
          {name: 'A', items: []},
          {name: 'B', items: []},
          {name: 'C', items: []},
          {name: 'F', items: []},
          {name: 'Unranked', items: ['Winston', 'Sigma']},
        ],
      });

      await tierList.goBack();
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Winston', 'Sigma']);

      await tierList.goForward();
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });

    test('writes a new history entry when the user clicks Undo in a toast', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));
      const entries = await tierList.historyLength();
      // The pointer rests on the toast, so its 4 s timer waits for the Undo.
      await tierList.resetRankingsAndRestOnToast();

      const reset = page.url();
      await tierList.undoFromToast('Items Reset');
      await expect(page).not.toHaveURL(reset);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await tierList.settled();
      expect(await tierList.historyLength()).toBe(entries + 2);

      // Back steps to the reset list, then to the list as opened.
      await tierList.goBack();
      await expect(tierList.itemsIn('S')).toHaveCount(0);
      await tierList.goBack();
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });
  });

  /**
   * On a slow connection, each change still gets its own history entry (A44). The app pushes the
   * links one at a time: Next.js drops a navigation that is still loading when the next starts.
   */
  test.describe('slow connections', () => {
    test('writes 1 history entry per move when the user makes 3 quick keyboard moves on a slow server', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
      const entries = await tierList.historyLength();
      // The server answers once all 3 moves are made: each move waits for the one before.
      const hold = await tierList.holdListWrites();

      for (const name of ['Mauga', 'Winston', 'Sigma']) {
        await tierList.moveItemWithKeyboard(name, ['ArrowUp'], {waitForLink: false});
      }
      await expect(tierList.itemsIn('F')).toHaveCount(3);
      await hold.release();
      await tierList.settled();
      expect(await tierList.historyLength(), 'one history entry per move').toBe(entries + 3);

      for (const count of [2, 1, 0]) {
        await tierList.goBack();
        await expect(tierList.itemsIn('F')).toHaveCount(count);
      }
    });

    test('writes 1 history entry per rename when the user renames row S twice quickly on a slow server', async ({tierList, page}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      const entries = await tierList.historyLength();
      // The server answers once both renames are made.
      const hold = await tierList.holdListWrites();

      await tierList.renameTier('S', 'First', 'First', {waitForLink: false});
      await tierList.renameTier('First', 'Second', 'Second', {waitForLink: false});
      await hold.release();
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
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');
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
    test('writes no history entry when the user chooses the label position Top or Hide Labels', async ({tierList, page}) => {
      for (const state of [undefined, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston']})]) {
        await tierList.goto(TANKS, state);
        const entries = await tierList.historyLength();

        await tierList.chooseLabelPosition('Top');
        await tierList.setItemLabelsVisible(false);
        await tierList.settled();
        expect(await tierList.historyLength(), 'the settings replace the current entry').toBe(entries);
        const withSettings = page.url();
        await tierList.dragItemToTier('Winston', 'A');

        // Back after the one change to the list goes straight back to the page as opened, whose
        // link now holds the settings.
        await tierList.goBack();
        await expect(page).toHaveURL(withSettings);
        await expect(tierList.itemsIn('A')).toHaveCount(0);
        await tierList.openRowOptions();
        await expect(tierList.rowOption('Top')).toBeChecked();
        await expect(tierList.rowOption('Hide Labels')).toBeChecked();
        await tierList.closeMenus();
      }
    });

    test('renders the label position Top when the user goes Back and Forward after a list change', async ({tierList, page}) => {
      // The owner's example: Mauga to S, Winston to A, labels on Top, then Back.
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');
      await tierList.chooseLabelPosition('Top');

      await tierList.goBack();
      await expect(tierList.itemsIn('A')).toHaveCount(0);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await tierList.openRowOptions();
      await expect(tierList.rowOption('Top')).toBeChecked();
      await expect(tierList.rowOption('Show Labels')).toBeChecked();
      await tierList.closeMenus();
      await expect.poll(() => tierList.tierLabelIsAbove('S', 'Mauga')).toBe(true);

      // Forward shows Winston in A again, still with labels on Top.
      await tierList.goForward();
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
      await tierList.openRowOptions();
      await expect(tierList.rowOption('Top')).toBeChecked();
      await expect(tierList.rowOption('Show Labels')).toBeChecked();
      await tierList.closeMenus();
    });

    test('renders the label settings of the link when the user goes Back to the editor from another page', async ({tierList, site}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      await tierList.chooseLabelPosition('Right');
      await tierList.setItemLabelsVisible(false);

      await site.goto('/about');
      await tierList.goBack();
      await expect(tierList.itemsIn('S')).toHaveText(['']);
      await tierList.openRowOptions();
      await expect(tierList.rowOption('Right')).toBeChecked();
      await expect(tierList.rowOption('Hide Labels')).toBeChecked();
      await tierList.closeMenus();
    });

  });

  /**
   * Known bugs. Each test describes the correct behaviour and is marked `test.fail`, so the
   * suite stays green while the bug exists. See editor-items.spec.ts for the convention.
   */
  test.describe('Known bugs', () => {
    test('writes the change as its own history entry when the user goes Back right after it on a slow server', async ({tierList, site, page}) => {
      await site.goto('/about');
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));
      const opened = page.url();
      const hold = await tierList.holdListWrites();

      await tierList.moveItemWithKeyboard('Mauga', ['ArrowUp'], {waitForLink: false});
      await expect(tierList.itemsIn('F')).toHaveText(['Mauga']);
      // Back while the link of the move waits for the server, on purpose.
      await tierList.goBackNow();
      await hold.release();
      await tierList.settled();
      // Marked here, after the steps that must work: a failure above fails the test as usual.
      test.fail(true, 'router.push adds the history entry only after the server answers, so Back pressed before that leaves from the entry before the change, and the change is lost. The fix considered was native history.pushState followed by a metadata refresh (still exactly one entry per change); the owner chose to keep the current behaviour on 2026-10-25.');

      // Each check reads the settled page once: these are expected to fail until the bug is fixed.
      expect(page.url()).toBe(opened);
      expect(await tierList.itemNamesIn('F')).toEqual([]);
      await tierList.goForward();
      expect(await tierList.itemNamesIn('F')).toEqual(['Mauga']);
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
        },
        events: {
          CHANGE_LIST: () => tierList.rankFirstUnrankedItem('A'),
          BROWSER_BACK: () => tierList.goBack(),
          BROWSER_FORWARD: () => tierList.goForward(),
          CHOOSE_TOP: () => tierList.chooseLabelPositionWithKeyboard('Top'),
          CHOOSE_LEFT: () => tierList.chooseLabelPositionWithKeyboard('Left'),
          HIDE_ITEM_LABELS: () => tierList.setItemLabelsVisibleWithKeyboard(false),
          SHOW_ITEM_LABELS: () => tierList.setItemLabelsVisibleWithKeyboard(true),
        },
        // Web-first checks, no read(): after Back or Forward the address changes before the list
        // on screen does, so one read could still see the version before.
        states: {
          '*': async (_page, snapshot) => {
            // Version 1 is the list as opened; each later version ranks one more item into row A.
            const {version, versions, labelPosition, itemLabels} = historyViewOf(snapshot);
            await expect(tierList.itemsIn('A')).toHaveCount(version - 1);
            await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TRAY.length - (version - 1));
            await expect(tierList.itemsIn('S')).toHaveText([itemLabels ? 'Reinhardt' : '']);
            await expect.poll(() => tierList.tierLabelIsAbove('S', 'Reinhardt')).toBe(labelPosition === 'top');
            // The address holds the version on screen. The label settings rewrite it in place.
            await expect.poll(() => rowAIn(page.url()), {message: `the address should hold version ${version}`})
              .toEqual(TRAY.slice(0, version - 1).map((name) => packageItemId('image-overwatch', name)));
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
   * The link writes machine (tests/machines/link-writes.ts): the visitor keeps changing the list
   * while earlier links still wait for the server. The link write is an event of its own: from
   * the first change on, the test holds the server's answers to list writes (holdListWrites), and
   * SERVER_ANSWERS releases them, so the waiting links reach the address one after another. Back
   * and Forward step between the versions, and a change after Back drops the later ones. Back and
   * Forward are never pressed while a link waits: that loses the change (Known bugs above).
   */
  test.describe('model: link writes', () => {
    // Each change moves the next Unranked item up into row F, in front of the items there, so
    // version n has the first n - 1 tray items in row F, the latest first.
    const TRAY = ['Mauga', 'Winston', 'Sigma'];
    const LIST = rankingState('image-overwatch', {'': TRAY});
    const rowF = (version: number) => TRAY.slice(0, version - 1).reverse();

    /** The link writes machine's events and checks, run on this test's page (modelSut). */
    const linkWritesSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      /** The server's answers to the waiting list writes, held from the first change until SERVER_ANSWERS. */
      let held: HeldListWrites | null = null;
      /** The address of the list as opened (version 1), and the history entries then. */
      let opened = '';
      let entries = 0;
      const releaseHeld = async () => {
        const hold = held;
        held = null;
        await hold?.release();
      };
      /** The item ids in row F of a link. The list as opened has a link of an older format, with none. */
      const rankedIn = (link: string): unknown => {
        if (link === opened) return [];
        const {r: rows} = v3LinkJson(link) as {r: unknown[][]};
        return rows.find((row) => row.at(-2) === 'F')?.at(-1);
      };
      const sut = modelSut<LinkWritesSnapshot, LinkWritesEvent>(page, {
        reset: async () => {
          // A walk that ended while links waited lets them go first.
          await releaseHeld();
          await tierList.openAfterBlankPage(TANKS, LIST);
          opened = page.url();
          entries = await tierList.historyLength();
        },
        events: {
          CHANGE_LIST: async () => {
            held ??= await tierList.holdListWrites();
            await tierList.moveFirstUnrankedItemUpWithKeyboard();
            await tierList.untilFirstListWriteHeld(held);
          },
          // The waiting links then reach the address one after another. modelSut waits until the
          // page is no longer busy, that is until the last one has arrived.
          SERVER_ANSWERS: () => releaseHeld(),
          BROWSER_BACK: () => tierList.goBack(),
          BROWSER_FORWARD: () => tierList.goForward(),
        },
        // Web-first checks: after Back or Forward the address changes before the list on screen does.
        states: {
          '*': async (_page, snapshot) => {
            const {onScreen, inAddress, versions, waiting} = linkWritesViewOf(snapshot);
            // The list on screen shows each change at once, also while its link waits.
            await expect(tierList.itemsIn('F')).toHaveText(rowF(onScreen));
            await expect(tierList.itemsIn(tierList.unranked)).toHaveText(TRAY.slice(onScreen - 1));
            await expect.poll(() => rankedIn(page.url()), {message: `the address should hold version ${inAddress}`})
              .toEqual(rowF(inAddress).map((name) => packageItemId('image-overwatch', name)));
            await expect.poll(() => tierList.historyLength(), {message: 'one history entry per version that reached the address'})
              .toBe(entries + versions - 1);
            if (waiting > 0) await expect(tierList.main).toHaveAttribute('aria-busy', 'true');
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      // While links wait for the held server answers, the page is busy on purpose.
      }, {machine: linkWritesModel.machine, busyIn: (snapshot) => linkWritesViewOf(snapshot).waiting > 0});
      return {sut, releaseHeld};
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(linkWritesModel)) {
      test(`writes 1 history entry per change, in order, when the user changes the list while links wait for the server (${part.name})`, async ({tierList, page}, testInfo) => {
        expect(TRAY).toHaveLength(MAX_LINK_VERSIONS - 1);
        test.setTimeout(MODEL_PART_TIMEOUT);
        const {sut, releaseHeld} = linkWritesSut(tierList, page, testInfo);
        try {
          const coverage = await walkModel(linkWritesModel, sut, part);
          await attachCoverage(testInfo, linkWritesModel, coverage, part);
        } finally {
          // A walk that ends while links wait leaves no answer held.
          await releaseHeld();
        }
      });
    }
  });

  /**
   * The leaving writes machine (tests/machines/leaving-writes.ts): the visitor clicks the logo
   * link to Home while list links are on their way. The test holds the server's answers to the
   * trip home from before the list opens (holdTripHome) and to the list writes (holdListWrites),
   * and HOME_ANSWERS and SERVER_ANSWERS release them. Each change moves the first Unranked item up
   * into row F with the keyboard.
   */
  test.describe('model: leaving', () => {
    const LEAVE_TRAY = ['Mauga', 'Winston'];
    const LEAVE_LIST = rankingState('image-overwatch', {'': LEAVE_TRAY});
    /** An image of a trusted site, dropped as a link from another page: its item is named after the file. */
    const DROPPED = {address: 'https://i.imgur.com/red.png', name: 'red'};

    /** The leaving writes machine's events and checks, run on this test's page (modelSut). */
    const leavingSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let writes: HeldListWrites | null = null;
      let trip: {release: () => Promise<void>} | null = null;
      /** The address of the list as opened (version 1), and the history entries then. */
      let opened = '';
      let entries = 0;
      const releaseWrites = async () => {
        const hold = writes;
        writes = null;
        await hold?.release();
      };
      const releaseTrip = async () => {
        const hold = trip;
        trip = null;
        await hold?.release();
      };
      const releaseAll = async () => {
        await releaseWrites();
        await releaseTrip();
      };
      const sut = modelSut<LeavingWritesSnapshot, LeavingWritesEvent>(page, {
        reset: async () => {
          await releaseAll();
          // The editor asks for Home as soon as the logo shows, so the trip is held first.
          trip = await tierList.holdTripHome();
          await tierList.openAfterBlankPage(TANKS, LEAVE_LIST);
          opened = page.url();
          entries = await tierList.historyLength();
          writes = await tierList.holdListWrites();
        },
        events: {
          CHANGE_LIST: async () => {
            await tierList.moveFirstUnrankedItemUpWithKeyboard();
            await tierList.untilFirstListWriteHeld(writes!);
          },
          CLICK_HOME: () => clickHomeNow(tierList),
          DROP_IMAGE_LINK: () => dropImageAddressNow(tierList, DROPPED.address, DROPPED.name),
          SERVER_ANSWERS: () => releaseWrites(),
          HOME_ANSWERS: () => releaseTrip(),
        },
        states: {
          '*': async (_page, snapshot) => {
            const view = leavingWritesViewOf(snapshot);
            if (view.page === 'home') {
              await expect(page, 'the visitor should be on Home').toHaveURL(/^[^?]*\/$/);
              await expect(tierList.tiers).toHaveCount(0);
              return;
            }
            await expect(page).toHaveURL(new RegExp(`${TANKS}\\?`));
            await expect(tierList.itemsIn('F')).toHaveText(view.onScreen === 2 ? ['Mauga'] : []);
            const tray = view.onScreen === 2 ? LEAVE_TRAY.slice(1) : LEAVE_TRAY;
            await expect(tierList.itemsIn(tierList.unranked)).toHaveText(view.dropped ? [...tray, DROPPED.name] : tray);
            if (view.inAddress === 1) {
              expect(page.url(), 'the address should hold the list as opened').toBe(opened);
            } else {
              await expect(page).not.toHaveURL(opened);
              await expect.poll(() => tierList.historyLength(), {message: 'one history entry for the change'}).toBe(entries + 1);
            }
            expect(writes?.isHolding() ?? false, 'a list write should wait for the server').toBe(view.linkHeld);
            if (view.busy) await expect(tierList.main).toHaveAttribute('aria-busy', 'true');
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      // While a list link or the trip home waits for a held answer, the page is busy on purpose.
      }, {machine: leavingWritesModel.machine, busyIn: leavingWritesBusy});
      return {sut, releaseAll};
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(leavingWritesModel)) {
      test(`renders Home and no pull back to the editor when the user clicks the link to Home while links wait (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        await serveImageSite(page, 'i.imgur.com');
        const {sut, releaseAll} = leavingSut(tierList, page, testInfo);
        try {
          const coverage = await walkModel(leavingWritesModel, sut, part);
          await attachCoverage(testInfo, leavingWritesModel, coverage, part);
        } finally {
          await releaseAll();
        }
      });
    }
  });

  /**
   * The label writes machine (tests/machines/label-writes.ts): Label position › Top, which
   * replaces the current history entry (A3), beside a change to the list, while the server holds
   * its answers to the list writes (holdListWrites) until SERVER_ANSWERS. The change moves the
   * first Unranked item up into row F with the keyboard; Reinhardt in row S shows where the labels sit.
   */
  test.describe('model: label writes', () => {
    const LABEL_LIST = rankingState('image-overwatch', {S: ['Reinhardt'], '': ['Mauga', 'Winston']});

    /** The label writes machine's events and checks, run on this test's page (modelSut). */
    const labelWritesSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let held: HeldListWrites | null = null;
      let opened = '';
      let entries = 0;
      const releaseHeld = async () => {
        const hold = held;
        held = null;
        await hold?.release();
      };
      /** The link in the address: its label position and the item ids of row F. */
      const linkParts = (link: string) => {
        const {lp, r: rows} = v3LinkJson(link) as {lp?: string; r: unknown[][]};
        return {top: lp === 'top', rowF: rows.find((row) => row.at(-2) === 'F')?.at(-1)};
      };
      const sut = modelSut<LabelWritesSnapshot, LabelWritesEvent>(page, {
        reset: async () => {
          await releaseHeld();
          await tierList.openAfterBlankPage(TANKS, LABEL_LIST);
          opened = page.url();
          entries = await tierList.historyLength();
        },
        events: {
          CHANGE_LIST: async () => {
            held ??= await tierList.holdListWrites();
            await tierList.moveFirstUnrankedItemUpWithKeyboard();
            await tierList.untilFirstListWriteHeld(held);
          },
          CHOOSE_TOP: async () => {
            held ??= await tierList.holdListWrites();
            await chooseLabelPositionNow(tierList, 'Top');
            await tierList.untilFirstListWriteHeld(held);
          },
          // The waiting links then reach the address one after another; modelSut waits until the
          // page is no longer busy, that is until the last one has arrived.
          SERVER_ANSWERS: () => releaseHeld(),
          BROWSER_BACK: () => tierList.goBack(),
        },
        // Web-first checks: after Back the address changes before the list on screen does.
        states: {
          '*': async (_page, snapshot) => {
            const {onScreen, top, address, newEntries, waiting} = labelWritesViewOf(snapshot);
            await expect(tierList.itemsIn('F')).toHaveText(onScreen === 2 ? ['Mauga'] : []);
            await expect.poll(() => tierList.tierLabelIsAbove('S', 'Reinhardt'), {message: 'the labels should sit on Top or on the left'}).toBe(top);
            if (address === 'opened') {
              await expect.poll(() => page.url(), {message: 'the address should hold the list as opened'}).toBe(opened);
            } else {
              const mauga = packageItemId('image-overwatch', 'Mauga');
              await expect.poll(() => (page.url() === opened ? null : linkParts(page.url())), {message: `the address should hold version ${address.version}`})
                .toEqual({top: address.top, rowF: address.version === 2 ? [mauga] : []});
            }
            await expect.poll(() => tierList.historyLength(), {message: 'one history entry per change, none per label setting'}).toBe(entries + newEntries);
            if (waiting) await expect(tierList.main).toHaveAttribute('aria-busy', 'true');
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      // While links wait for the held server answers, the page is busy on purpose.
      }, {machine: labelWritesModel.machine, busyIn: (snapshot) => labelWritesViewOf(snapshot).waiting});
      return {sut, releaseHeld};
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(labelWritesModel)) {
      test(`writes 1 history entry per change and none per label setting when the user moves the labels while links wait (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const {sut, releaseHeld} = labelWritesSut(tierList, page, testInfo);
        try {
          const coverage = await walkModel(labelWritesModel, sut, part);
          await attachCoverage(testInfo, labelWritesModel, coverage, part);
        } finally {
          await releaseHeld();
        }
      });
    }
  });
});
