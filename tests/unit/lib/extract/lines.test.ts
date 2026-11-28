import {describe, expect, it} from 'vitest';
import {
  close,
  horizontalCover,
  horizontalRuns,
  lineMasks,
  type Mask,
  open,
  sideSums,
  topEdges,
  verticalCover,
} from '@/lib/extract/lines';
import {workingPicture} from '@/lib/extract/picture';
import {blankPicture, drawTile} from '../../support/drawn-pictures';

const column = (values: number[]): Mask => ({width: 1, height: values.length, data: Uint8Array.from(values)});
const on = (mask: Mask) => Array.from(mask.data).flatMap((value, index) => (value ? [index] : []));

describe('open', () => {
  it('returns a run of 16 one pixel lower when the kernel is 16 long, as OpenCV does', () => {
    const values = new Array(40).fill(0);
    for (let index = 10; index < 26; index++) values[index] = 1;
    expect(on(open(column(values), 16, 'vertical'))).toEqual(Array.from({length: 16}, (_, index) => index + 11));
  });

  it('returns no pixel when the run is shorter than the kernel', () => {
    const values = new Array(40).fill(0);
    for (let index = 10; index < 25; index++) values[index] = 1;
    expect(on(open(column(values), 16, 'vertical'))).toEqual([]);
  });

  it('returns a short run at the top edge when the run fills the part of the kernel inside the picture', () => {
    const values = new Array(40).fill(0);
    for (let index = 0; index < 9; index++) values[index] = 1;
    expect(on(open(column(values), 16, 'vertical'))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('close', () => {
  it('returns gaps of up to two pixels filled when the kernel is 3 long', () => {
    expect(on(close(column([1, 0, 0, 1, 0, 1, 0, 0, 0, 1]), 3, 'vertical'))).toEqual([0, 1, 2, 3, 4, 5, 9]);
  });
});

describe('lineMasks', () => {
  it('returns the four sides of a drawn tile when the tile is larger than the line length', () => {
    const picture = blankPicture(100, 100);
    drawTile(picture, {x: 20, y: 30, width: 50, height: 40});
    const {vertical, horizontal} = lineMasks(workingPicture(picture, 100));
    expect(vertical.data[50 * 100 + 20]).toBe(1);
    expect(vertical.data[50 * 100 + 70]).toBe(1);
    expect(horizontal.data[30 * 100 + 40]).toBe(1);
    expect(horizontal.data[70 * 100 + 40]).toBe(1);
    expect(vertical.data[10 * 100 + 20]).toBe(0);
  });
});

describe('horizontalRuns', () => {
  it('returns the row, start and end of each run when a row has two runs', () => {
    const mask: Mask = {width: 6, height: 2, data: Uint8Array.from([1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1])};
    const runs = horizontalRuns(mask);
    expect(Array.from(runs.rows)).toEqual([0, 0, 1]);
    expect(Array.from(runs.starts)).toEqual([0, 3, 5]);
    expect(Array.from(runs.ends)).toEqual([2, 6, 6]);
  });
});

describe('topEdges', () => {
  it('returns only the first row of a thick line when the line is two rows high', () => {
    const mask: Mask = {width: 2, height: 3, data: Uint8Array.from([1, 1, 1, 1, 0, 0])};
    expect(Array.from(topEdges(mask).data)).toEqual([1, 1, 0, 0, 0, 0]);
  });
});

describe('sideSums', () => {
  it('returns the side length less the one row of the opening shift when the side is a line', () => {
    const picture = blankPicture(100, 100);
    drawTile(picture, {x: 20, y: 30, width: 50, height: 40});
    const sums = sideSums(lineMasks(workingPicture(picture, 100)));
    expect(verticalCover(sums, 20, 30, 70)).toBe(39);
    expect(horizontalCover(sums, 30, 20, 70)).toBe(49);
    expect(verticalCover(sums, 45, 30, 70, true)).toBe(0);
  });
});
