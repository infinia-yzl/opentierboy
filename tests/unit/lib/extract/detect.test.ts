import {describe, expect, it} from 'vitest';
import {findItems, findItemsOfSize, readingOrder} from '@/lib/extract/detect';
import {blankPicture, fillBox, gridPicture, nearBox} from '../../support/drawn-pictures';

const GRID = {columns: 4, rows: 3, left: 100, top: 80, width: 120, height: 150, gap: 20};

describe('findItems', () => {
  it('returns every tile of a drawn grid in reading order when the picture is 1,280 pixels wide', () => {
    const {picture, boxes} = gridPicture(1280, 720, GRID);
    const found = findItems(picture);
    expect(found).toHaveLength(12);
    found.forEach((box, index) => expect(nearBox(box, boxes[index])).toBe(true));
  });

  it('returns the tiles in picture pixels when the picture is 2,560 pixels wide', () => {
    const double = {...GRID, left: 200, top: 160, width: 240, height: 300, gap: 40};
    const {picture, boxes} = gridPicture(2560, 1440, double);
    const found = findItems(picture);
    expect(found).toHaveLength(12);
    found.forEach((box, index) => expect(nearBox(box, boxes[index], 4)).toBe(true));
  });

  it('returns no box when the picture is one plain colour', () => {
    expect(findItems(blankPicture(1280, 720))).toEqual([]);
  });

  it('returns no box when the picture has one framed rectangle', () => {
    const {picture} = gridPicture(1280, 720, {...GRID, columns: 1, rows: 1, width: 400, height: 300});
    expect(findItems(picture)).toEqual([]);
  });

  it('returns scores between 0 and 1 when tiles are found', () => {
    const {picture} = gridPicture(1280, 720, GRID);
    for (const box of findItems(picture)) {
      expect(box.score).toBeGreaterThan(0);
      expect(box.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('findItemsOfSize', () => {
  it('returns every tile of the grid when one border is drawn a few pixels off a tile', () => {
    const {picture, boxes} = gridPicture(1280, 720, GRID);
    const found = findItemsOfSize(picture, {x: boxes[5].x + 3, y: boxes[5].y - 2, width: boxes[5].width - 4, height: boxes[5].height + 3});
    expect(found).toHaveLength(12);
    found.forEach((box, index) => expect(nearBox(box, boxes[index], 4)).toBe(true));
  });

  it('returns the given border when nothing else in the picture has its size', () => {
    const picture = blankPicture(1280, 720);
    fillBox(picture, {x: 300, y: 200, width: 200, height: 100}, [200, 80, 80]);
    const found = findItemsOfSize(picture, {x: 300, y: 200, width: 200, height: 100});
    expect(found).toHaveLength(1);
    expect(nearBox(found[0], {x: 300, y: 200, width: 200, height: 100})).toBe(true);
  });
});

describe('readingOrder', () => {
  it('returns boxes row by row, left to right, when the rows are a few pixels uneven', () => {
    const boxes = [
      {x: 200, y: 12, width: 50, height: 50},
      {x: 0, y: 70, width: 50, height: 50},
      {x: 100, y: 10, width: 50, height: 50},
      {x: 0, y: 8, width: 50, height: 50},
    ];
    expect(readingOrder(boxes).map((box) => [box.x, box.y])).toEqual([[0, 8], [100, 10], [200, 12], [0, 70]]);
  });
});
