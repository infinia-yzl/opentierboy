import type {Page, TestInfo} from '@playwright/test';
import {modelSut} from '../support/model-sut';
import {expect, test} from '../support/test';
import type {TierListPage} from '../pages/tier-list-page';
import {INK_SUPPLY, type Rgb} from '../pages/scribble';
import INK_FIXTURES from '../fixtures/scribble/ink-v1.json';
import {circleNoteOn, inkNoteCount, inkValue, rankingState, rawInk} from '../support/links';
import {pngFile, snapshotTextOf} from '../support/snapshot-files';
import {attachCoverage, MODEL_PART_TIMEOUT, walkModel, walkParts} from '../support/machines';
import {notesIn, penOf, scribbleModel, type ScribbleEvent, type ScribbleSnapshot} from '../models/scribble';
import {inkHistoryModel, inkHistoryViewOf, type InkHistoryEvent, type InkHistorySnapshot} from '../models/ink-history';
import {INK_NAMES, inkOf, inkOverPicturesModel, PICTURE_LOOKS, strokesIn, type InkOverPicturesEvent, type InkOverPicturesSnapshot, type PictureLook} from '../models/ink-over-pictures';
import type {Point} from '../pages/helpers';

const TANKS = '/rank/overwatch/tank';
const LIST = rankingState('image-overwatch', {S: ['Mauga'], C: ['Winston'], '': ['Sigma', 'Orisa']});
const INK_SUPPLY_TEXT = (points: number) => `~f.r${'gf'.repeat(points)}`;
const MAUGA_AND_SIGMA = inkValue([circleNoteOn('image-overwatch', 'Mauga'), circleNoteOn('image-overwatch', 'Sigma', 'blue')]);
const OUT_OF_INK = 'Out of ink. Remove a note to get ink back.';
const LIGHT_INK = {Red: 'rgb(220, 38, 38)', Blue: 'rgb(37, 99, 235)', Contrast: 'rgb(12, 17, 67)'};
const DARK_INK = {Red: 'rgb(248, 113, 113)', Blue: 'rgb(96, 165, 250)', Contrast: 'rgb(255, 255, 255)'};

const SAMPLES = [2, 5, 7, 9, 12];
const NEAR = 10;
const lumOf = ([r, g, b]: Rgb) => 0.3 * r + 0.59 * g + 0.11 * b;
const columnsWhere = (before: Rgb[][], after: Rgb[][], holds: (was: Rgb, now: Rgb) => boolean) =>
  before.filter((column, index) => column.some((was, row) => holds(was, after[index][row]))).length;
const isNegative = (was: Rgb, now: Rgb) => was.every((value, channel) => Math.abs(now[channel] - (255 - value)) <= NEAR);
const HUE_NEAR = 15;
const hueOf = ([r, g, b]: Rgb): number | null => {
  const max = Math.max(r, g, b);
  const spread = max - Math.min(r, g, b);
  if (spread < 8) return null;
  const sixth = max === r ? ((g - b) / spread) % 6 : max === g ? (b - r) / spread + 2 : (r - g) / spread + 4;
  return (sixth * 60 + 360) % 360;
};
const rgbOf = (colour: string): Rgb => {
  const [r, g, b] = colour.match(/\d+/g)!.map(Number);
  return [r, g, b];
};
const isReversedWithHueOf = (colour: string) => (was: Rgb, now: Rgb) => {
  const hue = hueOf(now);
  const lum = lumOf(now);
  const turn = hue === null ? 0 : Math.abs(hue - hueOf(rgbOf(colour))!);
  const hueFits = hue === null ? lum < 16 || lum > 239 : Math.min(turn, 360 - turn) <= HUE_NEAR;
  return Math.abs(lum - (255 - lumOf(was))) <= NEAR && hueFits;
};
const isReversedRed = isReversedWithHueOf(LIGHT_INK.Red);
const isColour = (colour: string) => (_: Rgb, now: Rgb) => `rgb(${now.join(', ')})` === colour;
const isReversedBlue = isReversedWithHueOf(LIGHT_INK.Blue);
const seen = (before: Rgb[][], after: Rgb[][]) =>
  `pixels at the stroke's centre line, before the stroke ${JSON.stringify(before.map((column) => column[1]))}, with it ${JSON.stringify(after.map((column) => column[1]))}`;
const PICTURE_CHECKS: Readonly<Record<PictureLook, (was: Rgb, now: Rgb) => boolean>> = {
  'reversed with a red hue': isReversedRed,
  'reversed with a blue hue': isReversedBlue,
  'the plain negative': isNegative,
};

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

    test('renders the toolbar "Scribble" when the user presses D down and the key repeats three times', async ({tierList}) => {
      const {scribble} = tierList;
      await tierList.goto(TANKS, LIST);
      await tierList.zen.setZenMode(true);

      await scribble.holdScribbleKey();

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

    test('renders the note at the same place and size on its tile when the tiles are Compact with labels on and off, and in 16:9', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, LIST, inkValue([circleNoteOn('image-overwatch', 'Mauga')]));
      const note = scribble.note('Note 1 on Mauga');
      await expect(note).toBeVisible();
      const place = await scribble.placeOnTile(note, 'Mauga');
      expect(place.width).toBeGreaterThan(0.75);
      expect(place.width).toBeLessThan(0.9);

      await tierList.rows.chooseTileSize('Compact');
      await scribble.expectPlaceOnTile(note, 'Mauga', place, 'Compact, labels off');
      await tierList.rows.setItemLabelsVisible(true);
      await scribble.expectCaptionUnder('Mauga');
      await scribble.expectPlaceOnTile(note, 'Mauga', place, 'Compact, labels on');
      await tierList.zen.setZenMode(true);
      await scribble.expectPlaceOnTile(note, 'Mauga', place, 'Zen, Compact, labels on');
      await tierList.zen.chooseLayout('16:9');
      await scribble.expectPlaceOnTile(note, 'Mauga', place, 'Layout: 16:9');
      await tierList.zen.chooseLayout('Editor');
      await scribble.expectCaptionUnder('Mauga');
      await scribble.expectPlaceOnTile(note, 'Mauga', place, 'Layout: Editor again');
    });

    test('renders no note for a deleted item, with its ink in the address, and the note again when the user presses Undo', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, LIST, MAUGA_AND_SIGMA);
      await scribble.expectNotes(2);

      await tierList.items.deleteItem('Mauga');

      await expect.poll(() => scribble.noteNames()).toEqual(['Note 2 on Sigma']);
      await scribble.expectNotes(2);
      expect(scribble.inkInAddress()).toBe(MAUGA_AND_SIGMA);

      await tierList.items.undoInToast('Item deleted');

      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga', 'Note 2 on Sigma']);
      await expect.poll(() => scribble.overlapOf(scribble.note('Note 1 on Mauga'), tierList.item('Mauga'))).toBeGreaterThan(0.9);
      expect(scribble.inkInAddress()).toBe(MAUGA_AND_SIGMA);
    });

    test('renders the other note alone when the user presses "Remove last note" and the newest note is on a deleted item', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, LIST, MAUGA_AND_SIGMA);
      await tierList.items.deleteItem('Sigma');
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga']);
      await scribble.expectNotes(2);
      await tierList.zen.setZenMode(true);
      await scribble.setScribble(true);

      await scribble.removeLastNote();

      await scribble.expectNotes(1);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga']);
    });

    test('renders a note on its tile and a note on the frame when the user draws in the layout "Overlay · green key"', async ({tierList}) => {
      const {scribble} = tierList;
      await tierList.zen.gotoInLayout(TANKS, LIST, 'Overlay · green key');
      await scribble.setScribble(true);

      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);
      await scribble.drawTickAt(await scribble.pointIn(tierList.zen.zenFrame, 0.2, 0.5));

      await scribble.expectNotes(2);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga', 'Note 2 on the frame']);
      await expect.poll(() => scribble.overlapOf(scribble.note('Note 1 on Mauga'), tierList.item('Mauga'))).toBeGreaterThan(0.9);
    });

    test('renders one note for a stroke of a touch pointer and one more for a stroke of a pen pointer when each draws', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);

      await scribble.strokeWithPointer('touch', await scribble.tickPointsAt(tierList.tier('B'), 0.3, 0.5));
      await scribble.expectNotes(1);
      await scribble.strokeWithPointer('pen', await scribble.tickPointsAt(tierList.tier('F'), 0.7, 0.5));

      await scribble.expectNotes(2);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on row B', 'Note 2 on row F']);
    });

    test('renders the stroke as a note that grows no more when the pointer is cancelled in the middle of the stroke', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);

      await scribble.strokeWithPointer('touch', await scribble.tickPointsAt(tierList.tier('B'), 0.3, 0.5), 'pointercancel');

      await scribble.expectNotes(1);
      const [cancelled] = await scribble.boxes(scribble.note('Note 1 on row B'));
      await scribble.movePointerAfterStroke('touch', await scribble.pointIn(tierList.tier('B'), 0.6, 0.5));
      await scribble.drawTickAt(await scribble.pointIn(tierList.tier('F'), 0.7, 0.5));
      await scribble.expectNotes(2);
      expect(await scribble.boxes(scribble.note('Note 1 on row B'))).toEqual([cancelled]);
    });

    test('renders the note read only when the user exits Zen, and the note with the pen off when the user turns Zen on again', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);

      await tierList.zen.setZenMode(false);

      await scribble.expectNotes(1);
      await expect(scribble.controls).toHaveCount(0);
      await expect.poll(() => scribble.overlapOf(scribble.note('Note 1 on Mauga'), tierList.item('Mauga'))).toBeGreaterThan(0.9);

      await tierList.zen.setZenMode(true);

      await scribble.expectNotes(1);
      await expect(scribble.note('Note 1 on Mauga')).toBeVisible();
      await scribble.expectScribble(false);
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

    test.describe('over pictures', () => {
      test('renders the negative of the picture under the stroke when Contrast ink crosses an item', async ({tierList}) => {
        const {scribble} = tierList;
        await scribble.gotoWithScribble(TANKS, LIST);
        await scribble.chooseInkColour('Contrast');
        await scribble.expectPictureLoaded(tierList.item('Mauga'));
        const line = await scribble.lineAcross(tierList.item('Mauga'));
        const samples = SAMPLES.map((index) => line[index]);
        const before = await scribble.settledPixelColumnsAt(samples);

        await scribble.draw(line);
        await scribble.expectNotes(1);

        const after = await scribble.pixelColumnsAt(samples);
        expect(columnsWhere(before, after, isNegative), `${seen(before, after)}; ${await scribble.paintLayerFacts()}`).toBe(SAMPLES.length);
      });

      test('renders the picture with reversed brightness and a red tint under the stroke when Red ink crosses an item', async ({tierList}) => {
        const {scribble} = tierList;
        await scribble.gotoWithScribble(TANKS, LIST);
        await scribble.expectPictureLoaded(tierList.item('Mauga'));
        const line = await scribble.lineAcross(tierList.item('Mauga'));
        const samples = SAMPLES.map((index) => line[index]);
        const before = await scribble.settledPixelColumnsAt(samples);

        await scribble.draw(line);
        await scribble.expectNotes(1);

        const after = await scribble.pixelColumnsAt(samples);
        expect(columnsWhere(before, after, isReversedRed), `${seen(before, after)}; ${await scribble.paintLayerFacts()}`).toBe(SAMPLES.length);
      });

      test('renders solid red ink over the picture when the user draws across an item with the pen still pressed', async ({tierList}) => {
        const {scribble} = tierList;
        await scribble.gotoWithScribble(TANKS, LIST);
        await scribble.expectPictureLoaded(tierList.item('Mauga'));
        const line = await scribble.lineAcross(tierList.item('Mauga'));
        const samples = SAMPLES.map((index) => line[index]);
        const before = await scribble.settledPixelColumnsAt(samples);

        await scribble.press(line);

        const pressed = await scribble.pixelColumnsAt(samples);
        expect(columnsWhere(before, pressed, isColour(LIGHT_INK.Red)), seen(before, pressed)).toBe(SAMPLES.length);
        await scribble.lift();
        await scribble.expectNotes(1);
      });

      test('renders the picture as before when the user removes the note that crossed it', async ({tierList}) => {
        const {scribble} = tierList;
        await scribble.gotoWithScribble(TANKS, LIST);
        await scribble.expectPictureLoaded(tierList.item('Mauga'));
        const line = await scribble.lineAcross(tierList.item('Mauga'));
        const samples = SAMPLES.map((index) => line[index]);
        const before = await scribble.settledPixelColumnsAt(samples);
        await scribble.draw(line);
        await scribble.expectNotes(1);
        await expect.poll(async () => columnsWhere(before, await scribble.pixelColumnsAt(samples), isReversedRed),
          {message: 'the sample points where the picture shows ink before the note goes'}).toBe(SAMPLES.length);

        await scribble.removeLastNote();
        await scribble.expectNotes(0);

        await expect.poll(() => scribble.pixelColumnsAt(samples), {message: 'the picture should show as it loaded'}).toEqual(before);
      });

      test('renders solid red ink when the stroke crosses an empty row', async ({tierList}) => {
        const {scribble} = tierList;
        await scribble.gotoWithScribble(TANKS, LIST);
        const line = await scribble.lineAcross(tierList.tier('B'), 0.6);
        const samples = SAMPLES.map((index) => line[index]);
        const before = await scribble.settledPixelColumnsAt(samples);

        await scribble.draw(line);
        await scribble.expectNotes(1);

        const after = await scribble.pixelColumnsAt(samples);
        expect(columnsWhere(before, after, isColour(LIGHT_INK.Red)), `${seen(before, after)}; ${await scribble.paintLayerFacts()}`).toBe(SAMPLES.length);
      });
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
      await expect(page).toHaveURL(`${address}&ink=${scribble.inkInAddress()}`);
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

  test.describe('link', () => {
    const TWO_NOTES = inkValue([circleNoteOn('image-overwatch', 'Mauga'), circleNoteOn('image-overwatch', 'Sigma', 'blue')]);

    test('writes the ink value "1." beside the unchanged state value when the user draws a note', async ({tierList, page}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);

      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);

      expect(scribble.stateInAddress()).toBe(LIST);
      expect(scribble.inkInAddress()).toMatch(/^1\.[A-Za-z0-9+$-]+$/);
      await expect(page).toHaveURL(new RegExp(`^[^?]*\\?state=[^&]+&ink=1\\.[^&]+$`));
    });

    test('writes the ink value alone when the user draws on a template page without a state value', async ({tierList, page}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS);

      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);

      await expect(page).toHaveURL(new RegExp(`${TANKS}\\?ink=1\\.[^&]+$`));
      await tierList.reload();
      await scribble.expectNotes(1);
      await expect(tierList.itemIn(tierList.unranked, 'Mauga')).toBeVisible();
    });

    test('renders the note on its tile, read only, when the user reloads the page after drawing', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);

      await tierList.reload();

      await scribble.expectNotes(1);
      await expect(tierList.zen.zenBar).toHaveCount(0);
      await expect(scribble.controls).toHaveCount(0);
      await expect.poll(() => scribble.overlapOf(scribble.note('Note 1 on Mauga'), tierList.item('Mauga'))).toBeGreaterThan(0.9);
    });

    test('renders the notes of the link in the editor when a visitor opens the address of a list with scribbles', async ({tierList, page, openAsVisitor}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await scribble.chooseInkColour('Blue');
      await scribble.drawCircleOn(tierList.item('Sigma'));
      await scribble.expectNotes(2);

      const friend = await openAsVisitor(page.url());

      await friend.scribble.expectNotes(2);
      await expect.poll(() => friend.scribble.noteNames()).toEqual(['Note 1 on Mauga', 'Note 2 on Sigma']);
      expect(await friend.scribble.inkColoursOf(friend.scribble.note('Note 2 on Sigma'))).toEqual([LIGHT_INK.Blue]);
      await expect.poll(() => friend.scribble.overlapOf(friend.scribble.note('Note 1 on Mauga'), friend.item('Mauga'))).toBeGreaterThan(0.9);
    });

    test('renders the note on its tile in row B and the same ink value when the user drags the tile outside Zen', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, LIST, TWO_NOTES);
      await scribble.expectNotes(2);

      await tierList.drag.dragItemToTier('Mauga', 'B');

      expect(scribble.inkInAddress()).toBe(TWO_NOTES);
      expect(scribble.stateInAddress()).not.toBe(LIST);
      await scribble.expectNotes(2);
      await expect.poll(() => scribble.overlapOf(scribble.note('Note 1 on Mauga'), tierList.itemIn('B', 'Mauga'))).toBeGreaterThan(0.9);
    });

    test('renders the same ink value in the address when the user changes the label position', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, LIST, TWO_NOTES);
      await scribble.expectNotes(2);

      await tierList.rows.chooseLabelPosition('Top');

      expect(scribble.inkInAddress()).toBe(TWO_NOTES);
      await expect.poll(() => scribble.overlapOf(scribble.note('Note 1 on Mauga'), tierList.item('Mauga'))).toBeGreaterThan(0.9);
    });

    test('renders notes on two items, on row B, on Unranked and on the frame when the page opens a golden ink value', async ({tierList}) => {
      const {scribble} = tierList;
      const golden = (INK_FIXTURES as {id: string; ink: string}[]).find((entry) => entry.id === 'ink-v1-overwatch-tank-items')!;

      await scribble.gotoWithInk(TANKS, LIST, golden.ink);

      await scribble.expectNotes(5);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga', 'Note 2 on Winston', 'Note 3 on row B', 'Note 4 on Unranked', 'Note 5 on the frame']);
      expect(await scribble.inkColoursOf(scribble.note('Note 2 on Winston'))).toEqual([LIGHT_INK.Blue]);
      expect(await scribble.inkColoursOf(scribble.note('Note 3 on row B'))).toEqual([LIGHT_INK.Red, LIGHT_INK.Contrast]);
      await expect.poll(() => scribble.overlapOf(scribble.note('Note 2 on Winston'), tierList.item('Winston'))).toBeGreaterThan(0.9);
      await expect.poll(() => scribble.overlapOf(scribble.note('Note 3 on row B'), tierList.tier('B'))).toBeGreaterThan(0.9);
    });

    test.describe('text after the ink value', () => {
      const INK = inkValue([circleNoteOn('image-overwatch', 'Mauga')]);
      const TAIL = encodeURIComponent(') [x](https://evil.example) @everyone\n# hi&foo=bar#frag');
      const CANONICAL = /^1\.[A-Za-z0-9+$-]+$/;
      const addressParts = (address: string) => {
        const url = new URL(address);
        return {names: [...url.searchParams.keys()], hash: url.hash};
      };

      test('renders the notes and the address as opened when the link has text after its ink value', async ({tierList, page}) => {
        const {scribble} = tierList;

        await tierList.goto(`${TANKS}?state=${LIST}&ink=${INK}${TAIL}`);
        const opened = page.url();
        const entries = await tierList.historyLength();

        await scribble.expectNotes(1);
        await expect.poll(() => scribble.overlapOf(scribble.note('Note 1 on Mauga'), tierList.item('Mauga'))).toBeGreaterThan(0.9);
        expect(opened).toContain('evil.example');
        expect(page.url()).toBe(opened);
        expect(await tierList.historyLength()).toBe(entries);
      });

      test('writes the ink value alone, with no other parameter or fragment, when the user moves an item on such a link', async ({tierList, page}) => {
        const {scribble} = tierList;
        await tierList.goto(`${TANKS}?state=${LIST}&ink=${INK}${TAIL}`);
        await scribble.expectNotes(1);

        await tierList.drag.dragItemToTier('Winston', 'B');

        expect(scribble.inkInAddress()).toBe(INK);
        expect(addressParts(page.url())).toEqual({names: ['state', 'ink'], hash: ''});
        expect(page.url()).not.toContain('evil');
        await scribble.expectNotes(1);
      });

      test('writes the ink value alone when the user changes the label position, and when the user draws, on such a link', async ({tierList, page}) => {
        const {scribble} = tierList;
        await tierList.goto(`${TANKS}?state=${LIST}&ink=${INK}${TAIL}`);
        await scribble.expectNotes(1);

        await tierList.rows.chooseLabelPosition('Top');

        expect(scribble.inkInAddress()).toBe(INK);
        expect(addressParts(page.url())).toEqual({names: ['state', 'ink'], hash: ''});

        await scribble.gotoWithInk(TANKS, LIST, `${INK}${TAIL}`);
        await tierList.zen.setZenMode(true);
        await scribble.setScribble(true);
        await scribble.drawNoteAndWaitForInk(tierList.item('Sigma'), 2);

        expect(scribble.inkInAddress()).toMatch(CANONICAL);
        expect(addressParts(page.url())).toEqual({names: ['state', 'ink'], hash: ''});
        expect(page.url()).not.toContain('evil');
      });
    });

    test('renders "Ink 18% left" when the page opens a link with 410 points of ink and the user turns Scribble on', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, LIST, rawInk(INK_SUPPLY_TEXT(410)));
      await scribble.expectNotes(1);

      await tierList.zen.setZenMode(true);
      await scribble.setScribble(true);

      await expect(scribble.inkStatus).toContainText('Ink 18% left');
    });

    test('renders og:image without the ink value when the page opens a link with scribbles', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, LIST, TWO_NOTES);
      await scribble.expectNotes(2);

      await expect(tierList.metaTag('og:image')).toHaveAttribute('content', /\/api\/og\?state=[^&]+$/);
    });

    test('writes the list without the ink value to Recently viewed when the page opens a link with scribbles', async ({tierList, site}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, rankingState('image-overwatch', {S: ['Mauga']}, 'Tanks with notes'), TWO_NOTES);
      await scribble.expectNotes(2);

      await tierList.leaveForHome();

      await expect(site.recentLink('Tanks with notes')).toHaveAttribute('href', /^\/rank\/overwatch\/tank\?state=[^&]+$/);
    });

    test('renders the URL length warning when the address with the ink value has more than 2,000 characters', async ({tierList}) => {
      const {scribble} = tierList;
      const digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-';
      const words = Array.from({length: 300}, (_, index) => ((index * 7919 + 13) % 9973).toString(36)).join(' ');
      const state = rankingState('image-overwatch', {S: ['Mauga']}, words);
      const steps = Array.from({length: INK_SUPPLY}, (_, index) => digits[(index * index * 31 + 7) % 63] + digits[(index * index * 17 + index * 5 + 3) % 63]);
      const ink = rawInk(`~f.r${steps.join('')}`);
      const withoutInk = `${TANKS}?state=${state}`;
      expect(withoutInk.length).toBeLessThanOrEqual(2000);
      expect(`${withoutInk}&ink=${ink}`.length).toBeGreaterThan(2000);

      await tierList.goto(TANKS, state);
      await expect(tierList.itemIn('S', 'Mauga')).toBeVisible();
      await expect(scribble.urlLengthWarning).toHaveCount(0);

      await scribble.gotoWithInk(TANKS, state, ink);

      await scribble.expectNotes(1);
      await expect(scribble.urlLengthWarning).toBeVisible();
    });

    test('renders the list of a snapshot file without the scribbles of the list before when the user opens the file', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, LIST, TWO_NOTES);
      await scribble.expectNotes(2);
      await tierList.share.capturePreview();
      const file = await tierList.share.downloadCapturedImage();
      const payload = JSON.parse(snapshotTextOf(file.buffer) ?? 'null') as Record<string, unknown>;
      expect(Object.keys(payload).sort()).toEqual(['images', 'path', 'state', 'version']);
      expect(JSON.stringify(payload)).not.toContain(TWO_NOTES);
      await tierList.share.closeSharePanelWithShareButton();
      await tierList.drag.dragItemToTier('Mauga', 'B');
      expect(scribble.inkInAddress()).toBe(TWO_NOTES);

      await tierList.files.openFile(pngFile(file.name, file.buffer));
      await tierList.files.confirmOpenList();

      await expect(tierList.itemIn('S', 'Mauga')).toBeVisible();
      await expect(scribble.layer).toHaveCount(0);
      expect(scribble.inkInAddress()).toBeNull();

      await tierList.goBack();

      await scribble.expectNotes(2);
    });
  });

  test.describe('unreadable ink', () => {
    const NOTICE = 'The scribbles in this link could not be shown.';
    const BAD_INK = [
      ['another version', rawInk('~f.rff', '2')],
      ['data that is not lz-string', '1.this-is-not-ink'],
      ['text of 150,004 characters in a short value', rawInk(INK_SUPPLY_TEXT(75_000))],
      ['one point more than the ink supply', rawInk(INK_SUPPLY_TEXT(INK_SUPPLY + 1))],
      ['an anchor outside the format', rawInk('~x.rff')],
      ['markup in the place of a colour', rawInk('~f.<svg onload=alert(1)>')],
    ] as const;

    for (const [name, ink] of BAD_INK) {
      test(`renders the list, no ink and the notice about the scribbles when the ink value has ${name}`, async ({tierList}) => {
        const {scribble} = tierList;

        await scribble.gotoWithInk(TANKS, LIST, ink);

        await expect(scribble.inkNotice).toHaveText(NOTICE);
        await expect(tierList.itemIn('S', 'Mauga')).toBeVisible();
        await expect(tierList.itemsIn(tierList.unranked)).toHaveText(['Sigma', 'Orisa']);
        await expect(scribble.layer).toHaveCount(0);
      });
    }

    test('writes the address without the ink value when the user changes the list of a link with unreadable ink', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, LIST, '1.this-is-not-ink');
      await expect(scribble.inkNotice).toBeVisible();

      await tierList.drag.dragItemToTier('Mauga', 'B');

      expect(scribble.inkInAddress()).toBeNull();
      await expect(scribble.inkNotice).toHaveCount(0);

      await tierList.goBack();

      await expect(scribble.inkNotice).toBeVisible();
      expect(scribble.inkInAddress()).toBe('1.this-is-not-ink');
    });

    test('writes the address without the ink value when the user changes the label position of a link with unreadable ink', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, LIST, '1.this-is-not-ink');
      await expect(scribble.inkNotice).toBeVisible();

      await tierList.rows.chooseLabelPosition('Top');

      expect(scribble.inkInAddress()).toBeNull();
      await expect(scribble.inkNotice).toHaveCount(0);
    });

    test('writes the new ink in place of the unreadable value, with a full pen, when the user draws', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithInk(TANKS, LIST, rawInk(INK_SUPPLY_TEXT(INK_SUPPLY + 1)));
      await expect(scribble.inkNotice).toBeVisible();
      await tierList.zen.setZenMode(true);
      await scribble.setScribble(true);
      await expect(scribble.inkStatus).toHaveCount(0);

      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);

      expect(scribble.inkInAddress()).toMatch(/^1\./);
      await tierList.zen.setZenMode(false);
      await expect(scribble.inkNotice).toHaveCount(0);
      await scribble.expectNotes(1);
    });

    test('renders no share group and no "Copy link" when the ink of the link is unreadable', async ({tierList}) => {
      const {scribble} = tierList;
      await tierList.share.readCopiedText();
      await scribble.gotoWithInk(TANKS, LIST, '1.this-is-not-ink');
      await expect(scribble.inkNotice).toBeVisible();

      await tierList.share.copyMarkdown();

      await expect(tierList.share.scribblesGroup).toHaveCount(0);
      await expect(tierList.share.copyLinkButton).toHaveCount(0);
      expect(await tierList.share.copiedLink()).not.toContain('ink=');
    });
  });

  test.describe('history', () => {
    test('writes 1 history entry and step 2 / 2 when the user draws three notes in a row', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      const newEntries = await tierList.countNewHistoryEntries();

      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await scribble.drawNoteAndWaitForInk(tierList.item('Winston'), 2);
      await scribble.drawNoteAndWaitForInk(tierList.item('Sigma'), 3);

      expect(await newEntries()).toBe(1);
      await expect(tierList.zen.zenStepCount).toHaveText('2 / 2');
    });

    test('writes no history entry when the user presses "Remove last note" and "Clear scribbles" in the run that drew the notes', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      const newEntries = await tierList.countNewHistoryEntries();
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await scribble.drawNoteAndWaitForInk(tierList.item('Winston'), 2);

      await scribble.removeLastNote();
      await scribble.expectNotes(1);
      expect(scribble.inkInAddress()).toMatch(/^1\./);
      await scribble.clear();
      await scribble.expectNotes(0);

      expect(scribble.inkInAddress()).toBeNull();
      expect(await newEntries()).toBe(1);
      await expect(tierList.zen.zenStepCount).toHaveText('2 / 2');
    });

    test('renders no note when the user goes Back from a run of three notes, and the three notes when the user goes Forward', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await scribble.drawNoteAndWaitForInk(tierList.item('Winston'), 2);
      await scribble.drawNoteAndWaitForInk(tierList.item('Sigma'), 3);

      await tierList.zen.stepInZenBar('Back');

      await scribble.expectNotes(0);
      expect(scribble.inkInAddress()).toBeNull();
      await expect(tierList.zen.zenStepCount).toHaveText('1 / 2');

      await tierList.zen.stepInZenBar('Forward');

      await scribble.expectNotes(3);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga', 'Note 2 on Winston', 'Note 3 on Sigma']);
    });

    test('writes 3 history entries, one for each run and one for the drop, when the user moves an item between two runs', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      const newEntries = await tierList.countNewHistoryEntries();
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await scribble.setScribble(false);
      await tierList.drag.dragItemToTier('Winston', 'B');
      await scribble.setScribble(true);

      await scribble.drawNoteAndWaitForInk(tierList.item('Sigma'), 2);
      await scribble.drawNoteAndWaitForInk(tierList.tierLabel('F'), 3);

      expect(await newEntries()).toBe(3);
      await expect(tierList.zen.zenStepCount).toHaveText('4 / 4');

      await tierList.zen.stepInZenBar('Back');
      await scribble.expectNotes(1);
      await expect(tierList.itemIn('B', 'Winston')).toBeVisible();

      await tierList.zen.stepInZenBar('Back');
      await scribble.expectNotes(1);
      await expect(tierList.itemIn('C', 'Winston')).toBeVisible();

      await tierList.zen.stepInZenBar('Back');
      await scribble.expectNotes(0);
      await expect(tierList.zen.zenStepCount).toHaveText('1 / 4');
    });

    test('writes 1 new history entry in place of the entries ahead when the user draws after Back', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await scribble.setScribble(false);
      await tierList.drag.dragItemToTier('Winston', 'B');
      await expect(tierList.zen.zenStepCount).toHaveText('3 / 3');
      await tierList.zen.stepInZenBar('Back');
      await expect(tierList.zen.zenStepCount).toHaveText('2 / 3');
      await scribble.setScribble(true);

      await scribble.drawNoteAndWaitForInk(tierList.item('Sigma'), 2);

      await expect(tierList.zen.zenStepCount).toHaveText('3 / 3');
      await expect(tierList.itemIn('C', 'Winston')).toBeVisible();
      await tierList.zen.stepInZenBar('Back');
      await scribble.expectNotes(1);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga']);
    });

    test('writes 1 new history entry when the user draws after a reload', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await tierList.reload();
      await tierList.zen.setZenMode(true);
      await scribble.setScribble(true);
      await expect(tierList.zen.zenStepCount).toHaveText('2 / 2');
      const newEntries = await tierList.countNewHistoryEntries();

      await scribble.drawNoteAndWaitForInk(tierList.item('Sigma'), 2);
      await scribble.drawNoteAndWaitForInk(tierList.tierLabel('F'), 3);

      expect(await newEntries()).toBe(1);
      await expect(tierList.zen.zenStepCount).toHaveText('3 / 3');
    });

    test('writes 1 new history entry when the user draws after Back and Forward over a run', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await tierList.zen.stepInZenBar('Back');
      await scribble.expectNotes(0);
      await tierList.zen.stepInZenBar('Forward');
      await scribble.expectNotes(1);
      const newEntries = await tierList.countNewHistoryEntries();

      await scribble.drawNoteAndWaitForInk(tierList.item('Sigma'), 2);

      expect(await newEntries()).toBe(1);
      await expect(tierList.zen.zenStepCount).toHaveText('3 / 3');
      await tierList.zen.stepInZenBar('Back');
      await scribble.expectNotes(1);
    });

    test('writes 1 history entry, with the notes one Back away, when the user presses "Clear scribbles" after a list change', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await scribble.setScribble(false);
      await tierList.drag.dragItemToTier('Winston', 'B');
      await scribble.setScribble(true);
      const newEntries = await tierList.countNewHistoryEntries();

      await scribble.clear();
      await scribble.expectNotes(0);

      expect(await newEntries()).toBe(1);
      await tierList.zen.stepInZenBar('Back');
      await scribble.expectNotes(1);
      await expect(tierList.itemIn('B', 'Winston')).toBeVisible();
    });

    test('writes 1 history entry for both notes when the user changes the label position between two notes', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      const newEntries = await tierList.countNewHistoryEntries();
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await tierList.zen.setZenMode(false);
      await tierList.rows.chooseLabelPosition('Top');
      await tierList.zen.setZenMode(true);
      await scribble.setScribble(true);

      await scribble.drawNoteAndWaitForInk(tierList.item('Sigma'), 2);

      expect(await newEntries()).toBe(1);
    });
  });

  test.describe('refused history write', () => {
    test.beforeEach(async ({tierList}) => {
      await tierList.scribble.prepareInkWriteRefusals();
    });

    test('renders the note and writes it with the next note when the browser refuses one history write', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.refuseNextInkWrite();

      await scribble.drawCircleOn(tierList.item('Mauga'));

      await scribble.expectNotes(1);
      expect(scribble.inkInAddress()).toBeNull();

      await scribble.drawNoteAndWaitForInk(tierList.item('Sigma'), 2);
      await tierList.reload();

      await scribble.expectNotes(2);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga', 'Note 2 on Sigma']);
    });

    test('writes the note to the address when the user turns Scribble off after the browser refused one history write', async ({tierList, page}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.refuseNextInkWrite();
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);

      await scribble.setScribble(false);

      await expect(page).toHaveURL(/[?&]ink=1\./);
      await tierList.reload();
      await scribble.expectNotes(1);
    });

    test('renders the list of a snapshot file without the unsaved note when the user opens the file after a refused history write', async ({tierList}) => {
      const {scribble} = tierList;
      await tierList.goto(TANKS, LIST);
      await tierList.share.capturePreview();
      const file = await tierList.share.downloadCapturedImage();
      await tierList.share.closeSharePanelWithShareButton();
      await tierList.drag.dragItemToTier('Winston', 'B');
      await tierList.zen.setZenMode(true);
      await scribble.setScribble(true);
      await scribble.refuseNextInkWrite();
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);
      expect(scribble.inkInAddress()).toBeNull();

      await tierList.files.dropFile(pngFile(file.name, file.buffer));
      await tierList.files.confirmOpenList();

      await expect(tierList.itemIn('C', 'Winston')).toBeVisible();
      await scribble.expectNotes(0);
      expect(scribble.inkInAddress()).toBeNull();
      await scribble.drawNoteAndWaitForInk(tierList.item('Sigma'), 1);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Sigma']);
    });

    test('writes the note on screen to the copied link when the browser refused to write it to the address twice', async ({tierList, openAsVisitor}) => {
      const {scribble} = tierList;
      await tierList.share.readCopiedText();
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.refuseNextInkWrite(2);
      await scribble.drawCircleOn(tierList.item('Mauga'));
      await scribble.expectNotes(1);
      await tierList.zen.setZenMode(false);
      await scribble.expectNotes(1);
      expect(scribble.inkInAddress()).toBeNull();

      await tierList.share.openSharePanel();
      await tierList.share.copyLinkInOpenPanel();

      const friend = await openAsVisitor(await tierList.share.copiedLink());
      await friend.scribble.expectNotes(1);
      await expect.poll(() => friend.scribble.noteNames()).toEqual(['Note 1 on Mauga']);
    });

    test('writes the note with the list change when the user moves an item by keyboard after the browser refused a write', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await scribble.refuseNextInkWrite();
      await scribble.drawCircleOn(tierList.item('Sigma'));
      await scribble.expectNotes(2);

      await tierList.drag.moveItemWithKeyboard('Winston', ['ArrowUp']);
      await tierList.reload();

      await scribble.expectNotes(2);
      await expect(tierList.itemIn('B', 'Winston')).toBeVisible();
    });
  });

  test.describe('fast drawing', () => {
    const TWO_WRITES = {writes: 2, windowMs: 86_400_000};
    const NO_WRITES = {writes: 0, windowMs: 30_000};

    test('renders the third note, and writes 2 notes to the address, when the limit is 2 ink writes', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.setInkWriteLimit(TWO_WRITES);
      const newEntries = await tierList.countNewHistoryEntries();
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await scribble.drawNoteAndWaitForInk(tierList.item('Winston'), 2);
      const written = scribble.inkInAddress();

      await scribble.drawNoteHeld(tierList.item('Sigma'), 3);
      await scribble.drawNoteHeld(tierList.tierLabel('F'), 4);

      expect(scribble.inkInAddress()).toBe(written);
      expect(await newEntries()).toBe(1);
      await expect(tierList.zen.zenStepCount).toHaveText('2 / 2');
      await expect.poll(async () => (await scribble.noteNames()).slice(0, 3)).toEqual(['Note 1 on Mauga', 'Note 2 on Winston', 'Note 3 on Sigma']);
    });

    test('writes every note to the entry of the run when the user turns Scribble off after notes past the limit', async ({tierList, page}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.setInkWriteLimit(TWO_WRITES);
      const newEntries = await tierList.countNewHistoryEntries();
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await scribble.drawNoteAndWaitForInk(tierList.item('Winston'), 2);
      await scribble.drawNoteHeld(tierList.item('Sigma'), 3);
      const before = page.url();

      await scribble.setScribble(false);

      await expect(page, 'pen off should write the notes').not.toHaveURL(before);
      expect(await newEntries()).toBe(1);
      await expect(tierList.zen.zenStepCount).toHaveText('2 / 2');
      await scribble.setScribble(true);
      await tierList.zen.stepInZenBar('Back');
      await scribble.expectNotes(0);
      expect(scribble.inkInAddress()).toBeNull();
      await tierList.zen.stepInZenBar('Forward');
      await scribble.expectNotes(3);
      await tierList.reload();
      await scribble.expectNotes(3);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga', 'Note 2 on Winston', 'Note 3 on Sigma']);
    });

    test('writes the waiting note and the next note with 1 new history entry when the limit allows a write again', async ({tierList, page}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.setInkWriteLimit(NO_WRITES);
      const newEntries = await tierList.countNewHistoryEntries();
      await scribble.drawNoteHeld(tierList.item('Mauga'), 1);
      expect(scribble.inkInAddress()).toBeNull();
      expect(await newEntries()).toBe(0);
      await scribble.setInkWriteLimit(null);

      await scribble.drawNoteAndWaitForInk(tierList.item('Sigma'), 2);

      expect(await newEntries()).toBe(1);
      await expect(tierList.zen.zenStepCount).toHaveText('2 / 2');
      await tierList.reload();
      await scribble.expectNotes(2);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga', 'Note 2 on Sigma']);
      await expect(page).toHaveURL(/[?&]ink=1\./);
    });

    test('writes the waiting note with the list change when the user moves an item by keyboard after a note past the limit', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.setInkWriteLimit(NO_WRITES);
      await scribble.drawNoteHeld(tierList.item('Mauga'), 1);

      await tierList.drag.moveItemWithKeyboard('Winston', ['ArrowUp']);
      await tierList.reload();

      await scribble.expectNotes(1);
      await expect(tierList.itemIn('B', 'Winston')).toBeVisible();
    });

    test('writes the waiting note to the address when the page becomes hidden after a note past the limit', async ({tierList, page}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.setInkWriteLimit(NO_WRITES);
      await scribble.drawNoteHeld(tierList.item('Mauga'), 1);

      await scribble.hidePage();

      await expect(page).toHaveURL(/[?&]ink=1\./);
      await expect(tierList.zen.zenStepCount).toHaveText('2 / 2');
      await tierList.reload();
      await scribble.expectNotes(1);
    });

    test('renders no note after Back, and the 2 written notes after Forward, when a third note waited past the limit', async ({tierList}) => {
      const {scribble} = tierList;
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.setInkWriteLimit(TWO_WRITES);
      await scribble.drawNoteAndWaitForInk(tierList.item('Mauga'), 1);
      await scribble.drawNoteAndWaitForInk(tierList.item('Winston'), 2);
      await scribble.drawNoteHeld(tierList.item('Sigma'), 3);

      await tierList.zen.stepInZenBar('Back');

      await scribble.expectNotes(0);
      expect(scribble.inkInAddress()).toBeNull();
      await tierList.zen.stepInZenBar('Forward');
      await scribble.expectNotes(2);
      await expect.poll(() => scribble.noteNames()).toEqual(['Note 1 on Mauga', 'Note 2 on Winston']);
    });

    test('writes the unsaved note to the address and the copied link when the user opens Share after a refused pen-off write', async ({tierList, page, openAsVisitor}) => {
      const {scribble} = tierList;
      await scribble.prepareInkWriteRefusals();
      await tierList.share.readCopiedText();
      await scribble.gotoWithScribble(TANKS, LIST);
      await scribble.setInkWriteLimit(NO_WRITES);
      await scribble.drawNoteHeld(tierList.item('Mauga'), 1);
      await scribble.refuseNextInkWrite();
      await tierList.zen.setZenMode(false);
      await scribble.expectNotes(1);
      expect(scribble.inkInAddress()).toBeNull();

      await tierList.share.openSharePanel();

      await expect(page).toHaveURL(/[?&]ink=1\./);
      await tierList.share.copyLinkInOpenPanel();
      const copied = await tierList.share.copiedLink();
      expect(new URL(copied).searchParams.get('ink')?.replace(/ /g, '+')).toBe(scribble.inkInAddress());
      const friend = await openAsVisitor(copied);
      await friend.scribble.expectNotes(1);
    });
  });

  test.describe('model', () => {
    const scribbleSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      const {scribble} = tierList;
      let entries = 0;
      let inkWritten = false;
      let onScreen: ScribbleSnapshot | null = null;
      const drawNote = async () => {
        if (!onScreen) throw new Error('No state was checked yet');
        const target = notesIn(onScreen) === 0 ? tierList.item('Mauga') : tierList.item('Orisa');
        await scribble.drawNoteAndWaitForInk(target, notesIn(onScreen) + 1);
        inkWritten = true;
      };
      return modelSut<ScribbleSnapshot, ScribbleEvent>(page, {
        reset: async () => {
          onScreen = null;
          inkWritten = false;
          await tierList.goto(TANKS, LIST);
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
            if (count === 0) await expect(page).not.toHaveURL(/[?&]ink=/);
            else await expect(page).toHaveURL(/[?&]ink=1\./);
            expect(scribble.stateInAddress(), 'ink should leave the list of the link as it is').toBe(LIST);
            expect(await tierList.historyLength(), 'the notes of one run should share one history entry').toBe(entries + (inkWritten ? 1 : 0));
            if (pen === 'zenOff') await expect(tierList.zen.zenBar).toHaveCount(0);
            else await scribble.expectScribble(pen === 'penOn');
            if (pen !== 'penOn') await expect(scribble.controls).toHaveCount(0);
            if (pen !== 'penOn' && count === 0) {
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

  test.describe('model: history', () => {
    const inkHistorySut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      const {scribble} = tierList;
      let onScreen: InkHistorySnapshot | null = null;
      const targets = () => [tierList.item('Mauga'), tierList.item('Orisa'), tierList.tierLabel('F')];
      return modelSut<InkHistorySnapshot, InkHistoryEvent>(page, {
        reset: async () => {
          onScreen = null;
          await tierList.openAfterBlankPage(TANKS, LIST);
          await scribble.setInkWriteLimit(null);
          await tierList.zen.setZenMode(true);
          await scribble.setScribble(true);
        },
        events: {
          DRAW_NOTE: async () => {
            if (!onScreen) throw new Error('No state was checked yet');
            const {notes} = inkHistoryViewOf(onScreen);
            await scribble.drawNoteAndWaitForInk(targets()[notes], notes + 1);
          },
          DRAW_NOTE_REFUSED: async () => {
            await scribble.refuseNextInkWrite();
            await scribble.drawCircleOn(tierList.item('Mauga'));
          },
          DRAW_NOTE_PAST_LIMIT: async () => {
            await scribble.setInkWriteLimit({writes: 0, windowMs: 30_000});
            await scribble.drawNoteHeld(tierList.item('Orisa'), 2);
          },
          PEN_OFF_AND_ON: async () => {
            const before = page.url();
            await scribble.setScribble(false);
            await expect(page, 'pen off should write the waiting note').not.toHaveURL(before);
            await scribble.setInkWriteLimit(null);
            await scribble.setScribble(true);
          },
          REMOVE_LAST_NOTE: () => scribble.removeLastNote(),
          CLEAR: () => scribble.clear(),
          CHANGE_LIST: async () => {
            await scribble.setScribble(false);
            await tierList.drag.dragItemToTier('Winston', 'A');
            await scribble.setScribble(true);
          },
          BACK: () => tierList.zen.stepInZenBar('Back'),
          FORWARD: () => tierList.zen.stepInZenBar('Forward'),
          RELOAD: async () => {
            await tierList.reload();
            await tierList.zen.setZenMode(true);
            await scribble.setScribble(true);
          },
        },
        states: {
          '*': async (_page, snapshot) => {
            onScreen = snapshot;
            const {notes, step, total, listChanged, inkInAddress, notesInAddress} = inkHistoryViewOf(snapshot);
            await scribble.expectNotes(notes);
            await expect(tierList.zen.zenStepCount).toHaveText(`${step} / ${total}`);
            if (inkInAddress) await expect(page).toHaveURL(/[?&]ink=1\./);
            else await expect(page).not.toHaveURL(/[?&]ink=/);
            await expect.poll(() => inkNoteCount(page.url()), {message: 'the notes in the ink value of the address'}).toBe(notesInAddress);
            await expect(tierList.itemIn(listChanged ? 'A' : 'C', 'Winston')).toBeVisible();
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(inkHistoryModel)) {
      test(`renders each state of the ink history machine when the user walks every transition (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        await tierList.scribble.prepareInkWriteRefusals();
        const coverage = await walkModel(inkHistoryModel, inkHistorySut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, inkHistoryModel, coverage, part);
      });
    }
  });

  test.describe('model: ink over pictures', () => {
    const inkOverPicturesSut = (tierList: TierListPage, page: Page, testInfo: TestInfo) => {
      const {scribble} = tierList;
      let line: Point[] = [];
      let onPicture: Point[] = [];
      let onRow: Point[] = [];
      let pictureBefore: Rgb[][] = [];
      let rowBefore: Rgb[][] = [];
      return modelSut<InkOverPicturesSnapshot, InkOverPicturesEvent>(page, {
        reset: async () => {
          await scribble.gotoWithScribble(TANKS, LIST);
          await scribble.expectPictureLoaded(tierList.item('Mauga'));
          ({line, onPicture, onRow} = await scribble.lineAcrossAndBeyond(tierList.item('Mauga')));
          pictureBefore = await scribble.settledPixelColumnsAt(onPicture);
          rowBefore = await scribble.settledPixelColumnsAt(onRow);
        },
        events: {
          CHOOSE_RED: () => scribble.chooseInkColour('Red'),
          CHOOSE_BLUE: () => scribble.chooseInkColour('Blue'),
          CHOOSE_CONTRAST: () => scribble.chooseInkColour('Contrast'),
          DRAW_ACROSS: () => scribble.draw(line),
          REMOVE_LAST_NOTE: () => scribble.removeLastNote(),
          CLEAR: () => scribble.clear(),
        },
        states: {
          '*': async (_page, snapshot) => {
            const ink = inkOf(snapshot);
            const strokes = strokesIn(snapshot);
            await expect(scribble.inkColourButton).toHaveAccessibleName(`Ink colour: ${INK_NAMES[ink]}`);
            await scribble.expectNotes(strokes);
            if (strokes === 0) {
              await expect.poll(() => scribble.pixelColumnsAt(onPicture), {message: 'the picture should show as it loaded'}).toEqual(pictureBefore);
              await expect.poll(() => scribble.pixelColumnsAt(onRow), {message: 'the row should have no ink'}).toEqual(rowBefore);
              return;
            }
            const look = PICTURE_LOOKS[ink];
            await expect.poll(async () => columnsWhere(pictureBefore, await scribble.pixelColumnsAt(onPicture), PICTURE_CHECKS[look]),
              {message: `the sample points where the picture under the stroke shows ${look}`}).toBe(onPicture.length);
            await expect.poll(async () => columnsWhere(rowBefore, await scribble.pixelColumnsAt(onRow), isColour(LIGHT_INK[INK_NAMES[ink]])),
              {message: `the sample points where the row shows solid ${INK_NAMES[ink]} ink`}).toBe(onRow.length);
          },
        },
        testInfo,
        step: (name, body) => test.step(name, body),
      });
    };

    test.describe.configure({retries: 0});
    for (const part of walkParts(inkOverPicturesModel)) {
      test(`renders each state of the ink over pictures machine when the user walks every transition (${part.name})`, async ({tierList, page}, testInfo) => {
        test.setTimeout(MODEL_PART_TIMEOUT);
        const coverage = await walkModel(inkOverPicturesModel, inkOverPicturesSut(tierList, page, testInfo), part);
        await attachCoverage(testInfo, inkOverPicturesModel, coverage, part);
      });
    }
  });
});
