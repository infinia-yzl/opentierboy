import {expect, expectTierList, expectTierNames, test} from '../support/test';
import {packageItemId, rankingState, v3LinkJson, v3State} from '../support/links';
import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {type TierListPage} from '../pages/tier-list-page';
import {editorRowsModel, editorRowsViewOf, type EditorRowsEvent, type EditorRowsSnapshot} from '../models/editor-rows';

const TANKS = '/rank/overwatch/tank';

const linkRowNames = (link: string) => (v3LinkJson(link) as {r: unknown[][]}).r.map((row) => row[row.length - 2]);

test.describe('editor rows', () => {
  test('renders row Row 6 above Unranked and writes 1 history entry when the user clicks Add row', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston']}));
    const entries = await tierList.historyLength();

    await tierList.rows.addTierRow();

    await expect(tierList.tiers).toHaveCount(7);
    await expect(tierList.tiers.nth(5)).toHaveAccessibleName('Row 6');
    await expect(tierList.tierLabel('Row 6')).toHaveText('Row 6');
    await expect(tierList.tiers.last()).toHaveAccessibleName('Unranked');
    await expect.poll(() => tierList.historyLength()).toBe(entries + 1);

    await tierList.goBack();
    await expect(tierList.tiers).toHaveCount(6);
    await expect(tierList.tier('Row 6')).toHaveCount(0);
  });

  test('writes an empty name for the added row into the state parameter when the user clicks Add row', async ({tierList, page}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], '': ['Winston']}));

    await tierList.rows.addTierRow();

    expect(linkRowNames(page.url())).toEqual(['S', 'A', 'B', 'C', 'F', '', '']);
  });

  test('renders the hint of the unnamed row after its new position when the user drags the row by its grip onto row S', async ({tierList}) => {
    await tierList.goto(TANKS, v3State({r: [['tier-s', 'S', []], ['tier-a', 'A', []], ['tier-1', '', [packageItemId('image-overwatch', 'Mauga')]], ['uncategorized', '', []]]}));
    await expect(tierList.tierLabel('Row 3')).toHaveText('Row 3');

    await tierList.drag.dragRowOnto('Row 3', 'S');

    await expectTierNames(tierList, ['Row 1', 'S', 'A', 'Unranked']);
    await expect(tierList.itemsIn('Row 1')).toHaveText(['Mauga']);
  });

  test('renders the label Tier 5 when the page opens a link whose added row has the name Tier 5', async ({tierList}) => {
    await tierList.goto(TANKS, v3State({r: [['tier-s', 'S', []], ['tier-1', 'Tier 5', []], ['uncategorized', '', []]]}));

    await expectTierNames(tierList, ['S', 'Tier 5', 'Unranked']);
    await expect(tierList.tierLabel('Tier 5')).toHaveText('Tier 5');
  });

  test('renders the added row with its name and item for a visitor of the share link when the user fills it', async ({tierList, openAsVisitor}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {'': ['Mauga', 'Winston']}));

    await tierList.rows.addTierRow();
    await tierList.rows.renameTier('Row 6', 'D');
    await tierList.drag.dragItemToTier('Mauga', 'D');

    const friend = await openAsVisitor(await tierList.shareLink());
    await expectTierList(friend, {
      tiers: [
        {name: 'S', items: []},
        {name: 'A', items: []},
        {name: 'B', items: []},
        {name: 'C', items: []},
        {name: 'F', items: []},
        {name: 'D', items: ['Mauga']},
        {name: 'Unranked', items: ['Winston']},
      ],
    });
  });

  test('renders the row items in Unranked and writes 1 history entry when the user removes row B', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], B: ['Winston', 'Sigma'], '': ['D.Va']}));
    const entries = await tierList.historyLength();

    await tierList.rows.removeTierRow('B');

    await expect(tierList.tier('B')).toHaveCount(0);
    await expect(tierList.tiers).toHaveCount(5);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['D.Va', 'Winston', 'Sigma']);
    await expect.poll(() => tierList.historyLength()).toBe(entries + 1);

    await tierList.goBack();
    await expect(tierList.itemsIn('B')).toHaveText(['Winston', 'Sigma']);
    await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['D.Va']);
  });

  test('renders no Unranked in the Remove a row menu, and the menu item disabled, when the user removes rows down to 1', async ({tierList}) => {
    await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga']}));
    await tierList.rows.chooseRowCount(3);

    await expect(tierList.addRowButton).toBeEnabled();
    await expect(await tierList.rows.openRemoveRowMenu()).toHaveText(['S', 'A', 'B']);
    await tierList.closeMenus();

    await tierList.rows.removeTierRow('A');
    await tierList.rows.removeTierRow('B');

    await expect(tierList.addRowButton).toBeEnabled();
    await tierList.rows.openRowOptions();
    await expect(tierList.rows.removeRowMenuItem).toBeDisabled();
    await tierList.closeMenus();
    await expect(tierList.tiers).toHaveCount(2);
    await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
  });

  test('renders button "Add row" disabled when the list has 20 rows, Unranked included', async ({tierList}) => {
    const rows = Array.from({length: 19}, (_, index) => [`row-${index + 1}`, `R${index + 1}`, []]);
    await tierList.goto(TANKS, v3State({r: [...rows, ['uncategorized', '', []]]}));
    await expect(tierList.tiers).toHaveCount(20);

    await expect(tierList.addRowButton).toBeDisabled();

    await tierList.rows.removeTierRow('R7');
    await expect(tierList.tiers).toHaveCount(19);
    await expect(tierList.addRowButton).toBeEnabled();
  });

  test.describe('row count', () => {
    test('renders the items of removed rows in Unranked when the user chooses 3 Rows', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], C: ['Winston'], F: ['Sigma']}));

      await tierList.rows.chooseRowCount(3);

      await expectTierNames(tierList, ['S', 'A', 'B', 'Unranked']);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn(tierList.unranked)).toContainText(['Winston', 'Sigma']);
      await expect(tierList.tier('C')).toHaveCount(0);
    });

    test('renders rows SS and D and every item in its row when the user chooses 7 Rows', async ({tierList}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], F: ['Sigma']}));

      await tierList.rows.chooseRowCount(7);

      await expectTierNames(tierList, ['SS', 'S', 'A', 'B', 'C', 'D', 'F', 'Unranked']);
      await expect(tierList.itemsIn('S')).toHaveText(['Mauga']);
      await expect(tierList.itemsIn('F')).toHaveText(['Sigma']);
    });

    test('renders the same 7 rows for the user and a share link visitor when both choose 7 Rows after a row move', async ({tierList, openAsVisitor}) => {
      await tierList.goto(TANKS, rankingState('image-overwatch', {S: ['Mauga'], A: ['Winston'], C: ['Sigma']}));
      await tierList.drag.dragRowItemsOnto('S', 'A');
      await expect(tierList.itemsIn('S')).toHaveText(['Winston']);
      await expect(tierList.itemsIn('A')).toHaveText(['Mauga']);
      const friend = await openAsVisitor(await tierList.shareLink());

      const expected = {tiers: [
        {name: 'SS', items: []}, {name: 'S', items: ['Mauga']}, {name: 'A', items: ['Winston']}, {name: 'B', items: []},
        {name: 'C', items: ['Sigma']}, {name: 'D', items: []}, {name: 'F', items: []}, {name: 'Unranked', items: []},
      ]};
      await tierList.rows.chooseRowCount(7);
      await expectTierList(tierList, expected);
      await friend.rows.chooseRowCount(7);
      await expectTierList(friend, expected);
    });
  });

  test.describe('model: rows', () => {
    const id = (name: string) => packageItemId('image-overwatch', name);
    const middle = Array.from({length: 13}, (_, index) => [`row-${index + 6}`, `R${index + 6}`, []]);
    const LIST = v3State({r: [
      ['tier-s', 'S', [id('Mauga')]], ['tier-a', 'A', []], ['tier-b', 'B', []], ['tier-c', 'C', []], ['tier-f', 'F', []],
      ...middle, ['row-19', 'R19', [id('Winston')]], ['uncategorized', '', [id('Sigma')]],
    ]});

    const rowsSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      let pushes: () => Promise<number> = async () => 0;
      let last: {state: string; entries: number} | null = null;
      return modelSut<EditorRowsSnapshot, EditorRowsEvent>(page, {
        reset: async () => {
          await tierList.openAfterBlankPage(TANKS, LIST);
          pushes = await tierList.countNewHistoryEntries();
          last = null;
        },
        events: {
          ADD_ROW: () => tierList.rows.addTierRow(),
          REMOVE_FIRST_ROW: () => tierList.rows.removeFirstTierRow(),
          CLEAR_SECOND_LABEL: () => tierList.rows.renameTier('A', '', 'Row 2'),
          CHOOSE_3_ROWS: () => tierList.rows.chooseRowCountAndWaitForRows(3),
          CHOOSE_5_ROWS: () => tierList.rows.chooseRowCountAndWaitForRows(5),
          CHOOSE_7_ROWS: () => tierList.rows.chooseRowCountAndWaitForRows(7),
        },
        states: {
          '*': async (_page, snapshot) => {
            const {rows, canAdd} = editorRowsViewOf(snapshot);
            await expectTierList(tierList, {tiers: rows.map(({name, items}) => ({name, items: [...items]}))});
            if (canAdd) await expect(tierList.addRowButton).toBeEnabled();
            else await expect(tierList.addRowButton).toBeDisabled();
            const state = String(snapshot.value);
            const entries = await pushes();
            if (last) {
              const added = state === last.state ? 0 : 1;
              expect(entries - last.entries, `${added} history entry from ${last.state} to ${state}`).toBe(added);
            } else {
              expect(entries, 'no history entry when the list opens').toBe(0);
            }
            last = {state, entries};
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(editorRowsModel)) {
      test(`writes 1 history entry per change and renders each row limit when the user adds, removes and switches rows (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(editorRowsModel, rowsSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, editorRowsModel, coverage, part);
      });
    }
  });
});
