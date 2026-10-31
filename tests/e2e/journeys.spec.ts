import {expect, expectTierList, test} from '../support/test';
import {rankingState} from '../support/links';
import {BLUE_SQUARE, imageFile} from '../support/imageSites';
import type {TierListPage} from '../pages/TierListPage';

/**
 * Longer editing journeys. Each journey makes several changes in a row, then walks the browser
 * history all the way Back and all the way Forward again. Product rule 2: every change is one
 * history entry, Back shows the version before it, and Forward the version after it, with the
 * same link each time.
 */
const TANKS = '/rank/overwatch/tank';

type ExpectedList = {title?: string; tiers: {name: string; items: string[]}[]};

/** The five-row template's rows plus Unranked, with the given items. */
function rows(items: Partial<Record<'S' | 'A' | 'B' | 'C' | 'F' | 'Unranked', string[]>>, extraRows: {name: string; items: string[]}[] = []): ExpectedList {
  return {
    tiers: [
      ...(['S', 'A', 'B', 'C', 'F'] as const).map((name) => ({name, items: items[name] ?? []})),
      ...extraRows,
      {name: 'Unranked', items: items.Unranked ?? []},
    ],
  };
}

interface Step {
  /** What the user does. It must change the list, so the address changes. */
  act: () => Promise<void>;
  /** The list after the step. */
  list: ExpectedList;
  /** Device pictures whose images must show after the step (by label). */
  pictures?: string[];
}

async function expectListAndPictures(tierList: TierListPage, list: ExpectedList, pictures: string[] = []) {
  await expectTierList(tierList, list);
  for (const label of pictures) {
    await expect.poll(() => tierList.itemImageHasLoaded(label), {message: `the image of ${label} shows`}).toBe(true);
  }
}

/**
 * Runs the steps, then walks Back to the start and Forward to the end. At every point the list
 * on screen and the address must match what that step showed.
 */
async function walkJourney(tierList: TierListPage, start: ExpectedList, steps: Step[], startPictures: string[] = []) {
  const page = tierList.page;
  await expectListAndPictures(tierList, start, startPictures);
  const addresses = [page.url()];
  const entries = await tierList.historyLength();

  for (const [index, step] of steps.entries()) {
    await step.act();
    await expect(page, `step ${index + 1} writes a new link`).not.toHaveURL(addresses[addresses.length - 1]);
    await expectListAndPictures(tierList, step.list, step.pictures);
    addresses.push(page.url());
  }
  expect(await tierList.historyLength(), 'one history entry per step').toBe(entries + steps.length);

  const lists = [start, ...steps.map((step) => step.list)];
  const pictures = [startPictures, ...steps.map((step) => step.pictures ?? [])];
  for (let index = steps.length - 1; index >= 0; index--) {
    await page.goBack();
    await expect(page, `Back to step ${index}`).toHaveURL(addresses[index]);
    await expectListAndPictures(tierList, lists[index], pictures[index]);
  }
  for (let index = 1; index <= steps.length; index++) {
    await page.goForward();
    await expect(page, `Forward to step ${index}`).toHaveURL(addresses[index]);
    await expectListAndPictures(tierList, lists[index], pictures[index]);
  }
  // Walking the history writes nothing new.
  expect(await tierList.historyLength()).toBe(entries + steps.length);
}

test.describe('Editing journeys with Back and Forward', () => {
  test.slow();

  test('ranking items and rows by mouse and keyboard', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma', 'Orisa']}));

    await walkJourney(tierList, rows({Unranked: ['Mauga', 'Winston', 'Sigma', 'Orisa']}), [
      {act: () => tierList.dragItemToTier('Mauga', 'S'), list: rows({S: ['Mauga'], Unranked: ['Winston', 'Sigma', 'Orisa']})},
      {act: () => tierList.dragItemToTier('Winston', 'S'), list: rows({S: ['Mauga', 'Winston'], Unranked: ['Sigma', 'Orisa']})},
      // Reorder inside a row: Winston goes before Mauga.
      {act: () => tierList.dragItemNextTo('Winston', 'Mauga', 'before'), list: rows({S: ['Winston', 'Mauga'], Unranked: ['Sigma', 'Orisa']})},
      // Keyboard: Up from Unranked goes to the last ranked row, and Up again to the row above it.
      {act: () => tierList.moveItemWithKeyboard('Sigma', ['ArrowUp']), list: rows({S: ['Winston', 'Mauga'], F: ['Sigma'], Unranked: ['Orisa']})},
      {act: () => tierList.moveItemWithKeyboard('Sigma', ['ArrowUp']), list: rows({S: ['Winston', 'Mauga'], C: ['Sigma'], Unranked: ['Orisa']})},
      // Rows: the labels describe positions, so moving row S down moves its items into A.
      {act: () => tierList.moveTierWithKeyboard('S', ['ArrowDown']), list: rows({A: ['Winston', 'Mauga'], C: ['Sigma'], Unranked: ['Orisa']})},
      {act: () => tierList.dragTierOnto('C', 'S'), list: rows({S: ['Sigma'], B: ['Winston', 'Mauga'], Unranked: ['Orisa']})},
      {act: () => tierList.dragItemToTier('Orisa', 'F'), list: rows({S: ['Sigma'], B: ['Winston', 'Mauga'], F: ['Orisa']})},
    ]);
  });

  test('pictures: upload, rank, delete and upload again', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    const deleteItem = async (label: string) => {
      const before = tierList.page.url();
      await tierList.deleteItem(label);
      await expect(tierList.page).not.toHaveURL(before);
    };

    await walkJourney(tierList, rows({S: ['Mauga']}), [
      {act: () => tierList.addItemsFromDevice([imageFile('red-square.png')]), list: rows({S: ['Mauga'], Unranked: ['red-square']}), pictures: ['red-square']},
      {act: () => tierList.dragItemToTier('red-square', 'A'), list: rows({S: ['Mauga'], A: ['red-square']}), pictures: ['red-square']},
      {act: () => tierList.addItemsFromDevice([imageFile('blue-square.png', BLUE_SQUARE)]), list: rows({S: ['Mauga'], A: ['red-square'], Unranked: ['blue-square']}), pictures: ['red-square', 'blue-square']},
      {act: () => tierList.dragItemNextTo('blue-square', 'red-square', 'before'), list: rows({S: ['Mauga'], A: ['blue-square', 'red-square']}), pictures: ['red-square', 'blue-square']},
      {act: () => deleteItem('red-square'), list: rows({S: ['Mauga'], A: ['blue-square']}), pictures: ['blue-square']},
      // The same picture again, after it was deleted.
      {act: () => tierList.addItemsFromDevice([imageFile('red-square.png')]), list: rows({S: ['Mauga'], A: ['blue-square'], Unranked: ['red-square']}), pictures: ['red-square', 'blue-square']},
      {act: () => deleteItem('Mauga'), list: rows({A: ['blue-square'], Unranked: ['red-square']}), pictures: ['red-square', 'blue-square']},
    ]);
  });

  test('rows: add, rename, fill and remove', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston', 'Sigma']}));

    const sixRows = (items: Parameters<typeof rows>[0], name: string, sixth: string[]) => rows(items, [{name, items: sixth}]);
    await walkJourney(tierList, rows({S: ['Mauga'], Unranked: ['Winston', 'Sigma']}), [
      {act: () => tierList.addTierRow(), list: sixRows({S: ['Mauga'], Unranked: ['Winston', 'Sigma']}, 'Tier 6', [])},
      {act: () => tierList.renameTier('Tier 6', 'D'), list: sixRows({S: ['Mauga'], Unranked: ['Winston', 'Sigma']}, 'D', [])},
      {act: () => tierList.dragItemToTier('Winston', 'D'), list: sixRows({S: ['Mauga'], Unranked: ['Sigma']}, 'D', ['Winston'])},
      {act: () => tierList.renameTier('S', 'Best'), list: {tiers: [{name: 'Best', items: ['Mauga']}, ...sixRows({Unranked: ['Sigma']}, 'D', ['Winston']).tiers.slice(1)]}},
      // A removed row's items go to Unranked.
      {act: () => tierList.removeTierRow('D'), list: {tiers: [{name: 'Best', items: ['Mauga']}, ...rows({Unranked: ['Sigma', 'Winston']}).tiers.slice(1)]}},
    ]);
  });

  test('title, Reset and Remove All', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], '': ['Sigma']}));
    const titled = (title: string, list: ExpectedList): ExpectedList => ({...list, title});

    await walkJourney(tierList, rows({S: ['Mauga'], A: ['Winston'], Unranked: ['Sigma']}), [
      {act: () => tierList.setTitle('My tanks'), list: titled('My tanks', rows({S: ['Mauga'], A: ['Winston'], Unranked: ['Sigma']}))},
      {act: () => tierList.dragItemToTier('Sigma', 'S'), list: titled('My tanks', rows({S: ['Mauga', 'Sigma'], A: ['Winston']}))},
      {act: () => tierList.resetRankings(), list: titled('My tanks', rows({Unranked: ['Mauga', 'Sigma', 'Winston']}))},
      {act: () => tierList.dragItemToTier('Winston', 'S'), list: titled('My tanks', rows({S: ['Winston'], Unranked: ['Mauga', 'Sigma']}))},
      {act: () => tierList.removeAllItems(), list: titled('My tanks', rows({}))},
    ]);
  });

  test('keyboard only: items through several rows, and rows up and down', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston', 'Sigma']}));

    await walkJourney(tierList, rows({S: ['Mauga'], Unranked: ['Winston', 'Sigma']}), [
      // Up four times: Unranked to F, C, B, then A.
      {act: () => tierList.moveItemWithKeyboard('Winston', ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp']), list: rows({S: ['Mauga'], A: ['Winston'], Unranked: ['Sigma']})},
      {act: () => tierList.moveItemWithKeyboard('Sigma', ['ArrowUp']), list: rows({S: ['Mauga'], A: ['Winston'], F: ['Sigma']})},
      // Down keeps the item's place across the row, so Mauga lands before Winston.
      {act: () => tierList.moveItemWithKeyboard('Mauga', ['ArrowDown']), list: rows({A: ['Mauga', 'Winston'], F: ['Sigma']})},
      {act: () => tierList.moveTierWithKeyboard('A', ['ArrowUp']), list: rows({S: ['Mauga', 'Winston'], F: ['Sigma']})},
      {act: () => tierList.moveTierWithKeyboard('F', ['ArrowUp', 'ArrowUp']), list: rows({S: ['Mauga', 'Winston'], B: ['Sigma']})},
    ]);
  });
});

test.describe('A new change after Back', () => {
  test.slow();

  test('replaces the steps that were ahead, and Back still steps through the rest', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma']}));
    await tierList.dragItemToTier('Mauga', 'S');
    const afterMauga = page.url();
    await tierList.dragItemToTier('Winston', 'A');
    await tierList.dragItemToTier('Sigma', 'B');

    // Back twice: only Mauga is ranked again.
    await page.goBack();
    await page.goBack();
    await expect(page).toHaveURL(afterMauga);
    await expectTierList(tierList, rows({S: ['Mauga'], Unranked: ['Winston', 'Sigma']}));

    // A different change from here. The browser drops the two steps that were ahead.
    await tierList.dragItemToTier('Sigma', 'F');
    await expectTierList(tierList, rows({S: ['Mauga'], F: ['Sigma'], Unranked: ['Winston']}));
    const afterSigma = page.url();

    await page.goBack();
    await expect(page).toHaveURL(afterMauga);
    await expectTierList(tierList, rows({S: ['Mauga'], Unranked: ['Winston', 'Sigma']}));
    await page.goForward();
    await expect(page).toHaveURL(afterSigma);
    await expectTierList(tierList, rows({S: ['Mauga'], F: ['Sigma'], Unranked: ['Winston']}));
    // Nothing is ahead any more: Forward stays on the newest version.
    await page.goForward();
    await expect(page).toHaveURL(afterSigma);
    await expectTierList(tierList, rows({S: ['Mauga'], F: ['Sigma'], Unranked: ['Winston']}));
  });
});
