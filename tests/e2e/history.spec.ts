import {expect, expectTierList, SHARED_LINKS, test} from '../support/test';
import {packageItemId, rankingState, templateItemCount, v3State} from '../support/links';

const TANKS = '/rank/overwatch/tank';
const TANK_COUNT = templateItemCount('image-overwatch', 'tank');

/**
 * Product rule: the browser history is the undo feature.
 *
 * Every change to the list writes a new link into the address bar as a new history
 * entry, so the browser Back button steps back to the previous version of the list, one
 * change at a time. This is intended. Do not change the app to replace history entries.
 */
test.describe('Browser history', () => {
  test('Back after Reset restores the previous ranking', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], '': ['Sigma']}));
    await tierList.resetRankings();
    await expect(tierList.itemsIn('S')).toHaveCount(0);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Sigma', 'Winston']);

    await page.goBack();

    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Sigma']);
  });

  test('Back steps back through edits one change at a time', async ({tierList, page}) => {
    // Start from a shared link, as a list that someone keeps editing does.
    await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
    await tierList.dragItemToTier('Mauga', 'S');
    await tierList.dragItemToTier('Winston', 'A');
    await expect(tierList.itemsIn('A')).toHaveText(['Winston']);

    await page.goBack();
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

    await page.goBack();
    await expect(tierList.itemsIn('S')).toHaveCount(0);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Mauga', 'Winston', 'Sigma']);

    await page.goForward();
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
  });
});

/**
 * On a slow connection, each change still gets its own history entry (A44). The app pushes the
 * links one at a time: Next.js drops a navigation that is still loading when the next starts.
 */
test.describe('Browser history on a slow connection', () => {
  test('quick moves each get their own history entry, and Back steps through them', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
    const entries = await tierList.historyLength();
    await tierList.simulateSlowServer(400);

    for (const name of ['Mauga', 'Winston', 'Sigma']) {
      await tierList.moveItemWithKeyboard(name, ['ArrowUp'], {waitForLink: false});
    }
    await expect(tierList.itemsIn('F')).toHaveCount(3);
    await expect.poll(() => tierList.historyLength(), {message: 'one history entry per move'}).toBe(entries + 3);

    for (const count of [2, 1, 0]) {
      await page.goBack();
      await expect(tierList.itemsIn('F')).toHaveCount(count);
    }
  });

  test('quick renames each get their own history entry', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    const entries = await tierList.historyLength();
    await tierList.simulateSlowServer(400);

    await tierList.renameTier('S', 'First', 'First', {waitForLink: false});
    await tierList.renameTier('First', 'Second', 'Second', {waitForLink: false});
    await expect.poll(() => tierList.historyLength(), {message: 'one history entry per rename'}).toBe(entries + 2);

    await page.goBack();
    await expect(tierList.tiers.first()).toHaveAccessibleName('First');
    await page.goBack();
    await expect(tierList.tiers.first()).toHaveAccessibleName('S');
  });
});

test.describe('Browser history and the template page', () => {
  test('Back to a template page without a link shows the template again', async ({tierList, page}) => {
    await tierList.goto(TANKS);
    await tierList.dragItemToTier('Mauga', 'S');
    await tierList.dragItemToTier('Winston', 'A');
    const entries = await tierList.historyLength();

    await page.goBack();
    await page.goBack();

    await expect(page).toHaveURL(/\/rank\/overwatch\/tank$/);
    await expect(tierList.itemsIn('S')).toHaveCount(0);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveCount(TANK_COUNT);
    // Showing the template again writes nothing: Forward still works (A6).
    expect(await tierList.historyLength()).toBe(entries);
    await page.goForward();
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    await expect(tierList.itemsIn('A')).toHaveCount(0);
  });
});

/**
 * Opening a link never writes the address (A1): the address and the history stay as they
 * are, so Back leaves the list. Only a change to the list writes a new link.
 */
test.describe('Opening a link', () => {
  for (const id of ['link-001', 'link-012', 'link-002']) {
    const link = SHARED_LINKS.find((entry) => entry.id === id)!;
    test(`opening a ${link.format} link (${id}) leaves the address and the history as they are`, async ({tierList, page}) => {
      await page.goto('/about');
      const entries = await tierList.historyLength();

      await tierList.gotoAndSettle(link.path, link.state);
      await expect(tierList.title).toHaveText(link.expected.title);
      const opened = new URL(`${link.path}?state=${link.state}`, page.url()).href;
      expect(page.url()).toBe(opened);
      expect(await tierList.historyLength()).toBe(entries + 1);

      // One change, then Back, returns to exactly this link.
      await tierList.setTitle('Changed');
      await page.goBack();
      await expect(page).toHaveURL(opened);
      await expect(tierList.title).toHaveText(link.expected.title);
    });
  }

  test('opening a titled v3 link leaves the address and the history as they are', async ({tierList, page}) => {
    const state = v3State({
      t: 'My v3 list', tp: 5, lp: 'right',
      r: [['S', [packageItemId('image-overwatch', 'Mauga')]], ['A', []], ['B', []], ['C', []], ['F', []], ['', [packageItemId('image-overwatch', 'Winston')]]],
    });
    await page.goto('/about');
    const entries = await tierList.historyLength();

    await tierList.gotoAndSettle(TANKS, state);
    await expect(tierList.title).toHaveText('My v3 list');
    const opened = new URL(`${TANKS}?state=${state}`, page.url()).href;
    expect(page.url()).toBe(opened);
    expect(await tierList.historyLength()).toBe(entries + 1);

    await tierList.setTitle('Changed');
    await page.goBack();
    await expect(page).toHaveURL(opened);
    await expect(tierList.title).toHaveText('My v3 list');
  });
});

/**
 * Label position and label visibility travel in the link (A3). The owner chose on 2026-10-25
 * that they replace the current history entry, so they add no Back step, as before; Back and
 * Forward inside the editor keep the settings on screen.
 */
test.describe('Browser history and settings', () => {
  test('changing the label position or hiding the labels adds no history entry', async ({tierList, page}) => {
    for (const state of [undefined, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston']})]) {
      await tierList.goto(TANKS, state);
      const entries = await tierList.historyLength();

      await tierList.chooseLabelPosition('Top');
      await tierList.setItemLabelsVisible(false);
      expect(await tierList.historyLength(), 'the settings replace the current entry').toBe(entries);
      const withSettings = page.url();
      await tierList.dragItemToTier('Winston', 'A');

      // Back after the one change to the list goes straight back to the page as opened, whose
      // link now holds the settings.
      await page.goBack();
      await expect(page).toHaveURL(withSettings);
      await expect(tierList.itemsIn('A')).toHaveCount(0);
      expect(await tierList.labelSettings()).toEqual({position: 'Top', labelsShown: false});
    }
  });

  test('Back after a change keeps the label settings on screen', async ({tierList, page}) => {
    // The owner's example: Mauga to S, Winston to A, labels on Top, then Back.
    await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
    await tierList.dragItemToTier('Mauga', 'S');
    await tierList.dragItemToTier('Winston', 'A');
    await tierList.chooseLabelPosition('Top');

    await page.goBack();
    await expect(tierList.itemsIn('A')).toHaveCount(0);
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    expect(await tierList.labelSettings()).toEqual({position: 'Top', labelsShown: true});
    expect(await tierList.tierLabelIsAbove('S', 'Mauga')).toBe(true);

    // Forward shows Winston in A again, still with labels on Top.
    await page.goForward();
    await expect(tierList.itemsIn('A')).toHaveText(['Winston']);
    expect(await tierList.labelSettings()).toEqual({position: 'Top', labelsShown: true});
  });

  test('coming back to the editor from another page opens the link fresh, with its settings', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    await tierList.chooseLabelPosition('Right');
    await tierList.setItemLabelsVisible(false);

    await page.goto('/about');
    await page.goBack();
    await expect(tierList.itemsIn('S')).toHaveText(['']);
    expect(await tierList.labelSettings()).toEqual({position: 'Right', labelsShown: false});
  });

  test('Undo from a toast adds a new history entry', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston']}));
    const entries = await tierList.historyLength();
    await tierList.resetRankings();

    const reset = page.url();
    await tierList.undoFromToast('Items Reset');
    await expect(page).not.toHaveURL(reset);
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
    expect(await tierList.historyLength()).toBe(entries + 2);

    // Back steps to the reset list, then to the list as opened.
    await page.goBack();
    await expect(tierList.itemsIn('S')).toHaveCount(0);
    await page.goBack();
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
  });
});

/**
 * Known bugs. Each test describes the correct behaviour and is marked `test.fail`, so the
 * suite stays green while the bug exists. See items.spec.ts for the convention.
 */
test.describe('Known bugs', () => {
  test('on a slow connection, a change followed at once by Back is one Back step away', async ({tierList, page}) => {
    test.fail(true, 'router.push adds the history entry only after the server answers, so Back pressed before that leaves from the entry before the change, and the change is lost. The fix considered was native history.pushState followed by a metadata refresh (still exactly one entry per change); the owner chose to keep the current behaviour on 2026-10-25.');
    await page.goto('/about');
    await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));
    const opened = page.url();
    await tierList.simulateSlowServer(400);

    await tierList.moveItemWithKeyboard('Mauga', ['ArrowUp'], {waitForLink: false});
    await page.goBack();

    // Short timeouts: these assertions are expected to fail until the bug is fixed.
    await expect(page).toHaveURL(opened, {timeout: 3_000});
    await expect(tierList.itemsIn('F')).toHaveCount(0, {timeout: 3_000});
    await page.goForward();
    await expect(tierList.itemsIn('F')).toHaveText(['Mauga'], {timeout: 3_000});
  });
});
