import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, test} from '../support/test';
import type {TierListPage} from '../pages/tier-list-page';
import {INK_SUPPLY} from '../pages/scribble';
import {rankingState} from '../support/links';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {notesIn, penOf, scribbleModel, type ScribbleEvent, type ScribbleSnapshot} from '../models/scribble';

const TANKS = '/rank/overwatch/tank';
const LIST = rankingState('image-overwatch', {S: ['Mauga'], C: ['Winston'], '': ['Sigma', 'Orisa']});
const OUT_OF_INK = 'Out of ink. Remove a note to get ink back.';
const LIGHT_INK = {Red: 'rgb(220, 38, 38)', Blue: 'rgb(37, 99, 235)', Contrast: 'rgb(12, 17, 67)'};
const DARK_INK = {Red: 'rgb(248, 113, 113)', Blue: 'rgb(96, 165, 250)', Contrast: 'rgb(255, 255, 255)'};

test.describe('scribble', () => {
  test.describe('pen', () => {
    test('renders the button "Scribble" not pressed, with the tooltip "Scribble (D)", when the user turns on Zen', async ({tierList}) => {
      const {scribble} = tierList;
      await tierList.goto(TANKS, LIST);

      await tierList.zen.setZenMode(true);

      await scribble.expectScribble(false);
      await expect(scribble.layer).toHaveCount(0);
      await expect(await scribble.tooltipOf(scribble.toggle)).toHaveText('Scribble (D)');
    });

    test('renders the ink colour, "Remove last note" and "Clear scribbles" in a toolbar when the user presses button "Scribble"', async ({tierList}) => {
      const {scribble} = tierList;
      await tierList.goto(TANKS, LIST);
      await tierList.zen.setZenMode(true);

      await scribble.setScribble(true);

      expect(await scribble.controlNames()).toEqual(['Ink colour: Red', 'Remove last note', 'Clear scribbles']);
      await expect(scribble.inkStatus).toHaveCount(0);
      await scribble.expectNotes(0);

      await scribble.setScribble(false);

      await expect(scribble.layer).toHaveCount(0);
    });

    test('renders the toolbar "Scribble" when the user presses D, and no toolbar when the user presses D again', async ({tierList}) => {
      const {scribble} = tierList;
      await tierList.goto(TANKS, LIST);
      await tierList.zen.setZenMode(true);

      await scribble.pressScribbleKey();
      await scribble.expectScribble(true);

      await scribble.pressScribbleKey();
      await scribble.expectScribble(false);
    });

    test('renders the typed letter and no toolbar "Scribble" when the user presses D in the name of a row', async ({tierList}) => {
      const {scribble} = tierList;
      await tierList.goto(TANKS, LIST);
      await tierList.zen.setZenMode(true);
      await tierList.tierLabel('S').click();
      await expect(tierList.rows.tierNameInput('S')).toBeFocused();

      await scribble.pressScribbleKey();

      await expect(tierList.rows.tierNameInput('S')).toHaveValue(/d/);
      await scribble.expectScribble(false);
    });

    test('renders the Zen bar without the pen controls when the user presses Escape once, and no Zen bar after a second Escape', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);

      await tierList.pressEscapeOnList();

      await scribble.expectScribble(false);
      await expect(tierList.zen.zenBar).toBeVisible();

      await tierList.pressEscapeOnList();

      await expect(tierList.zen.zenBar).toHaveCount(0);
    });

    test('renders the Zen bar and the title where they were when the user turns Scribble on', async ({tierList}) => {
      const {scribble} = tierList;
      await tierList.goto(TANKS, LIST);
      await tierList.zen.setZenMode(true);
      const before = await scribble.boxes(tierList.zen.zenBar, tierList.title, tierList.tier('S'));

      await scribble.setScribble(true);

      expect(await scribble.boxes(tierList.zen.zenBar, tierList.title, tierList.tier('S'))).toEqual(before);
      const [bar, controls] = await scribble.boxes(tierList.zen.zenBar, scribble.controls);
      expect(controls.x).toBeGreaterThanOrEqual(bar.x + bar.width);
      expect(controls.y).toBeCloseTo(bar.y, 0);
    });

    test('renders the pen controls beside the Zen bar in the strip, with the frame where it was, when the layout is 16:9', async ({tierList}) => {
      const {scribble} = tierList;
      await tierList.zen.gotoInLayout(TANKS, LIST, '16:9');
      const before = await scribble.boxes(tierList.zen.zenBar, tierList.zen.zenFrame, tierList.tier('S'));

      await scribble.setScribble(true);

      expect(await scribble.boxes(tierList.zen.zenBar, tierList.zen.zenFrame, tierList.tier('S'))).toEqual(before);
      const [bar, frame, controls] = await scribble.boxes(tierList.zen.zenBar, tierList.zen.zenFrame, scribble.controls);
      expect(controls.x).toBeGreaterThanOrEqual(bar.x + bar.width);
      expect(controls.y + controls.height).toBeLessThanOrEqual(frame.y);
    });

    test.describe('narrow window', () => {
      test.use({viewport: {width: 480, height: 900}});

      test('renders the pen controls under the Zen bar, inside the window, and the list where it was, when the window is 480 px wide', async ({tierList}) => {
        const {scribble} = tierList;
        await tierList.goto(TANKS, LIST);
        await tierList.zen.setZenMode(true);
        const before = await scribble.boxes(tierList.zen.zenBar, tierList.title, tierList.tier('S'));

        await scribble.setScribble(true);

        expect(await scribble.boxes(tierList.zen.zenBar, tierList.title, tierList.tier('S'))).toEqual(before);
        const [bar, controls] = await scribble.boxes(tierList.zen.zenBar, scribble.controls);
        expect(controls.y).toBeGreaterThanOrEqual(bar.y + bar.height);
        expect(controls.x).toBeGreaterThanOrEqual(0);
        expect(controls.x + controls.width).toBeLessThanOrEqual(480);
      });
    });
  });

  test.describe('notes', () => {
    test('renders a note on the item when the user draws a circle on a tile', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);

      await scribble.drawCircleOn(tierList.item('Mauga'));

      await scribble.expectNotes(1);
      await expect(scribble.note('Note 1 on Mauga')).toBeVisible();
      expect(await scribble.overlapOf(scribble.note('Note 1 on Mauga'), tierList.item('Mauga'))).toBeGreaterThan(0.9);
      expect(await scribble.inkColoursOf(scribble.note('Note 1 on Mauga'))).toEqual([LIGHT_INK.Red]);
    });

    test('writes no history entry and no new address when the user draws and removes notes', async ({tierList, page}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      const address = page.url();
      const newEntries = await tierList.countNewHistoryEntries();

      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);
      await scribble.removeLastNote();
      await scribble.expectNotes(0);

      expect(page.url()).toBe(address);
      expect(await newEntries()).toBe(0);
    });

    test('renders notes on the row, on Unranked and on the frame when the user draws on a row, on the tray and beside the title', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);

      await scribble.drawTickAt(await scribble.pointIn(tierList.tier('F'), 0.7, 0.5));
      await scribble.drawTickAt(await scribble.pointIn(tierList.unranked, 0.7, 0.6));
      await scribble.drawTickAt(await scribble.pointIn(tierList.title, 0.6, 0.5));

      await scribble.expectNotes(3);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on row F', 'Note 2 on Unranked', 'Note 3 on the frame']);
    });

    test('renders one note of two strokes when the user draws a second stroke near the first', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);

      await scribble.drawTickAt(await scribble.pointIn(tierList.item('Mauga'), 1.2, 0.5));

      await expect.poll(() => scribble.strokeCountOf(scribble.note('Note 1 on Mauga'))).toBe(2);
      await scribble.expectNotes(1);
    });

    test('renders a second note when the user draws a stroke far from the first', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);

      await scribble.drawTickAt(await scribble.pointIn(tierList.item('Mauga'), 3, 0.5));

      await scribble.expectNotes(2);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga', 'Note 2 on row S']);
      expect(await scribble.strokeCountOf(scribble.note('Note 1 on Mauga'))).toBe(1);
    });

    test('renders the note on its tile in row B when the user moves the tile to row B', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);
      await scribble.setScribble(false);

      await tierList.drag.dragItemToTier('Mauga', 'B');

      await expect.poll(() => scribble.overlapOf(scribble.note('Note 1 on Mauga'), tierList.itemIn('B', 'Mauga'))).toBeGreaterThan(0.9);
    });

    test('renders the note on its tile when the user changes the layout to 16:9, 9:16 and back to Editor', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawCircleOn(tierList.item('Sigma'));
      await scribble.expectNotes(1);

      for (const layout of ['16:9', '9:16', 'Editor'] as const) {
        await tierList.zen.chooseLayout(layout);
        await expect.poll(() => scribble.overlapOf(scribble.note('Note 1 on Sigma'), tierList.item('Sigma')), {message: `Layout: ${layout}`}).toBeGreaterThan(0.9);
      }
    });

    test('renders no note for a hidden item, and the note again, when the user hides and unhides the queue', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawCircleOn(tierList.item('Orisa'));
      await scribble.expectNotes(1);
      await tierList.zen.chooseRankingOrder('In order');
      await expect(scribble.note('Note 1 on Orisa')).toBeVisible();

      await tierList.zen.setHideQueue(true);

      await expect(scribble.notes).toHaveCount(0);
      await scribble.expectNotes(1);

      await tierList.zen.setHideQueue(false);

      await expect(scribble.note('Note 1 on Orisa')).toBeVisible();
    });

    test('renders the notes without the newest one when the user presses "Remove last note", and none after "Clear scribbles"', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.drawCircleOn(tierList.item('Winston'));
      await scribble.drawCircleOn(tierList.item('Sigma'));
      await scribble.expectNotes(3);

      await scribble.removeLastNote();

      await scribble.expectNotes(2);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga', 'Note 2 on Winston']);

      await scribble.clear();

      await scribble.expectNotes(0);
      await expect(scribble.notes).toHaveCount(0);
    });

    test('renders no ink when the user exits Zen, and the note with the pen off when the user turns Zen on again', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);

      await tierList.zen.setZenMode(false);

      await expect(scribble.layer).toHaveCount(0);

      await tierList.zen.setZenMode(true);

      await scribble.expectNotes(1);
      await expect(scribble.note('Note 1 on Mauga')).toBeVisible();
      await scribble.expectScribble(false);
    });

    test('renders no note when the user reloads the page after drawing one', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);

      await tierList.reload();
      await tierList.zen.setZenMode(true);
      await scribble.setScribble(true);

      await scribble.expectNotes(0);
    });
  });

  test.describe('ink', () => {
    test('renders no ink level at 151 points left, and "Ink 30% left" when the user draws one more point', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);

      await scribble.draw(scribble.zigzagFrom(await scribble.pointIn(tierList.tier('B'), 0.3, 0.3), INK_SUPPLY - 151));

      await scribble.expectNotes(1);
      await expect(scribble.inkStatus).toHaveCount(0);

      await scribble.dotAt(await scribble.pointIn(tierList.unranked, 0.8, 0.6));

      await expect(scribble.inkStatus).toContainText('Ink 30% left');
      await scribble.expectNotes(2);
    });

    test('renders "Ink 18% left" with the level and (o_o;) when the user draws 410 of the 500 points', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);

      await scribble.draw(scribble.zigzagFrom(await scribble.pointIn(tierList.tier('B'), 0.3, 0.3), 410));

      await expect(scribble.inkStatus).toHaveText('Ink 18% left18%(o_o;)');
      expect(await scribble.controlNames()).toEqual(['Ink colour: Red', 'Remove last note', 'Clear scribbles']);
    });

    test('renders "Out of ink" with (x_x), the note and a disabled ink colour when the pen draws its last point, still pressed', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      const plain = await scribble.backgroundOf(scribble.removeLastNoteButton);

      await scribble.press(scribble.zigzagFrom(await scribble.pointIn(tierList.tier('B'), 0.3, 0.3), INK_SUPPLY + 20));

      await expect(scribble.inkStatus).toHaveText(`${OUT_OF_INK}Out of ink(x_x)`);
      await scribble.expectNotes(1);
      await expect(scribble.inkColourButton).toBeDisabled();
      await expect.poll(() => scribble.backgroundOf(scribble.removeLastNoteButton)).not.toBe(plain);
      await expect.poll(() => scribble.backgroundOf(scribble.clearButton)).not.toBe(plain);
      await scribble.lift();
    });

    test('renders no new note when the user draws out of ink, and a new note after "Remove last note"', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);
      await scribble.draw(scribble.zigzagFrom(await scribble.pointIn(tierList.tier('B'), 0.3, 0.3), INK_SUPPLY));
      await expect(scribble.inkStatus).toContainText(OUT_OF_INK);
      await scribble.expectNotes(2);

      await scribble.drawCircleOn(tierList.item('Sigma'));
      await scribble.removeLastNote();

      await scribble.expectNotes(1);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga']);
      await expect(scribble.inkStatus).toHaveCount(0);
      await expect(scribble.inkColourButton).toBeEnabled();

      await scribble.drawCircleOn(tierList.item('Sigma'));

      await scribble.expectNotes(2);
    });

    test('renders no ink level when the user presses "Clear scribbles" out of ink', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.draw(scribble.zigzagFrom(await scribble.pointIn(tierList.tier('B'), 0.3, 0.3), INK_SUPPLY));
      await expect(scribble.inkStatus).toContainText(OUT_OF_INK);

      await scribble.clear();

      await scribble.expectNotes(0);
      await expect(scribble.inkStatus).toHaveCount(0);
    });

    test('renders Red, Blue and Contrast in the ink colour menu, and a stroke in each colour, when the user chooses each one', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      expect(await scribble.inkTokens()).toEqual({dark: false, red: '#dc2626', blue: '#2563eb'});
      await expect(tierList.menuItems(await scribble.openInkColourMenu())).toHaveText(['Red', 'Blue', 'Contrast']);
      await tierList.closeMenus();
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);

      await scribble.chooseInkColour('Blue');
      await scribble.drawCircleOn(tierList.item('Winston'));
      await scribble.expectNotes(2);
      await scribble.chooseInkColour('Contrast');
      await scribble.drawCircleOn(tierList.item('Sigma'));
      await scribble.expectNotes(3);

      expect(await scribble.inkColoursOf(scribble.note('Note 1 on Mauga'))).toEqual([LIGHT_INK.Red]);
      expect(await scribble.inkColoursOf(scribble.note('Note 2 on Winston'))).toEqual([LIGHT_INK.Blue]);
      expect(await scribble.inkColoursOf(scribble.note('Note 3 on Sigma'))).toEqual([LIGHT_INK.Contrast]);
    });

    test.describe('dark mode', () => {
      test('renders the lighter red and blue, and Contrast in white, when the mode is dark', async ({tierList}) => {
        const {scribble} = tierList;
        await tierList.storeBeforeLoad('theme', 'dark');
        await scribble.gotoWithScribble(TANKS, LIST);
        expect(await scribble.inkTokens()).toEqual({dark: true, red: '#f87171', blue: '#60a5fa'});
        await scribble.drawCircleOn(tierList.item('Mauga'));
        await scribble.chooseInkColour('Blue');
        await scribble.drawCircleOn(tierList.item('Winston'));
        await scribble.chooseInkColour('Contrast');
        await scribble.drawCircleOn(tierList.item('Sigma'));
        await scribble.expectNotes(3);

        expect(await scribble.inkColoursOf(scribble.note('Note 1 on Mauga'))).toEqual([DARK_INK.Red]);
        expect(await scribble.inkColoursOf(scribble.note('Note 2 on Winston'))).toEqual([DARK_INK.Blue]);
        expect(await scribble.inkColoursOf(scribble.note('Note 3 on Sigma'))).toEqual([DARK_INK.Contrast]);
      });
    });
  });

  test.describe('dragging', () => {
    test('renders the item in its row and a note when the user drags on a tile with Scribble on', async ({tierList, page}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      const address = page.url();

      await scribble.pressOnItemAndMoveTo('Mauga', 'B');
      await scribble.lift();

      await scribble.expectNotes(1);
      await expect(tierList.itemIn('S', 'Mauga')).toBeVisible();
      await expect(tierList.itemsIn('B')).toHaveCount(0);
      expect(page.url()).toBe(address);
    });

    test('writes 1 history entry when the user drags an item to row B with Scribble off and a note on the list', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawCircleOn(tierList.item('Winston'));
      await scribble.expectNotes(1);
      await scribble.setScribble(false);
      const newEntries = await tierList.countNewHistoryEntries();

      await tierList.drag.dragItemToTier('Mauga', 'B');

      expect(await newEntries()).toBe(1);
      await expect(tierList.itemsIn('B')).toHaveText(['Mauga']);
      await scribble.expectNotes(1);
    });
  });

  test.describe('model', () => {
    const scribbleSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      const {scribble} = tierList;
      let address = '';
      let entries = 0;
      let onScreen: ScribbleSnapshot | null = null;
      const drawNote = async () => {
        if (!onScreen) throw new Error('No state was checked yet');
        const target = notesIn(onScreen) === 0 ? tierList.item('Mauga') : tierList.item('Orisa');
        await scribble.drawCircleOn(target);
      };
      return modelSut<ScribbleSnapshot, ScribbleEvent>(page, {
        reset: async () => {
          onScreen = null;
          await tierList.goto(TANKS, LIST);
          address = page.url();
          entries = await tierList.historyLength();
        },
        events: {
          TOGGLE_ZEN: () => tierList.zen.setZenMode(true),
          EXIT_ZEN: () => tierList.zen.setZenMode(false),
          PRESS_ESCAPE: () => tierList.pressEscapeOnList(),
          PRESS_SCRIBBLE: () => scribble.pressToggle(),
          PRESS_D: () => scribble.pressScribbleKeyOnList(),
          DRAW_NOTE: drawNote,
          REMOVE_LAST_NOTE: () => scribble.removeLastNote(),
          CLEAR: () => scribble.clear(),
        },
        states: {
          '*': async (_page, snapshot) => {
            onScreen = snapshot;
            const pen = penOf(snapshot);
            const count = notesIn(snapshot);
            await expect(page).toHaveURL(address);
            expect(await tierList.historyLength(), 'ink should add no history entry').toBe(entries);
            if (pen === 'zenOff') {
              await expect(tierList.zen.zenBar).toHaveCount(0);
              await expect(scribble.layer).toHaveCount(0);
              return;
            }
            await scribble.expectScribble(pen === 'penOn');
            if (pen === 'penOff' && count === 0) {
              await expect(scribble.layer).toHaveCount(0);
              return;
            }
            await scribble.expectNotes(count);
            await expect(scribble.notes).toHaveCount(count);
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(scribbleModel)) {
      test(`renders each state of the Scribble machine when the user walks every transition (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(scribbleModel, scribbleSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, scribbleModel, coverage, part);
      });
    }
  });
});
