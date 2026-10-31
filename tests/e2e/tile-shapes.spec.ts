import {expect, test} from '../support/test';
import {rankingState} from '../support/links';
import imagesetConfig from '../../imageset.config.json';

/**
 * Tiles render at their shape (square, landscape, portrait), and drag and drop works in rows
 * of mixed shapes that wrap. No image set publishes another shape than square yet (A13), so
 * these tests need a build with a made-up config: `node tests/support/synthetic-shapes.mjs`
 * (see tests/README.md, "Tile shapes"). With the real config they skip themselves.
 */

type Shape = 'square' | 'landscape' | 'portrait';
const images: {label: string; shape?: string}[] = imagesetConfig.packages['image-overwatch'].images;
const shapeOf = (label: string) => (images.find((image) => image.label === label)?.shape ?? 'square') as Shape;
const labelsOf = (shape: Shape) => images.filter((image) => shapeOf(image.label) === shape).map((image) => image.label);
const LANDSCAPE = labelsOf('landscape');
const PORTRAIT = labelsOf('portrait');
const SQUARE = labelsOf('square');

test.skip(LANDSCAPE.length < 2 || PORTRAIT.length < 2, 'Needs a build with tile shapes: node tests/support/synthetic-shapes.mjs (tests/README.md)');

const ALL = '/rank/overwatch/all';
/** A row of mixed shapes, long enough to wrap at the default window size. */
const MIXED = () => [LANDSCAPE[0], SQUARE[0], PORTRAIT[0], SQUARE[1], LANDSCAPE[1], SQUARE[2], PORTRAIT[1], SQUARE[3], SQUARE[4], SQUARE[5], SQUARE[6], SQUARE[7]];

test.describe('Tile shapes', () => {
  test('tiles render at their shape, all with the same height', async ({tierList}) => {
    await tierList.goto(ALL, rankingState('image-overwatch', {S: [LANDSCAPE[0], PORTRAIT[0], SQUARE[0]]}));

    await expect(async () => {
      const [landscape, portrait, square] = await Promise.all([LANDSCAPE[0], PORTRAIT[0], SQUARE[0]]
        .map(async (label) => (await tierList.item(label).boundingBox())!));
      expect(landscape.height).toBeCloseTo(square.height, 0);
      expect(portrait.height).toBeCloseTo(square.height, 0);
      expect(square.width).toBeCloseTo(square.height, 0);
      // Landscape canvases are 16:9, portrait ones 3:4 (lib/tileSize.ts); tiles also have a small margin.
      expect(landscape.width / landscape.height).toBeGreaterThan(1.6);
      expect(portrait.width / portrait.height).toBeLessThan(0.8);
    }).toPass();
  });

  test('drag an item into a wrapping row of mixed shapes', async ({tierList}) => {
    const mixed = MIXED();
    await tierList.goto(ALL, rankingState('image-overwatch', {S: mixed, '': [SQUARE[8]]}));
    await expect.poll(async () => (await tierList.itemLines('S')).length, {message: 'row S should wrap'}).toBeGreaterThan(1);
    const target = (await tierList.itemLines('S'))[1][0];

    await tierList.dragItemNextTo(SQUARE[8], target, 'before');

    const expected = [...mixed];
    expected.splice(mixed.indexOf(target), 0, SQUARE[8]);
    await expect(tierList.itemsIn('S')).toHaveText(expected);
  });

  test('move a wide tile between the lines of a wrapping row with the keyboard', async ({tierList}) => {
    const mixed = MIXED();
    await tierList.goto(ALL, rankingState('image-overwatch', {S: mixed}));
    const before = (await tierList.item(LANDSCAPE[0]).boundingBox())!;

    await tierList.moveItemWithKeyboard(LANDSCAPE[0], ['ArrowDown']);

    await expect.poll(async () => (await tierList.item(LANDSCAPE[0]).boundingBox())!.y, {message: 'the tile should be on a lower line'})
      .toBeGreaterThan(before.y + before.height / 2);
    await expect(tierList.itemsIn('S')).toHaveCount(mixed.length);

    await tierList.moveItemWithKeyboard(LANDSCAPE[0], ['ArrowUp']);

    await expect.poll(async () => (await tierList.item(LANDSCAPE[0]).boundingBox())!.y).toBeCloseTo(before.y, 0);
  });
});
