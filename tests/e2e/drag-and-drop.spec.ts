/** Moving items and rows: mouse drags, the keyboard, touch, and what screen readers hear. */
import {expect, expectTierList, test} from '../support/test';
import {rankingState, templateItemCount} from '../support/links';

const TANKS = '/rank/overwatch/tank';

// Official sets grow with new versions, so counts come from imageset.config.json.
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

const ALL = '/rank/overwatch/all';

// Twelve tiles do not fit on one line of a row at the default window size, so row S wraps (#142).
const WRAPPED = ['Ana', 'Baptiste', 'Brigitte', 'Illari', 'Juno', 'Kiriko', 'Lifeweaver', 'Lucio', 'Mercy', 'Moira', 'Zenyatta', 'Ashe'];

test.describe('drag and drop', () => {
  test.describe('mouse', () => {
    test('renders the item in row S and one item less in Unranked when the user drags it from Unranked to row S', async ({tierList}) => {
      await tierList.goto(TANKS);

      await tierList.dragItemToTier('Mauga', 'S');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT - 1);
      await expect(tierList.itemIn(tierList.unranked, 'Mauga')).toHaveCount(0);
    });

    test('renders the item in row B only when the user drags it from row S to row B', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga', 'Winston']}));

      await tierList.dragItemToTier('Winston', 'B');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('B')).toHaveText(['Winston']);
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

    test('renders the row contents swapped and the labels S, A, B, C, F in order when the user drags row S onto row A', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));

      await tierList.dragTierOnto('S', 'A');

      // The labels describe positions, so S stays on top and the contents swap.
      await expectTierList(tierList, {
        tiers: [
          {name: 'S', items: ['Winston']},
          {name: 'A', items: ['Mauga']},
          {name: 'B', items: []},
          {name: 'C', items: []},
          {name: 'F', items: []},
          {name: 'Unranked', items: []},
        ],
      });
    });
  });

  test.describe('keyboard', () => {
    test('renders the item in row F when the user moves it from Unranked with the Up arrow key', async ({tierList}) => {
      await tierList.goto(TANKS);

      await tierList.moveItemWithKeyboard('Mauga', ['ArrowUp']);

      await expect(tierList.itemsIn('F')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT - 1);
    });

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

  test.describe('drops in place', () => {
    test('writes no history entry and no new URL when the user drops an item in place by mouse or keyboard', async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Winston', 'Sigma']}));
      const address = tierList.page.url();
      const entries = await tierList.historyLength();

      await tierList.dragItemAndDropInPlace('Winston');
      await tierList.moveItemWithKeyboard('Winston', ['ArrowRight', 'ArrowLeft'], {waitForLink: false});
      await expect(tierList.dragAnnouncer).toHaveText('Dropped Winston. It stays in tier S, position 2 of 3.');

      await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston', 'Sigma']);
      await expect(tierList.page).toHaveURL(address);
      await expect.poll(() => tierList.historyLength()).toBe(entries);
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
      await tierList.waitUntilInteractive();
      const before = page.url();
      const entries = await tierList.historyLength();

      await tierList.dragItemToTierThenCancel('Mauga', 'A');

      await expect(tierList.dragAnnouncer).toHaveText('Move cancelled. Mauga is back in tier S, position 1 of 2.');
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston']);
      await expect(tierList.itemsIn('A')).toHaveCount(0);
      await expect(page).toHaveURL(before);
      await expect.poll(() => tierList.historyLength()).toBe(entries);
      // The editor still works: the next drag moves the item.
      await tierList.dragItemToTier('Mauga', 'A');
      await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
    });

    test('renders the item at its start and writes no history entry when the user presses Escape during a keyboard move', async ({tierList, page}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga', 'Winston'], '': ['Sigma']}));
      await tierList.waitUntilInteractive();
      const before = page.url();
      const entries = await tierList.historyLength();

      await tierList.moveItemWithKeyboardThenCancel('Sigma', ['ArrowUp', 'ArrowUp']);

      await expect(tierList.dragAnnouncer).toHaveText('Move cancelled. Sigma is back in Unranked, position 1 of 1.');
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Sigma']);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga', 'Winston']);
      await expect(page).toHaveURL(before);
      await expect.poll(() => tierList.historyLength()).toBe(entries);
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
      await expect.poll(() => tierList.page.evaluate(() => String(window.getSelection()))).toBe('');
      await expect(menu).toBeVisible();
      await tierList.menuItem('Delete').tap();
      await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
    });

    test('writes no new URL and renders the items in order when the user swipes up from an item', {tag: '@mobile'}, async ({tierList}) => {
      const many = ['Ana', 'Baptiste', 'Brigitte', 'Illari', 'Juno', 'Kiriko', 'Lifeweaver', 'Lucio', 'Mercy', 'Moira', 'Zenyatta'];
      await tierList.goto(ALL, rankingState('image-overwatch', {'': many}));
      const address = tierList.page.url();

      await tierList.swipeUpFromItem('Mercy', 200);

      await expect(tierList.page).toHaveURL(address);
      await expect(tierList.itemsIn(tierList.unranked)).toHaveText(many);
    });
  });

  test.describe('long press', () => {
    test('renders user-select none and -webkit-touch-callout none on item Mauga and row handle S when the page opens', {tag: '@mobile'}, async ({tierList}) => {
      await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga']}));

      for (const element of [tierList.item('Mauga'), tierList.rowHandle('S')]) {
        const style = await element.evaluate((node) => {
          const computed = getComputedStyle(node);
          return {
            userSelect: computed.userSelect || computed.getPropertyValue('-webkit-user-select'),
            callout: computed.getPropertyValue('-webkit-touch-callout'),
          };
        });
        expect(style.userSelect).toBe('none');
        // Only Safari knows the touch callout; other browsers return nothing for it.
        expect(['', 'none']).toContain(style.callout);
      }
    });
  });
});
