import {describe, expect, it} from 'vitest';
import {cluster, completeGrid, contentEntropy, rectangleScores, regularity, scoreAt} from '@/lib/extract/rectangles';
import {lineMasks, sideSums} from '@/lib/extract/lines';
import {greyValues, workingPicture} from '@/lib/extract/picture';
import {blankPicture, gridPicture} from '../../support/drawn-pictures';

const GRID = {columns: 3, rows: 2, left: 50, top: 40, width: 80, height: 100, gap: 30};
const SIZE = {width: 80, height: 100};

function prepared(width: number, height: number) {
  const {picture, boxes} = gridPicture(width, height, GRID);
  const working = workingPicture(picture, width);
  return {boxes, working, sums: sideSums(lineMasks(working))};
}

describe('rectangleScores', () => {
  it('returns one candidate at each drawn tile when the size matches the tiles', () => {
    const {boxes, sums} = prepared(500, 320);
    const found = rectangleScores(sums, SIZE);
    for (const box of boxes) expect(found.some((candidate) => Math.abs(candidate.x - box.x) <= 1 && Math.abs(candidate.y - box.y) <= 1)).toBe(true);
    expect(found.every((candidate) => candidate.total <= 4)).toBe(true);
  });

  it('returns no candidate when the size is larger than the picture', () => {
    const {sums} = prepared(500, 320);
    expect(rectangleScores(sums, {width: 600, height: 100})).toEqual([]);
  });
});

describe('scoreAt', () => {
  it('returns a total near 4 when all four sides lie on lines', () => {
    const {boxes, sums} = prepared(500, 320);
    const score = scoreAt(sums, boxes[0].x, boxes[0].y, SIZE);
    expect(score.total).toBeGreaterThan(3.9);
    expect(score.min).toBeGreaterThan(0.95);
  });

  it('returns 0 when the rectangle leaves the picture', () => {
    const {sums} = prepared(500, 320);
    expect(scoreAt(sums, -1, 0, SIZE)).toEqual({total: 0, min: 0});
  });
});

describe('cluster', () => {
  it('returns the rounded centre of each group when values lie within 3 of their neighbour', () => {
    expect(cluster([10, 12, 13, 40, 41, 100])).toEqual([12, 40, 100]);
  });
});

describe('completeGrid', () => {
  it('returns a missing tile of the grid when the other tiles of its row and column are known', () => {
    const {boxes, sums} = prepared(500, 320);
    const known = boxes.slice(0, 5).map((box) => ({x: box.x, y: box.y, total: 4, min: 1}));
    const completed = completeGrid(known, sums, SIZE);
    expect(completed).toHaveLength(6);
    expect(completed.some((box) => Math.abs(box.x - boxes[5].x) <= 2 && Math.abs(box.y - boxes[5].y) <= 2)).toBe(true);
  });

  it('returns no box when no box is known', () => {
    const {sums} = prepared(500, 320);
    expect(completeGrid([], sums, SIZE)).toEqual([]);
  });
});

describe('regularity', () => {
  it('returns 1 when the boxes sit on an even grid', () => {
    const boxes = [0, 110, 220].flatMap((x) => [0, 130].map((y) => ({x, y, total: 4, min: 1})));
    expect(regularity(boxes, SIZE)).toBe(1);
  });

  it('returns less than 1 when one gap differs', () => {
    const boxes = [0, 110, 260].map((x) => ({x, y: 0, total: 4, min: 1}));
    expect(regularity(boxes, SIZE)).toBe(0.5);
  });

  it('returns 0 when there is one box', () => {
    expect(regularity([{x: 0, y: 0, total: 4, min: 1}], SIZE)).toBe(0);
  });
});

describe('contentEntropy', () => {
  it('returns 0 when the box is one plain colour', () => {
    const working = workingPicture(blankPicture(100, 100), 100);
    expect(contentEntropy(greyValues(working), 100, {x: 10, y: 10, total: 4, min: 1}, {width: 30, height: 30})).toBe(0);
  });

  it('returns more than 1.5 when the box has a gradient', () => {
    const {boxes, working} = prepared(500, 320);
    const box = {x: boxes[0].x, y: boxes[0].y, total: 4, min: 1};
    expect(contentEntropy(greyValues(working), working.width, box, SIZE)).toBeGreaterThan(1.5);
  });
});
