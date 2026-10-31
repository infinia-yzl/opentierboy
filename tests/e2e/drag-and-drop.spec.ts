import {expect, test} from '../support/test';
import {rankingState} from '../support/links';

const ALL = '/rank/overwatch/all';
// Twelve tiles do not fit on one line of a row at the default window size, so row S wraps (#142).
const WRAPPED = ['Ana', 'Baptiste', 'Brigitte', 'Illari', 'Juno', 'Kiriko', 'Lifeweaver', 'Lucio', 'Mercy', 'Moira', 'Zenyatta', 'Ashe'];

test.describe('Rows that wrap onto several lines (#142)', () => {
  test.beforeEach(async ({tierList}) => {
    await tierList.goto(ALL, rankingState('image-overwatch', {S: WRAPPED, '': ['Mauga', 'Winston']}));
    await expect.poll(async () => (await tierList.itemLines('S')).length, {message: 'row S should wrap'}).toBeGreaterThan(1);
  });

  test('drag an item from another row onto the second line of a wrapping row', async ({tierList}) => {
    const [, secondLine] = await tierList.itemLines('S');
    const target = secondLine[1];

    await tierList.dragItemNextTo('Mauga', target, 'before');

    const expected = [...WRAPPED];
    expected.splice(WRAPPED.indexOf(target), 0, 'Mauga');
    await expect(tierList.itemsIn('S')).toHaveText(expected);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Winston']);
  });

  test('drop an item after the last item of a wrapping row', async ({tierList}) => {
    await tierList.dragItemNextTo('Winston', WRAPPED[WRAPPED.length - 1], 'after');

    await expect(tierList.itemsIn('S')).toHaveText([...WRAPPED, 'Winston']);
  });

  test('drag an item from the first line to the second line of its row', async ({tierList}) => {
    const [, secondLine] = await tierList.itemLines('S');
    const target = secondLine[1];

    await tierList.dragItemNextTo('Ana', target, 'before');

    const expected = WRAPPED.filter((name) => name !== 'Ana');
    expected.splice(expected.indexOf(target), 0, 'Ana');
    await expect(tierList.itemsIn('S')).toHaveText(expected);
  });

  test('the Right arrow key goes on from the end of a line to the next line', async ({tierList}) => {
    const [firstLine] = await tierList.itemLines('S');
    const last = firstLine[firstLine.length - 1];

    await tierList.moveItemWithKeyboard(last, ['ArrowRight']);

    const expected = WRAPPED.filter((name) => name !== last);
    expected.splice(firstLine.length, 0, last);
    await expect(tierList.itemsIn('S')).toHaveText(expected);
    await expect.poll(async () => (await tierList.itemLines('S'))[1]?.[0]).toBe(last);
  });

  test('the Down and Up arrow keys move an item between the lines of its row', async ({tierList}) => {
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

  test('the Down arrow key from the last line goes to the next row', async ({tierList}) => {
    const lines = await tierList.itemLines('S');
    const onLastLine = lines[lines.length - 1][0];

    await tierList.moveItemWithKeyboard(onLastLine, ['ArrowDown']);

    await expect(tierList.itemsIn('A')).toHaveText([onLastLine]);
  });
});

test.describe('Drops that change nothing', () => {
  test('dropping an item where the drag started adds no history entry', async ({tierList}) => {
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

test.describe('Drag announcements', () => {
  test('screen readers hear item and tier labels while an item moves with the keyboard', async ({tierList}) => {
    await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston', 'Sigma']}));

    const heard = await tierList.moveItemWithKeyboardAndListen('Sigma', ['ArrowLeft', 'ArrowUp']);

    expect(heard).toEqual([
      'Sigma moves to Unranked, position 1 of 2.',
      'Sigma moves to tier F, position 1 of 1.',
      'Dropped Sigma in tier F, position 1 of 1.',
    ]);
  });

  test('screen readers hear the tier labels while a row moves, and that the labels stay', async ({tierList}) => {
    await tierList.goto(ALL, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));

    await tierList.moveTierWithKeyboard('S', ['ArrowDown']);

    await expect(tierList.dragAnnouncer).toHaveText('Dropped. The items of tier S are now in tier A.');
    await expect(tierList.tiers.first()).toHaveAccessibleName('S');
    await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
    await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
  });
});

test.describe('Cancelling a move', () => {
  test('Escape during a mouse drag puts the item back, and the link and history stay', async ({tierList, page}) => {
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

  test('Escape during a keyboard move puts the item back, and the link and history stay', async ({tierList, page}) => {
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

test.describe('Touch', () => {
  test.skip(({browserName, isMobile}) => browserName !== 'chromium' || !isMobile, 'Touch events go through the Chrome DevTools Protocol, on a phone.');

  test('hold an item, then drag it into a tier', {tag: '@mobile'}, async ({tierList}) => {
    await tierList.goto(ALL, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));

    await tierList.touchDragItemToTier('Mauga', 'S');

    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Winston']);
  });

  test('a long press opens the item menu, and Delete removes the item', {tag: '@mobile'}, async ({tierList}) => {
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

  test('a swipe that starts on an item scrolls the page and moves nothing', {tag: '@mobile'}, async ({tierList}) => {
    const many = ['Ana', 'Baptiste', 'Brigitte', 'Illari', 'Juno', 'Kiriko', 'Lifeweaver', 'Lucio', 'Mercy', 'Moira', 'Zenyatta'];
    await tierList.goto(ALL, rankingState('image-overwatch', {'': many}));
    const address = tierList.page.url();

    await tierList.swipeUpFromItem('Mercy', 200);

    await expect(tierList.page).toHaveURL(address);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(many);
  });
});

test.describe('Long press', () => {
  test('items and row handles turn off text selection and the touch callout', {tag: '@mobile'}, async ({tierList}) => {
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
