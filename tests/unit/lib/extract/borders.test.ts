import {describe, expect, it} from 'vitest';
import {
  addBorders,
  BORDER_LIMITS,
  type Border,
  contextBox,
  cropPlan,
  fitInside,
  keptSquare,
  moveBorder,
  moveCut,
  orderBorders,
  overlapShare,
  removeBorder,
  resizeBorder,
  resizeEvery,
} from '@/lib/extract/borders';

const BOUNDS = {width: 1000, height: 600};
const border = (id: number, x: number, y: number, width = 100, height = 150): Border => ({id, x, y, width, height, cut: null});

describe('addBorders', () => {
  it('returns new borders with new ids when they do not cover an existing border', () => {
    const result = addBorders([border(4, 0, 0)], [{x: 200, y: 0, width: 100, height: 150}], BOUNDS);
    expect(result.borders.map((item) => item.id)).toEqual([4, 5]);
    expect(result.added).toBe(1);
  });

  it('returns the existing borders unchanged when a new box covers one of them', () => {
    const result = addBorders([border(1, 0, 0)], [{x: 5, y: 5, width: 100, height: 150}], BOUNDS);
    expect(result.borders).toEqual([border(1, 0, 0)]);
    expect(result.added).toBe(0);
  });

  it('returns at most 300 borders and the count left out when more are given', () => {
    const boxes = Array.from({length: 320}, (_, index) => ({x: (index % 40) * 25, y: Math.floor(index / 40) * 25, width: 24, height: 24}));
    const result = addBorders([], boxes, {width: 1000, height: 1000});
    expect(result.borders).toHaveLength(BORDER_LIMITS.maxBorders);
    expect(result.leftOut).toBe(20);
  });

  it('returns no border and a count of small boxes when a box is under 24 pixels', () => {
    const result = addBorders([], [{x: 0, y: 0, width: 23, height: 80}], BOUNDS);
    expect(result.borders).toEqual([]);
    expect(result.tooSmall).toBe(1);
  });
});

describe('fitInside', () => {
  it('returns the box cut at the picture edge when it reaches outside', () => {
    expect(fitInside({x: -10, y: 580, width: 50, height: 50}, BOUNDS)).toBeNull();
    expect(fitInside({x: -10, y: 550, width: 50, height: 80}, BOUNDS)).toEqual({x: 0, y: 550, width: 40, height: 50});
  });
});

describe('removeBorder', () => {
  it('returns the other borders when one is removed', () => {
    expect(removeBorder([border(1, 0, 0), border(2, 200, 0)], 1)).toEqual([border(2, 200, 0)]);
  });
});

describe('orderBorders', () => {
  it('returns borders row by row when they were added out of order', () => {
    const ordered = orderBorders([border(1, 200, 160), border(2, 0, 2), border(3, 200, 0), border(4, 0, 158)]);
    expect(ordered.map((item) => item.id)).toEqual([2, 3, 4, 1]);
  });
});

describe('overlapShare', () => {
  it('returns the covered share of the smaller box when two boxes overlap', () => {
    expect(overlapShare({x: 0, y: 0, width: 10, height: 10}, {x: 5, y: 0, width: 10, height: 10})).toBe(0.5);
  });
});

describe('moveBorder', () => {
  it('returns the border inside the picture when it is moved past an edge', () => {
    expect(moveBorder(border(1, 10, 10), -50, 900, BOUNDS)).toEqual(border(1, 0, 450));
  });
});

describe('resizeBorder', () => {
  it('returns the border with its east and south edges moved when the se handle is dragged', () => {
    const result = resizeBorder(border(1, 10, 10), 'se', 20, -30, BOUNDS);
    expect(result.border).toEqual(border(1, 10, 10, 120, 120));
    expect(result.change).toEqual({left: 0, top: 0, right: 20, bottom: -30});
    expect(result.atSmallest).toBe(false);
  });

  it('returns a border of 24 pixels and atSmallest when it is made smaller than that', () => {
    const result = resizeBorder(border(1, 10, 10), 'w', 500, 0, BOUNDS);
    expect(result.border.width).toBe(BORDER_LIMITS.smallestSide);
    expect(result.atSmallest).toBe(true);
  });
});

describe('resizeEvery', () => {
  it('returns every border with the same edge changes when one border was resized', () => {
    const {borders} = resizeEvery([border(1, 10, 10), border(2, 200, 10)], {left: 0, top: 5, right: 0, bottom: -20}, BOUNDS);
    expect(borders).toEqual([border(1, 10, 15, 100, 125), border(2, 200, 15, 100, 125)]);
  });
});

describe('keptSquare', () => {
  it('returns the centred square when a tall border has no cut', () => {
    expect(keptSquare(border(1, 0, 0, 100, 150))).toMatchObject({x: 0, y: 25, width: 100, height: 100, room: 50, along: 'y'});
  });

  it('returns the square at the cut when the cut was moved', () => {
    expect(keptSquare(moveCut(border(1, 0, 0, 150, 100), 100))).toMatchObject({x: 50, y: 0, width: 100, room: 50, along: 'x'});
  });
});

describe('cropPlan', () => {
  it('returns a square target with the whole item centred when the fit is whole', () => {
    expect(cropPlan(border(1, 10, 20, 100, 200), 'whole')).toEqual({
      source: {x: 10, y: 20, width: 100, height: 200},
      side: 200,
      target: {x: 50, y: 0, width: 100, height: 200},
    });
  });

  it('returns the square of the cut as the source when the fit is square', () => {
    expect(cropPlan(border(1, 10, 20, 100, 200), 'square')).toEqual({
      source: {x: 10, y: 70, width: 100, height: 100},
      side: 100,
      target: {x: 0, y: 0, width: 100, height: 100},
    });
  });

  it('returns a target of at most 512 pixels when the item is larger', () => {
    expect(cropPlan(border(1, 0, 0, 1024, 512), 'whole').target).toEqual({x: 0, y: 128, width: 512, height: 256});
  });
});

describe('contextBox', () => {
  it('returns the box grown on every side and cut at the picture edge when it is near an edge', () => {
    expect(contextBox({x: 10, y: 100, width: 100, height: 100}, BOUNDS)).toEqual({x: 0, y: 40, width: 170, height: 220});
  });
});
