import {expect, expectTierList, test} from '../support/test';
import {rankingState} from '../support/links';
import {BLUE_SQUARE, imageFile} from '../support/image-sites';
import type {TierListPage} from '../pages/tier-list-page';

const TANKS = '/rank/overwatch/tank';

type ExpectedList = {title?: string; tiers: {name: string; items: string[]}[]};

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
  act: () => Promise<unknown>;
  list: ExpectedList;
  pictures?: string[];
}

async function expectListAndPictures(tierList: TierListPage, list: ExpectedList, pictures: string[] = []) {
  await expectTierList(tierList, list);
  for (const label of pictures) {
    await expect.poll(() => tierList.itemImageHasLoaded(label), {message: `the image of ${label} shows`}).toBe(true);
  }
}

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
  await expect.poll(() => tierList.historyLength(), {message: 'one history entry per step'}).toBe(entries + steps.length);

  const lists = [start, ...steps.map((step) => step.list)];
  const pictures = [startPictures, ...steps.map((step) => step.pictures ?? [])];
  for (let index = steps.length - 1; index >= 0; index--) {
    await tierList.goBack();
    await expect(page, `Back to step ${index}`).toHaveURL(addresses[index]);
    await expectListAndPictures(tierList, lists[index], pictures[index]);
  }
  for (let index = 1; index <= steps.length; index++) {
    await tierList.goForward();
    await expect(page, `Forward to step ${index}`).toHaveURL(addresses[index]);
    await expectListAndPictures(tierList, lists[index], pictures[index]);
  }
  expect(await tierList.historyLength()).toBe(entries + steps.length);
}

test.describe('journeys', () => {
  test.describe('Back and Forward', () => {
    test.slow();

    test('writes 1 history entry per change when the user ranks items and rows by mouse and keyboard', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston', 'Sigma', 'Orisa']}));

      await walkJourney(tierList, rows({Unranked: ['Mauga', 'Winston', 'Sigma', 'Orisa']}), [
        {act: () => tierList.drag.dragItemToTier('Mauga', 'S'), list: rows({S: ['Mauga'], Unranked: ['Winston', 'Sigma', 'Orisa']})},
        {act: () => tierList.drag.dragItemToTier('Winston', 'S'), list: rows({S: ['Mauga', 'Winston'], Unranked: ['Sigma', 'Orisa']})},
        {act: () => tierList.drag.dragItemNextTo('Winston', 'Mauga', 'before'), list: rows({S: ['Winston', 'Mauga'], Unranked: ['Sigma', 'Orisa']})},
        {act: () => tierList.drag.moveItemWithKeyboard('Sigma', ['ArrowUp']), list: rows({S: ['Winston', 'Mauga'], F: ['Sigma'], Unranked: ['Orisa']})},
        {act: () => tierList.drag.moveItemWithKeyboard('Sigma', ['ArrowUp']), list: rows({S: ['Winston', 'Mauga'], C: ['Sigma'], Unranked: ['Orisa']})},
        {act: () => tierList.drag.moveRowItemsWithKeyboard('S', ['ArrowDown']), list: rows({A: ['Winston', 'Mauga'], C: ['Sigma'], Unranked: ['Orisa']})},
        {act: () => tierList.drag.dragRowItemsOnto('C', 'S'), list: rows({S: ['Sigma'], B: ['Winston', 'Mauga'], Unranked: ['Orisa']})},
        {act: () => tierList.drag.dragItemToTier('Orisa', 'F'), list: rows({S: ['Sigma'], B: ['Winston', 'Mauga'], F: ['Orisa']})},
      ]);
    });

    test('writes 1 history entry per change when the user uploads, ranks, deletes and uploads device images again', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
      const deleteItem = (label: string) => tierList.items.deleteItem(label);

      await walkJourney(tierList, rows({S: ['Mauga']}), [
        {act: () => tierList.deviceImages.addItemsFromDevice([imageFile('red-square.png')]), list: rows({S: ['Mauga'], Unranked: ['red-square']}), pictures: ['red-square']},
        {act: () => tierList.drag.dragItemToTier('red-square', 'A'), list: rows({S: ['Mauga'], A: ['red-square']}), pictures: ['red-square']},
        {act: () => tierList.deviceImages.addItemsFromDevice([imageFile('blue-square.png', BLUE_SQUARE)]), list: rows({S: ['Mauga'], A: ['red-square'], Unranked: ['blue-square']}), pictures: ['red-square', 'blue-square']},
        {act: () => tierList.drag.dragItemNextTo('blue-square', 'red-square', 'before'), list: rows({S: ['Mauga'], A: ['blue-square', 'red-square']}), pictures: ['red-square', 'blue-square']},
        {act: () => deleteItem('red-square'), list: rows({S: ['Mauga'], A: ['blue-square']}), pictures: ['blue-square']},
        {act: () => tierList.deviceImages.addItemsFromDevice([imageFile('red-square.png')]), list: rows({S: ['Mauga'], A: ['blue-square'], Unranked: ['red-square']}), pictures: ['red-square', 'blue-square']},
        {act: () => deleteItem('Mauga'), list: rows({A: ['blue-square'], Unranked: ['red-square']}), pictures: ['red-square', 'blue-square']},
      ]);
    });

    test('writes 1 history entry per change when the user adds, renames, fills and removes a row', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston', 'Sigma']}));

      const sixRows = (items: Parameters<typeof rows>[0], name: string, sixth: string[]) => rows(items, [{name, items: sixth}]);
      await walkJourney(tierList, rows({S: ['Mauga'], Unranked: ['Winston', 'Sigma']}), [
        {act: () => tierList.rows.addTierRow(), list: sixRows({S: ['Mauga'], Unranked: ['Winston', 'Sigma']}, 'Row 6', [])},
        {act: () => tierList.rows.renameTier('Row 6', 'D'), list: sixRows({S: ['Mauga'], Unranked: ['Winston', 'Sigma']}, 'D', [])},
        {act: () => tierList.drag.dragItemToTier('Winston', 'D'), list: sixRows({S: ['Mauga'], Unranked: ['Sigma']}, 'D', ['Winston'])},
        {act: () => tierList.rows.renameTier('S', 'Best'), list: {tiers: [{name: 'Best', items: ['Mauga']}, ...sixRows({Unranked: ['Sigma']}, 'D', ['Winston']).tiers.slice(1)]}},
        {act: () => tierList.rows.removeTierRow('D'), list: {tiers: [{name: 'Best', items: ['Mauga']}, ...rows({Unranked: ['Sigma', 'Winston']}).tiers.slice(1)]}},
      ]);
    });

    test('writes 1 history entry per change when the user sets the title, chooses Reset and confirms Remove All', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], '': ['Sigma']}));
      const titled = (title: string, list: ExpectedList): ExpectedList => ({...list, title});

      await walkJourney(tierList, rows({S: ['Mauga'], A: ['Winston'], Unranked: ['Sigma']}), [
        {act: () => tierList.setTitle('My tanks'), list: titled('My tanks', rows({S: ['Mauga'], A: ['Winston'], Unranked: ['Sigma']}))},
        {act: () => tierList.drag.dragItemToTier('Sigma', 'S'), list: titled('My tanks', rows({S: ['Mauga', 'Sigma'], A: ['Winston']}))},
        {act: () => tierList.items.resetRankings(), list: titled('My tanks', rows({Unranked: ['Mauga', 'Sigma', 'Winston']}))},
        {act: () => tierList.drag.dragItemToTier('Winston', 'S'), list: titled('My tanks', rows({S: ['Winston'], Unranked: ['Mauga', 'Sigma']}))},
        {act: () => tierList.items.removeAllItems(), list: titled('My tanks', rows({}))},
      ]);
    });

    test('writes 1 history entry per change when the user moves items and rows with the keyboard only', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston', 'Sigma']}));

      await walkJourney(tierList, rows({S: ['Mauga'], Unranked: ['Winston', 'Sigma']}), [
        {act: () => tierList.drag.moveItemWithKeyboard('Winston', ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp']), list: rows({S: ['Mauga'], A: ['Winston'], Unranked: ['Sigma']})},
        {act: () => tierList.drag.moveItemWithKeyboard('Sigma', ['ArrowUp']), list: rows({S: ['Mauga'], A: ['Winston'], F: ['Sigma']})},
        {act: () => tierList.drag.moveItemWithKeyboard('Mauga', ['ArrowDown']), list: rows({A: ['Mauga', 'Winston'], F: ['Sigma']})},
        {act: () => tierList.drag.moveRowItemsWithKeyboard('A', ['ArrowUp']), list: rows({S: ['Mauga', 'Winston'], F: ['Sigma']})},
        {act: () => tierList.drag.moveRowItemsWithKeyboard('F', ['ArrowUp', 'ArrowUp']), list: rows({S: ['Mauga', 'Winston'], B: ['Sigma']})},
        {act: () => tierList.drag.moveRowWithKeyboard('B', ['ArrowUp']), list: {tiers: [
          {name: 'S', items: ['Mauga', 'Winston']}, {name: 'B', items: ['Sigma']}, {name: 'A', items: []},
          {name: 'C', items: []}, {name: 'F', items: []}, {name: 'Unranked', items: []},
        ]}},
      ]);
    });
  });
});
