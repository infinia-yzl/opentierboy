import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, expectTierList, expectTierNames, test} from '../support/test';
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
  mouseDragModel,
  mouseDragViewOf,
  type MouseDragEvent,
  type MouseDragSnapshot,
} from '../models/mouse-drag';

const TANKS = '/rank/overwatch/tank';

const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

const ALL = '/rank/overwatch/all';

const WRAPPED = ['Ana', 'Baptiste', 'Brigitte', 'Illari', 'Juno', 'Kiriko', 'Lifeweaver', 'Lucio', 'Mercy', 'Moira', 'Zenyatta', 'Ashe'];

test.describe('drag and drop', () => {
  test.describe('mouse', () => {
    test.describe('in the window size of the first report', () => {
      test.use({viewport: {width: 1200, height: 880}});

      test('renders the item in row S when the user sweeps it up from Unranked into the left part of row S', async ({tierList}) => {
        await tierList.goto(TANKS);

        await tierList.drag.dragItemToTierStartInOneSweep('D.Va', 'S');

        await expect(tierList.itemsIn('S')).toHaveText(['D.Va']);
        await expect(tierList.itemsIn('A')).toHaveCount(0);
      });
    });

    test('renders the same title and rows for a visitor of the share link when the user drags 2 items into rows', async ({tierList, openAsVisitor}) => {
      await tierList.goto(TANKS);
      await tierList.drag.dragItemToTier('Mauga', 'S');
      await tierList.drag.dragItemToTier('Winston', 'A');
      await expect(tierList.itemsIn('A')).toHaveText(['Winston']);

      const friend = await openAsVisitor(await tierList.shareLink());

      await expect(friend.title).toHaveText('OVERWATCH - Tank');
      await expect(friend.itemsIn('S')).toHaveText(['Mauga']);
      await expect(friend.itemsIn('A')).toHaveText(['Winston']);
      await expect(friend.itemsIn(friend.unranked)).toHaveCount(TANK_COUNT - 2);
    });

    test('renders the dragged item before the target item when the user drags it onto an item of the same row', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston', 'Sigma']}));

      await tierList.drag.dragItemOnto('Sigma', 'Mauga');

      await expect(tierList.itemsIn('S')).toHaveText(['Sigma', 'Mauga', 'Winston']);
    });
  });

  test.describe('keyboard', () => {
    test('renders the item first in its row when the user moves it with the Left arrow key twice', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston', 'Sigma']}));

      await tierList.drag.moveItemWithKeyboard('Sigma', ['ArrowLeft', 'ArrowLeft']);

      await expect(tierList.itemsIn('S')).toHaveText(['Sigma', 'Mauga', 'Winston']);
    });
  });

  test.describe('rows that wrap', () => {
    test.use({viewport: {width: 1280, height: 1400}});

    test.beforeEach(async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: WRAPPED, '': ['Mauga', 'Winston']}));
      await expect.poll(async () => (await tierList.itemLines('S')).length, {message: 'row S should wrap'}).toBeGreaterThan(1);
    });

    test('renders the item before the target on the second line when the user drags it there from another row', async ({tierList}) => {
      const [, secondLine] = await tierList.itemLines('S');
      const target = secondLine[1];

      await tierList.drag.dragItemNextTo('Mauga', target, 'before');

      const expected = [...WRAPPED];
      expected.splice(WRAPPED.indexOf(target), 0, 'Mauga');
      await expect(tierList.itemsIn('S')).toHaveText(expected);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Winston']);
    });

    test('renders the item last in the row when the user drops it after the last item of a wrapping row', async ({tierList}) => {
      await tierList.drag.dragItemNextTo('Winston', WRAPPED[WRAPPED.length - 1], 'after');

      await expect(tierList.itemsIn('S')).toHaveText([...WRAPPED, 'Winston']);
    });

    test('renders the item before the target on the second line when the user drags it from the first line of its row', async ({tierList}) => {
      const [, secondLine] = await tierList.itemLines('S');
      const target = secondLine[1];

      await tierList.drag.dragItemNextTo('Ana', target, 'before');

      const expected = WRAPPED.filter((name) => name !== 'Ana');
      expected.splice(expected.indexOf(target), 0, 'Ana');
      await expect(tierList.itemsIn('S')).toHaveText(expected);
    });

    test('renders the item first on the next line when the user presses the Right arrow key on the last item of a line', async ({tierList}) => {
      const [firstLine] = await tierList.itemLines('S');
      const last = firstLine[firstLine.length - 1];

      await tierList.drag.moveItemWithKeyboard(last, ['ArrowRight']);

      const expected = WRAPPED.filter((name) => name !== last);
      expected.splice(firstLine.length, 0, last);
      await expect(tierList.itemsIn('S')).toHaveText(expected);
      await expect.poll(async () => (await tierList.itemLines('S'))[1]?.[0]).toBe(last);
    });

    test('renders the item on the next line at the same x, and back, when the user presses the Down, then Up arrow key', async ({tierList}) => {
      const before = await tierList.item('Baptiste').boundingBox();

      await tierList.drag.moveItemWithKeyboard('Baptiste', ['ArrowDown']);

      await expect.poll(async () => (await tierList.itemLines('S'))[1], {message: 'Baptiste should be on the second line'}).toContain('Baptiste');
      await expect(tierList.itemsIn('S')).toHaveCount(WRAPPED.length);
      await expect(async () => {
        const after = (await tierList.item('Baptiste').boundingBox())!;
        expect(Math.abs(after.x - before!.x), 'Baptiste should keep its place across').toBeLessThan(after.width);
      }).toPass();

      await tierList.drag.moveItemWithKeyboard('Baptiste', ['ArrowUp']);

      await expect.poll(async () => (await tierList.itemLines('S'))[0]).toContain('Baptiste');
    });

    test('renders the item in row A when the user presses the Down arrow key on the last line of row S', async ({tierList}) => {
      const lines = await tierList.itemLines('S');
      const onLastLine = lines[lines.length - 1][0];

      await tierList.drag.moveItemWithKeyboard(onLastLine, ['ArrowDown']);

      await expect(tierList.itemsIn('A')).toHaveText([onLastLine]);
    });
  });

  test.describe('rows', () => {
    test('renders the row colours by position when the user drags row S by its grip onto row B', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga']}));
      const colours = await tierList.rowColours();

      await tierList.drag.dragRowOnto('S', 'B');

      await expectTierNames(tierList, ['A', 'B', 'S', 'C', 'F', 'Unranked']);
      expect(await tierList.rowColours()).toEqual(colours);
    });

    test('renders row S first again when the user goes Back after dragging row S by its grip onto row A', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));
      await tierList.drag.dragRowOnto('S', 'A');
      await expectTierNames(tierList, ['A', 'S', 'B', 'C', 'F', 'Unranked']);

      await tierList.goBack();

      await expectTierNames(tierList, ['S', 'A', 'B', 'C', 'F', 'Unranked']);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });

    test('renders the same rows for a visitor of the share link when the user drags row S by its grip onto row B', async ({tierList, openAsVisitor}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga'], B: ['Winston']}));

      await tierList.drag.dragRowOnto('S', 'B');

      const friend = await openAsVisitor(await tierList.shareLink());
      await expectTierList(friend, {tiers: [
        {name: 'A', items: []}, {name: 'B', items: ['Winston']}, {name: 'S', items: ['Mauga']},
        {name: 'C', items: []}, {name: 'F', items: []}, {name: 'Unranked', items: []},
      ]});
    });

    test('renders the stack name with the item count when the page opens with 2 items in row S', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Sigma']}));

      await expect(tierList.rowStack('S')).toHaveAccessibleName('Move the 2 items of row S');
      await expect(tierList.rowGrip('S')).toHaveAccessibleName('Move row S');
    });

    test('renders the grip, then the items, then the stack in Tab order when the user tabs through row S', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Sigma']}));

      expect(await tierList.tabOrderIn('S')).toEqual(['Move row S', 'Mauga', 'Sigma', 'Move the 2 items of row S']);
    });

    test('renders row S back at its place and the cancel announcement when the user presses Escape during a grip drag', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga']}));

      await tierList.drag.moveRowWithKeyboardThenCancel('S', ['ArrowDown']);

      await expect(tierList.drag.dragAnnouncer).toHaveText('Move cancelled. Row S is back at position 1 of 5.');
      await expectTierNames(tierList, ['S', 'A', 'B', 'C', 'F', 'Unranked']);
    });
  });

  test.describe('announcements', () => {
    test('renders announcements with the item name and row labels when the user moves an item with the keyboard', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston', 'Sigma']}));

      const heard = await tierList.drag.moveItemWithKeyboard('Sigma', ['ArrowLeft', 'ArrowUp']);

      expect(heard).toEqual([
        'Sigma moves to Unranked, position 1 of 2.',
        'Sigma moves to row F, position 1 of 1.',
        'Dropped Sigma in row F, position 1 of 1.',
      ]);
    });

    test('renders announcements with the item count and row labels, labels in place, when the user moves the stack of row S down', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));

      const heard = await tierList.drag.moveRowItemsWithKeyboard('S', ['ArrowDown']);

      expect(heard).toEqual([
        'The 1 item, over row A.',
        "Dropped the 1 item in row A. Row A's items are now in row S.",
      ]);
      await expect(tierList.tiers.first()).toHaveAccessibleName('S');
      await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
      await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
    });

    test('renders announcements with the row label and its position, and row S third, when the user moves row S down by its grip', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));

      const heard = await tierList.drag.moveRowWithKeyboard('S', ['ArrowDown', 'ArrowDown']);

      expect(heard).toEqual([
        'Row S, position 2 of 5, below row A.',
        'Row S, position 3 of 5, below row B.',
        'Dropped row S at position 3 of 5.',
      ]);
      await expectTierNames(tierList, ['A', 'B', 'S', 'C', 'F', 'Unranked']);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });
  });

  test.describe('cancelled moves', () => {
    test('renders the item at its start and writes no history entry when the user presses Escape during a mouse drag', async ({tierList, page}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Winston'], '': ['Sigma']}));
      const before = page.url();
      const entries = await tierList.historyLength();

      await tierList.drag.dragItemToTierThenCancel('Mauga', 'A');

      await expect(tierList.drag.dragAnnouncer).toHaveText('Move cancelled. Mauga is back in row S, position 1 of 2.');
      await expect.poll(() => tierList.itemNamesIn('S')).toEqual(['Mauga', 'Winston']);
      await expect.poll(() => tierList.itemNamesIn('A')).toEqual([]);
      expect(page.url()).toBe(before);
      expect(await tierList.historyLength()).toBe(entries);
    });

    test('renders the item in row A when the user drags it there after a cancelled mouse drag', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Winston'], '': ['Sigma']}));
      await tierList.drag.dragItemToTierThenCancel('Mauga', 'A');
      await expect(tierList.drag.dragAnnouncer).toContainText('Move cancelled.');

      await tierList.drag.dragItemToTier('Mauga', 'A');

      await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
    });
  });

  test.describe('touch', () => {
    test.skip(({browserName, isMobile}) => browserName !== 'chromium' || !isMobile, 'Touch events go through the Chrome DevTools Protocol, on a phone.');

    test('renders the item in row S when the user long-presses it and drags it to row S', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));

      await tierList.drag.touchDragItemToTier('Mauga', 'S');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Winston']);
    });

    test('renders row S after row A when the user long-presses the grip of row S and drags it onto row A', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));

      await tierList.drag.touchDragRowOnto('S', 'A');

      await expectTierNames(tierList, ['A', 'S', 'B', 'C', 'F', 'Unranked']);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    });

    test('renders the item menu with no drag and no text selection when the user long-presses an item', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));
      const announcement = await tierList.drag.dragAnnouncer.textContent();

      const menu = await tierList.drag.longPressItem('Mauga');

      await expect(tierList.drag.dragAnnouncer).toHaveText(announcement ?? '');
      await expect.poll(() => tierList.selectedText()).toBe('');
      await expect(menu).toBeVisible();
    });

    test('renders row S without the item when the user long-presses it and taps Delete in the item menu', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));

      await tierList.drag.longPressItem('Mauga');
      await tierList.menuItem('Delete').tap();

      await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
    });

    test('writes no new URL and renders the items in order when the user swipes up from an item', {tag: '@mobile'}, async ({tierList}) => {
      const many = ['Ana', 'Baptiste', 'Brigitte', 'Illari', 'Juno', 'Kiriko', 'Lifeweaver', 'Lucio', 'Mercy', 'Moira', 'Zenyatta'];
      await tierList.goto(ALL, rankingState('image-overwatch', {'': many}));
      const address = tierList.page.url();

      await tierList.drag.swipeUpFromItem('Mercy', 200);

      await expect.poll(() => tierList.itemNamesIn('Unranked')).toEqual(many);
      expect(tierList.page.url()).toBe(address);
    });
  });

  test.describe('long press', () => {
    test('renders user-select none and -webkit-touch-callout none on item Mauga and the grip and stack of S when the page opens', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga']}));

      for (const element of [tierList.item('Mauga'), tierList.rowGrip('S'), tierList.rowStack('S')]) {
        await expect.poll(() => tierList.textSelectionStyle(element)).toEqual({userSelect: 'none', callout: expect.stringMatching(/^(none)?$/)});
      }
    });
  });

  test.describe('native drags', () => {
    test.describe('with the drop animation', () => {
      test.use({reducedMotion: 'no-preference'});

      test('writes no native drag, no new item and 1 history entry when the user presses an item during the drop animation', async ({
        tierList,
      }) => {
        await tierList.goto(TANKS);
        const nativeDrags = await tierList.drag.countNativeDrags();
        const newEntries = await tierList.countNewHistoryEntries();

        await tierList.drag.dragItemToTierThenPressItem('Mauga', 'S', 'Winston');

        await expect(tierList.drag.dragAnnouncer).toHaveText(/^Dropped (Mauga in row S,|Winston\. It stays in Unranked,)/);
        expect(await nativeDrags()).toBe(0);
        expect(await newEntries()).toBe(1);
        await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
        await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT - 1);
      });
    });

    test('writes a cancelled dragstart event when a dragstart event starts on an item image', async ({tierList}) => {
      await tierList.goto(TANKS);

      expect(await tierList.drag.dragStartFromItemImageIsCancelled('Mauga')).toBe(true);
    });

    test('renders every tile image not draggable, in rows, up next and the queue, when the page opens in Zen with In order', async ({
      tierList, page,
    }) => {
      await serveImageSite(page, 'i.imgur.com');
      const tray = ['Winston', 'Sigma', 'Orisa'].map((name) => packageItemId('image-overwatch', name));
      await tierList.goto(TANKS, v3State({t: 'Images', tp: 3, r: [['S', [{u: 'https://i.imgur.com/red.png', c: 'Red square'}]], ['A', []], ['B', []], ['', tray]]}));
      await tierList.zen.setZenMode(true);
      await tierList.zen.chooseRankingOrder('In order');

      await expect.poll(() => tierList.itemImageHasLoaded('Red square')).toBe(true);
      await expect(tierList.allItemImages).toHaveCount(4);
      for (const image of await tierList.allItemImages.all()) {
        await expect(image).toHaveAttribute('draggable', 'false');
      }
    });
  });

  test.describe('model', () => {
    const ITEM_ID = packageItemId('image-overwatch', KEYBOARD_DRAG_ITEM);
    const LIST = v3State({r: [['tier-s', 'S', []], ['tier-a', 'A', []], ['uncategorized', '', [ITEM_ID]]]});

    const linkOrderOf = (link: string): string[] => {
      const {r: rows} = v3LinkJson(link) as {r: unknown[][]};
      return rows.map((entry) => (entry[entry.length - 2] as string) || 'Unranked');
    };

    const linkRowOf = (link: string): KeyboardDragRow | null => {
      const {r: rows} = v3LinkJson(link) as {r: unknown[][]};
      const row = rows.find((entry) => (entry[entry.length - 1] as unknown[]).includes(ITEM_ID));
      if (!row) return null;
      const label = row[row.length - 2] as string;
      return label === '' ? 'Unranked' : label as KeyboardDragRow;
    };

    const keyboardDragSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let entries = 0;
      let linkRow: KeyboardDragRow = 'Unranked';
      let linkOrder = 'S,A,Unranked';
      let address = '';
      return modelSut<KeyboardDragSnapshot, KeyboardDragEvent>(page, {
        reset: async () => {
          await tierList.goto(TANKS, LIST);
          await tierList.drag.focusItemReadyToDrag(KEYBOARD_DRAG_ITEM);
          entries = await tierList.historyLength();
          linkRow = 'Unranked';
          linkOrder = 'S,A,Unranked';
          address = page.url();
        },
        events: {
          PRESS_SPACE: () => tierList.pressKey('Space'),
          PRESS_ENTER: () => tierList.pressKey('Enter'),
          PRESS_UP: () => tierList.pressKey('ArrowUp'),
          PRESS_DOWN: () => tierList.pressKey('ArrowDown'),
          PRESS_ESCAPE: () => tierList.pressKey('Escape'),
          MOVE_ROW_S_DOWN: async () => {
            await tierList.drag.moveRowWithKeyboard('S', ['ArrowDown']);
            await tierList.drag.focusItemReadyToDrag(KEYBOARD_DRAG_ITEM);
          },
          MOVE_ROW_S_UP: async () => {
            await tierList.drag.moveRowWithKeyboard('S', ['ArrowUp']);
            await tierList.drag.focusItemReadyToDrag(KEYBOARD_DRAG_ITEM);
          },
        },
        states: {
          '*': async (_page, snapshot) => {
            const {shownIn, linkIn, carried, heard, order} = keyboardDragViewOf(snapshot);
            await expectTierNames(tierList, [...order]);
            for (const row of KEYBOARD_DRAG_ROWS) {
              await expect(tierList.itemsIn(row)).toHaveText(row === shownIn ? [KEYBOARD_DRAG_ITEM] : []);
            }
            await expect(tierList.drag.dragAnnouncer).toHaveText(heard);
            await expect.poll(() => linkRowOf(page.url()), {message: 'the link should hold the tile in its row'}).toBe(linkIn);
            await expect.poll(() => linkOrderOf(page.url()).join(','), {message: 'the link should hold the rows in order'}).toBe(order.join(','));
            if (linkIn !== linkRow || order.join(',') !== linkOrder) {
              entries += 1;
              linkRow = linkIn;
              linkOrder = order.join(',');
              address = page.url();
            } else {
              await expect(page, 'the address should stay as it was').toHaveURL(address);
            }
            await expect.poll(() => tierList.historyLength(), {message: 'only a drop that moves the tile adds a history entry'}).toBe(entries);
            await expect(tierList.item(KEYBOARD_DRAG_ITEM)).toBeFocused();
            if (!carried) {
              await tierList.drag.expectEveryItemDraggable();
            }
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
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
    const ITEM_IDS: Readonly<Record<string, string>> = {
      [MOUSE_DRAG_ITEM]: packageItemId('image-overwatch', MOUSE_DRAG_ITEM),
      [MOUSE_DRAG_OTHER_ITEM]: packageItemId('image-overwatch', MOUSE_DRAG_OTHER_ITEM),
    };
    const LIST = v3State({r: [
      ['tier-s', 'S', [ITEM_IDS[MOUSE_DRAG_OTHER_ITEM]]],
      ['tier-a', 'A', []],
      ['uncategorized', '', [ITEM_IDS[MOUSE_DRAG_ITEM]]],
    ]});

    const linkRowsOf = (link: string) => {
      const {r: rows} = v3LinkJson(link) as {r: unknown[][]};
      return rows.map((entry) => ({label: (entry[entry.length - 2] as string) || 'Unranked', items: entry[entry.length - 1]}));
    };

    const mouseDragSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let newEntries: () => Promise<number> = async () => 0;
      let entries = 0;
      let shown = '';
      let address = '';
      return modelSut<MouseDragSnapshot, MouseDragEvent>(page, {
        reset: async () => {
          await tierList.goto(TANKS, LIST);
          await tierList.drag.expectEveryItemDraggable();
          newEntries = await tierList.countNewHistoryEntries();
          entries = 0;
          shown = '';
          address = '';
        },
        events: {
          DRAG_MAUGA_TO_S: () => tierList.drag.dragItemToFreeSpaceOf(MOUSE_DRAG_ITEM, 'S'),
          DRAG_MAUGA_TO_A: () => tierList.drag.dragItemToFreeSpaceOf(MOUSE_DRAG_ITEM, 'A'),
          DRAG_MAUGA_TO_UNRANKED: () => tierList.drag.dragItemToFreeSpaceOf(MOUSE_DRAG_ITEM, 'Unranked'),
          DROP_MAUGA_BEFORE_WINSTON: () => tierList.drag.dragItemBeside(MOUSE_DRAG_ITEM, MOUSE_DRAG_OTHER_ITEM, 'before'),
          DROP_MAUGA_AFTER_WINSTON: () => tierList.drag.dragItemBeside(MOUSE_DRAG_ITEM, MOUSE_DRAG_OTHER_ITEM, 'after'),
          DROP_MAUGA_IN_PLACE: () => tierList.drag.dragItemAndDropInPlace(MOUSE_DRAG_ITEM),
          RELEASE_MAUGA_OUTSIDE_ROWS: () => tierList.drag.dragItemOutOfTheRows(MOUSE_DRAG_ITEM),
          DRAG_ITEMS_OF_S_ONTO_A: () => tierList.drag.dragRowItemsOnto('S', 'A'),
          DRAG_ITEMS_OF_A_ONTO_S: () => tierList.drag.dragRowItemsOnto('A', 'S'),
          DRAG_ROW_S_ONTO_A: () => tierList.drag.dragRowOnto('S', 'A'),
          DRAG_ROW_A_ONTO_S: () => tierList.drag.dragRowOnto('A', 'S'),
        },
        states: {
          '*': async (_page, snapshot) => {
            const view = mouseDragViewOf(snapshot);
            await expectTierList(tierList, {tiers: view.order.map((row) => ({name: row, items: [...view.items[row]]}))});
            for (const row of view.order.filter((name) => name !== 'Unranked')) {
              await expect(tierList.rowStack(row)).toHaveCount(view.items[row].length > 0 ? 1 : 0);
            }
            await expect.poll(() => linkRowsOf(page.url()), {message: 'the link should hold the rows as they show'})
              .toEqual(view.order.map((row) => ({label: row, items: view.items[row].map((name) => ITEM_IDS[name])})));
            const rows = JSON.stringify(view);
            if (shown !== '' && rows !== shown) entries += 1;
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
