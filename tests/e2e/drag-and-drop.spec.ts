/** Moving items and rows: mouse drags, the keyboard, touch, and what screen readers hear. */
import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, expectTierList, test} from '../support/test';
import {packageItemId, rankingState, templateItemCount, v3LinkJson, v3State} from '../support/links';
import {serveImageSite} from '../support/image-sites';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import type {TierListPage} from '../pages/tier-list-page';
import {
  KEYBOARD_DRAG_ITEM,
  KEYBOARD_DRAG_ROWS,
  keyboardDragModel,
  keyboardDragViewOf,
  type KeyboardDragEvent,
  type KeyboardDragRow,
  type KeyboardDragSnapshot,
} from '../models/keyboard-drag';
import {
  MOUSE_DRAG_ITEM,
  MOUSE_DRAG_OTHER_ITEM,
  MOUSE_DRAG_ROWS,
  mouseDragModel,
  mouseDragViewOf,
  type MouseDragEvent,
  type MouseDragSnapshot,
} from '../models/mouse-drag';

const TANKS = '/rank/overwatch/tank';

// Active sets grow with new versions, so counts come from imageset.config.json.
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

const ALL = '/rank/overwatch/all';

// Twelve tiles do not fit on one line of a row at the default window size, so row S wraps (#142).
const WRAPPED = ['Ana', 'Baptiste', 'Brigitte', 'Illari', 'Juno', 'Kiriko', 'Lifeweaver', 'Lucio', 'Mercy', 'Moira', 'Zenyatta', 'Ashe'];

test.describe('drag and drop', () => {
  test.describe('mouse', () => {
    test.describe('in the window size of the first report', () => {
      // At this size the page scrolls a few pixels during the drag, as when the bug was seen
      // (2026-11-07): the item landed in row A.
      test.use({viewport: {width: 1200, height: 880}});

      test('renders the item in row S when the user sweeps it up from Unranked into the left part of row S', async ({tierList}) => {
        await tierList.goto(TANKS);

        await tierList.dragItemToTierStartInOneSweep('D.Va', 'S');

        await expect(tierList.itemsIn('S')).toHaveText(['D.Va']);
        await expect(tierList.itemsIn('A')).toHaveCount(0);
      });
    });

    test('renders the same title and rows for a visitor of the share link when the user drags 2 items into rows', async ({tierList, openAsVisitor}) => {
      await tierList.goto(TANKS);
      await tierList.dragItemToTier('Mauga', 'S');
      await tierList.dragItemToTier('Winston', 'A');
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);

      const friend = await openAsVisitor(await tierList.shareLink());

      await expect(friend.title).toHaveText('OVERWATCH - Tank');
      await expect(friend.itemsIn('S')).toHaveText(['Mauga']);
      await expect(friend.itemsIn('A')).toHaveText(['Winston']);
      await expect(friend.itemsIn(friend.unranked)).toHaveCount(TANK_COUNT - 2);
    });

    test('renders the dragged item before the target item when the user drags it onto an item of the same row', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston', 'Sigma']}));

      await tierList.dragItemOnto('Sigma', 'Mauga');

      await expect(tierList.itemsIn('S')).toHaveText(['Sigma', 'Mauga', 'Winston']);
    });
  });

  test.describe('keyboard', () => {
    test('renders the item first in its row when the user moves it with the Left arrow key twice', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston', 'Sigma']}));

      await tierList.moveItemWithKeyboard('Sigma', ['ArrowLeft', 'ArrowLeft']);

      await expect(tierList.itemsIn('S')).toHaveText(['Sigma', 'Mauga', 'Winston']);
    });
  });

  test.describe('rows that wrap', () => {
    test.beforeEach(async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: WRAPPED, '': ['Mauga', 'Winston']}));
      await expect.poll(async () => (await tierList.itemLines('S')).length, {message: 'row S should wrap'}).toBeGreaterThan(1);
    });

    test('renders the item before the target on the second line when the user drags it there from another row', async ({tierList}) => {
      const [, secondLine] = await tierList.itemLines('S');
      const target = secondLine[1];

      await tierList.dragItemNextTo('Mauga', target, 'before');

      const expected = [...WRAPPED];
      expected.splice(WRAPPED.indexOf(target), 0, 'Mauga');
      await expect(tierList.itemsIn('S')).toHaveText(expected);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Winston']);
    });

    test('renders the item last in the row when the user drops it after the last item of a wrapping row', async ({tierList}) => {
      await tierList.dragItemNextTo('Winston', WRAPPED[WRAPPED.length - 1], 'after');

      await expect(tierList.itemsIn('S')).toHaveText([...WRAPPED, 'Winston']);
    });

    test('renders the item before the target on the second line when the user drags it from the first line of its row', async ({tierList}) => {
      const [, secondLine] = await tierList.itemLines('S');
      const target = secondLine[1];

      await tierList.dragItemNextTo('Ana', target, 'before');

      const expected = WRAPPED.filter((name) => name !== 'Ana');
      expected.splice(expected.indexOf(target), 0, 'Ana');
      await expect(tierList.itemsIn('S')).toHaveText(expected);
    });

    test('renders the item first on the next line when the user presses the Right arrow key on the last item of a line', async ({tierList}) => {
      const [firstLine] = await tierList.itemLines('S');
      const last = firstLine[firstLine.length - 1];

      await tierList.moveItemWithKeyboard(last, ['ArrowRight']);

      const expected = WRAPPED.filter((name) => name !== last);
      expected.splice(firstLine.length, 0, last);
      await expect(tierList.itemsIn('S')).toHaveText(expected);
      await expect.poll(async () => (await tierList.itemLines('S'))[1]?.[0]).toBe(last);
    });

    test('renders the item on the next line at the same x, and back, when the user presses the Down, then Up arrow key', async ({tierList}) => {
      const before = await tierList.item('Baptiste').boundingBox();

      await tierList.moveItemWithKeyboard('Baptiste', ['ArrowDown']);

      await expect.poll(async () => (await tierList.itemLines('S'))[1], {message: 'Baptiste should be on the second line'}).toContain('Baptiste');
      await expect(tierList.itemsIn('S')).toHaveCount(WRAPPED.length);
      await expect(async () => {
        const after = (await tierList.item('Baptiste').boundingBox())!;
        expect(Math.abs(after.x - before!.x), 'Baptiste should keep its place across').toBeLessThan(after.width);
      }).toPass();

      await tierList.moveItemWithKeyboard('Baptiste', ['ArrowUp']);

      await expect.poll(async () => (await tierList.itemLines('S'))[0]).toContain('Baptiste');
    });

    test('renders the item in row A when the user presses the Down arrow key on the last line of row S', async ({tierList}) => {
      const lines = await tierList.itemLines('S');
      const onLastLine = lines[lines.length - 1][0];

      await tierList.moveItemWithKeyboard(onLastLine, ['ArrowDown']);

      await expect(tierList.itemsIn('A')).toHaveText([onLastLine]);
    });
  });

  test.describe('announcements', () => {
    test('renders announcements with the item name and row labels when the user moves an item with the keyboard', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston', 'Sigma']}));

      const heard = await tierList.moveItemWithKeyboardAndListen('Sigma', ['ArrowLeft', 'ArrowUp']);

      expect(heard).toEqual([
        'Sigma moves to Unranked, position 1 of 2.',
        'Sigma moves to tier F, position 1 of 1.',
        'Dropped Sigma in tier F, position 1 of 1.',
      ]);
    });

    test('renders the drop announcement and the labels S, A in order when the user moves row S down with the keyboard', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));

      await tierList.moveTierWithKeyboard('S', ['ArrowDown']);

      await expect(tierList.dragAnnouncer).toHaveText('Dropped. The items of tier S are now in tier A.');
      await expect(tierList.tiers.first()).toHaveAccessibleName('S');
      await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
      await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
    });
  });

  test.describe('cancelled moves', () => {
    test('renders the item at its start and writes no history entry when the user presses Escape during a mouse drag', async ({tierList, page}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Winston'], '': ['Sigma']}));
      await tierList.settled();
      const before = page.url();
      const entries = await tierList.historyLength();

      await tierList.dragItemToTierThenCancel('Mauga', 'A');

      await expect(tierList.dragAnnouncer).toHaveText('Move cancelled. Mauga is back in tier S, position 1 of 2.');
      await tierList.settled();
      expect(await tierList.itemNamesIn('S')).toEqual(['Mauga', 'Winston']);
      expect(await tierList.itemNamesIn('A')).toEqual([]);
      expect(page.url()).toBe(before);
      expect(await tierList.historyLength()).toBe(entries);
    });

    test('renders the item in row A when the user drags it there after a cancelled mouse drag', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Winston'], '': ['Sigma']}));
      await tierList.settled();
      await tierList.dragItemToTierThenCancel('Mauga', 'A');
      await expect(tierList.dragAnnouncer).toContainText('Move cancelled.');

      await tierList.dragItemToTier('Mauga', 'A');

      await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
    });
  });

  test.describe('touch', () => {
    test.skip(({browserName, isMobile}) => browserName !== 'chromium' || !isMobile, 'Touch events go through the Chrome DevTools Protocol, on a phone.');

    test('renders the item in row S when the user long-presses it and drags it to row S', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));

      await tierList.touchDragItemToTier('Mauga', 'S');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Winston']);
    });

    test('renders the item menu with no drag and no text selection when the user long-presses an item', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));
      const announcement = await tierList.dragAnnouncer.textContent();

      const menu = await tierList.longPressItem('Mauga');

      // No drag started, and no text is selected.
      await expect(tierList.dragAnnouncer).toHaveText(announcement ?? '');
      await expect.poll(() => tierList.selectedText()).toBe('');
      await expect(menu).toBeVisible();
    });

    test('renders row S without the item when the user long-presses it and taps Delete in the item menu', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));

      await tierList.longPressItem('Mauga');
      await tierList.menuItem('Delete').tap();

      await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
    });

    test('writes no new URL and renders the items in order when the user swipes up from an item', {tag: '@mobile'}, async ({tierList}) => {
      const many = ['Ana', 'Baptiste', 'Brigitte', 'Illari', 'Juno', 'Kiriko', 'Lifeweaver', 'Lucio', 'Mercy', 'Moira', 'Zenyatta'];
      await tierList.goto(ALL, rankingState('image-overwatch', {'': many}));
      const address = tierList.page.url();

      await tierList.swipeUpFromItem('Mercy', 200);

      await tierList.settled();
      expect(tierList.page.url()).toBe(address);
      expect(await tierList.itemNamesIn('Unranked')).toEqual(many);
    });
  });

  test.describe('long press', () => {
    test('renders user-select none and -webkit-touch-callout none on item Mauga and row handle S when the page opens', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga']}));

      for (const element of [tierList.item('Mauga'), tierList.rowHandle('S')]) {
        // Only Safari knows the touch callout; other browsers return nothing for it.
        await expect.poll(() => tierList.textSelectionStyle(element)).toEqual({userSelect: 'none', callout: expect.stringMatching(/^(none)?$/)});
      }
    });
  });

  // A tile's picture never starts the browser's own drag (components/ItemTile.tsx): items move only
  // through the editor's drag and drop.
  test.describe('native drags', () => {
    test.describe('with the drop animation', () => {
      // This test is about a press during the drop animation, so the animation stays on.
      test.use({reducedMotion: 'no-preference'});

      test('writes no native drag, no new item and 1 history entry when the user presses an item during the drop animation', async ({
        tierList,
      }) => {
        await tierList.goto(TANKS);
        const nativeDrags = await tierList.countNativeDrags();
        const newEntries = await tierList.countNewHistoryEntries();

        await tierList.dragItemToTierThenPressItem('Mauga', 'S', 'Winston');

        await tierList.settled();
        expect(await nativeDrags()).toBe(0);
        await expect(tierList.dragAnnouncer).toHaveText(/^Dropped (Mauga in tier S,|Winston\. It stays in Unranked,)/);
        expect(await newEntries()).toBe(1);
        await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
        await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT - 1);
      });
    });

    test('writes a cancelled dragstart event when a dragstart event starts on an item image', async ({tierList}) => {
      await tierList.goto(TANKS);

      expect(await tierList.dragStartFromItemImageIsCancelled('Mauga')).toBe(true);
    });

    test('renders every tile image not draggable, in rows, up next and the queue, when the page opens in Zen with In order', async ({
      tierList, page,
    }) => {
      await serveImageSite(page, 'i.imgur.com');
      const tray = ['Winston', 'Sigma', 'Orisa'].map((name) => packageItemId('image-overwatch', name));
      await tierList.goto(TANKS, v3State({t: 'Images', tp: 3, r: [['S', [{u: 'https://i.imgur.com/red.png', c: 'Red square'}]], ['A', []], ['B', []], ['', tray]]}));
      await tierList.setZenMode(true);
      await tierList.chooseRankingOrder('In order');

      await expect.poll(() => tierList.itemImageHasLoaded('Red square')).toBe(true);
      await expect(tierList.allItemImages).toHaveCount(4);
      for (const image of await tierList.allItemImages.all()) {
        await expect(image).toHaveAttribute('draggable', 'false');
      }
    });
  });

  test.describe('model', () => {
    // One tile in a list of two rows and the tray, so every place the tile can take is a state.
    const ITEM_ID = packageItemId('image-overwatch', KEYBOARD_DRAG_ITEM);
    const LIST = v3State({r: [['tier-s', 'S', []], ['tier-a', 'A', []], ['uncategorized', '', [ITEM_ID]]]});

    /** The row that holds the tile in a v3 link: rows are [id, label, items] or [label, items]. */
    const linkRowOf = (link: string): KeyboardDragRow | null => {
      const {r: rows} = v3LinkJson(link) as {r: unknown[][]};
      const row = rows.find((entry) => (entry[entry.length - 1] as unknown[]).includes(ITEM_ID));
      if (!row) return null;
      const label = row[row.length - 2] as string;
      return label === '' ? 'Unranked' : label as KeyboardDragRow;
    };

    /** The keyboard drag machine's events and checks, run on this test's page (modelSut). */
    const keyboardDragSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      // Each change of the list in the link adds one history entry; a cancel and a drop in place add none.
      let entries = 0;
      let linkRow: KeyboardDragRow = 'Unranked';
      /** The address the last drop that moved the tile wrote, or the link as opened. */
      let address = '';
      return modelSut<KeyboardDragSnapshot, KeyboardDragEvent>(page, {
        reset: async () => {
          await tierList.goto(TANKS, LIST);
          // A keyboard user tabs to the tile first.
          await tierList.focusItemReadyToDrag(KEYBOARD_DRAG_ITEM);
          entries = await tierList.historyLength();
          linkRow = 'Unranked';
          address = page.url();
        },
        events: {
          PRESS_SPACE: () => tierList.pressKey('Space'),
          PRESS_ENTER: () => tierList.pressKey('Enter'),
          PRESS_UP: () => tierList.pressKey('ArrowUp'),
          PRESS_DOWN: () => tierList.pressKey('ArrowDown'),
          PRESS_ESCAPE: () => tierList.pressKey('Escape'),
        },
        // Web-first checks: the preview draws at once, but a move is read out 500 ms later.
        states: {
          '*': async (_page, snapshot) => {
            const {shownIn, linkIn, carried, heard} = keyboardDragViewOf(snapshot);
            for (const row of KEYBOARD_DRAG_ROWS) {
              await expect(tierList.itemsIn(row)).toHaveText(row === shownIn ? [KEYBOARD_DRAG_ITEM] : []);
            }
            await expect(tierList.dragAnnouncer).toHaveText(heard);
            await expect.poll(() => linkRowOf(page.url()), {message: 'the link should hold the tile in its row'}).toBe(linkIn);
            if (linkIn !== linkRow) {
              entries += 1;
              linkRow = linkIn;
              address = page.url();
            } else {
              // A pick-up, a move before the drop, a drop in place and a cancel leave the address exactly as it was.
              await expect(page, 'the address should stay as it was').toHaveURL(address);
            }
            await expect.poll(() => tierList.historyLength(), {message: 'only a drop that moves the tile adds a history entry'}).toBe(entries);
            // Focus stays on the tile while it moves between rows, and after a drop or a cancel.
            await expect(tierList.item(KEYBOARD_DRAG_ITEM)).toBeFocused();
            // The drag holds the page busy until the drop (busyIn below).
            if (carried) await expect(tierList.main, 'the page should be busy while the tile is carried').toHaveAttribute('aria-busy', 'true');
            if (!carried) {
              // At rest, it takes the next drag.
              await tierList.expectEveryItemDraggable();
            }
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      // While the tile is carried, the drag holds the page busy until the drop.
      }, {machine: keyboardDragModel.machine, busyIn: (snapshot) => keyboardDragViewOf(snapshot).carried});
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(keyboardDragModel)) {
      test(`renders each state of the keyboard drag machine when the user walks every transition (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(keyboardDragModel, keyboardDragSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, keyboardDragModel, coverage, part);
      });
    }
  });

  test.describe('model', () => {
    // Two tiles in a list of two rows and the tray, so every arrangement the drags make is a state.
    const ITEM_IDS: Readonly<Record<string, string>> = {
      [MOUSE_DRAG_ITEM]: packageItemId('image-overwatch', MOUSE_DRAG_ITEM),
      [MOUSE_DRAG_OTHER_ITEM]: packageItemId('image-overwatch', MOUSE_DRAG_OTHER_ITEM),
    };
    const LIST = v3State({r: [
      ['tier-s', 'S', [ITEM_IDS[MOUSE_DRAG_OTHER_ITEM]]],
      ['tier-a', 'A', []],
      ['uncategorized', '', [ITEM_IDS[MOUSE_DRAG_ITEM]]],
    ]});

    /** The rows of a v3 link, top to bottom: each label ('Unranked' for the tray) and its item ids. Rows are [id, label, items] or [label, items]. */
    const linkRowsOf = (link: string) => {
      const {r: rows} = v3LinkJson(link) as {r: unknown[][]};
      return rows.map((entry) => ({label: (entry[entry.length - 2] as string) || 'Unranked', items: entry[entry.length - 1]}));
    };

    /** The mouse drag machine's events and checks, run on this test's page (modelSut). */
    const mouseDragSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      // Each change of the list adds one history entry (one pushState); a drop that changes nothing adds none.
      let newEntries: () => Promise<number> = async () => 0;
      let entries = 0;
      let shown = '';
      /** The address after the last check. */
      let address = '';
      return modelSut<MouseDragSnapshot, MouseDragEvent>(page, {
        reset: async () => {
          await tierList.goto(TANKS, LIST);
          await tierList.expectEveryItemDraggable();
          // A long walk changes the list more often than history.length can count (50 entries).
          newEntries = await tierList.countNewHistoryEntries();
          entries = 0;
          shown = '';
          address = '';
        },
        events: {
          DRAG_MAUGA_TO_S: () => tierList.dragItemToFreeSpaceOf(MOUSE_DRAG_ITEM, 'S'),
          DRAG_MAUGA_TO_A: () => tierList.dragItemToFreeSpaceOf(MOUSE_DRAG_ITEM, 'A'),
          DRAG_MAUGA_TO_UNRANKED: () => tierList.dragItemToFreeSpaceOf(MOUSE_DRAG_ITEM, 'Unranked'),
          DROP_MAUGA_BEFORE_WINSTON: () => tierList.dragItemBeside(MOUSE_DRAG_ITEM, MOUSE_DRAG_OTHER_ITEM, 'before'),
          DROP_MAUGA_AFTER_WINSTON: () => tierList.dragItemBeside(MOUSE_DRAG_ITEM, MOUSE_DRAG_OTHER_ITEM, 'after'),
          DROP_MAUGA_IN_PLACE: () => tierList.dragItemAndDropInPlace(MOUSE_DRAG_ITEM),
          RELEASE_MAUGA_OUTSIDE_ROWS: () => tierList.dragItemOutOfTheRows(MOUSE_DRAG_ITEM),
          DRAG_ROW_S_ONTO_A: () => tierList.dragTierOnto('S', 'A'),
          DRAG_ROW_A_ONTO_S: () => tierList.dragTierOnto('A', 'S'),
        },
        states: {
          '*': async (_page, snapshot) => {
            const view = mouseDragViewOf(snapshot);
            // The labels stay S, A, Unranked from top to bottom; only the tiles move.
            await expectTierList(tierList, {tiers: MOUSE_DRAG_ROWS.map((row) => ({name: row, items: [...view[row]]}))});
            await expect.poll(() => linkRowsOf(page.url()), {message: 'the link should hold the rows as they show'})
              .toEqual(MOUSE_DRAG_ROWS.map((row) => ({label: row, items: view[row].map((name) => ITEM_IDS[name])})));
            const rows = JSON.stringify(view);
            if (shown !== '' && rows !== shown) entries += 1;
            // A drop that changes nothing leaves the address exactly as it was.
            if (rows === shown) await expect(page, 'the address should stay as it was').toHaveURL(address);
            shown = rows;
            address = page.url();
            await expect.poll(newEntries, {message: 'only a drop that changes the list adds a history entry'}).toBe(entries);
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(mouseDragModel)) {
      test(`renders each state of the mouse drag machine when the user walks every transition (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(mouseDragModel, mouseDragSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, mouseDragModel, coverage, part);
      });
    }
  });
});
