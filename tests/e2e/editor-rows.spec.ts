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

  test.describe('row count', () => {
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
          CHOOSE_3_ROWS: () => tierList.rows.chooseRowCount(3),
          CHOOSE_5_ROWS: () => tierList.rows.chooseRowCount(5),
          CHOOSE_7_ROWS: () => tierList.rows.chooseRowCount(7),
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
