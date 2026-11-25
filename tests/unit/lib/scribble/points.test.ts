import {describe, expect, it} from 'vitest';
import {liftPen, movePen, penIsDry, POINT_MIN_MOVE, POINT_STEP, POINT_TURN_DEGREES, startPen, strokePath, type Pen, type Point} from '@/lib/scribble/points';

const draw = (budget: number, [first, ...rest]: Point[]): Pen => rest.reduce(movePen, startPen(first, budget));

const lineTo = (length: number, samples: number): Point[] =>
  Array.from({length: samples + 1}, (_, index) => ({x: (length * index) / samples, y: 0}));

describe('startPen', () => {
  it('returns the first point as its one point when the budget is 1 or more', () => {
    expect(startPen({x: 1, y: 2}, 5).kept).toEqual([{x: 1, y: 2}]);
  });

  it('returns no point when the budget is 0', () => {
    expect(startPen({x: 1, y: 2}, 0).kept).toEqual([]);
  });
});

describe('movePen', () => {
  it('returns the same pen when the line moved less than POINT_MIN_MOVE', () => {
    const pen = startPen({x: 0, y: 0}, 5);
    expect(movePen(pen, {x: POINT_MIN_MOVE / 2, y: 0})).toBe(pen);
  });

  it('returns a new point when the line left the last point by POINT_STEP', () => {
    expect(movePen(startPen({x: 0, y: 0}, 5), {x: POINT_STEP, y: 0}).kept).toEqual([{x: 0, y: 0}, {x: POINT_STEP, y: 0}]);
  });

  it('returns points POINT_STEP apart when a straight line of 3 tiles is drawn in moves of a hundredth of a tile', () => {
    const {kept} = draw(500, lineTo(3, 300));
    const gaps = kept.slice(1).map((point, index) => point.x - kept[index].x);
    expect(kept).toHaveLength(10);
    expect(gaps.filter((gap) => gap < POINT_STEP || gap > POINT_STEP + 0.011)).toEqual([]);
  });

  it('returns no new point when the line bends by less than POINT_TURN_DEGREES before POINT_STEP', () => {
    const pen = draw(5, [{x: 0, y: 0}, {x: 0.1, y: 0}, {x: 0.2, y: 0.02}]);
    expect(pen.kept).toEqual([{x: 0, y: 0}]);
  });

  it('returns a new point when the line turned by POINT_TURN_DEGREES since it left the last point', () => {
    const turn = ((POINT_TURN_DEGREES + 1) * Math.PI) / 180;
    const turned = {x: 0.2 * Math.cos(turn), y: 0.2 * Math.sin(turn)};
    const pen = draw(5, [{x: 0, y: 0}, {x: 0.1, y: 0}, turned]);
    expect(pen.kept).toEqual([{x: 0, y: 0}, turned]);
  });

  it('returns more points for a circle than for a straight line of the same length when both are drawn', () => {
    const circle = Array.from({length: 201}, (_, index) => {
      const angle = (index / 200) * 2 * Math.PI;
      return {x: 0.2 * Math.cos(angle), y: 0.2 * Math.sin(angle)};
    });
    const straight = draw(500, lineTo(0.4 * Math.PI, 200));
    expect(draw(500, circle).kept.length).toBeGreaterThan(straight.kept.length);
  });

  it('returns no point past the budget when the line goes on after the ink ends', () => {
    const pen = draw(4, lineTo(10, 100));
    expect(pen.kept).toHaveLength(4);
    expect(pen.kept[3].x).toBeCloseTo(3 * POINT_STEP);
    expect(penIsDry(pen)).toBe(true);
  });

  it('returns the same pen when the pen is dry', () => {
    const pen = draw(2, lineTo(1, 10));
    expect(movePen(pen, {x: 9, y: 9})).toBe(pen);
  });
});

describe('liftPen', () => {
  it('returns the last position as a point when it differs from the last point', () => {
    expect(liftPen(startPen({x: 0, y: 0}, 5), {x: 0.01, y: 0}).kept).toEqual([{x: 0, y: 0}, {x: 0.01, y: 0}]);
  });

  it('returns the same pen when the pen lifts where its last point is', () => {
    const pen = startPen({x: 0, y: 0}, 5);
    expect(liftPen(pen, {x: 0, y: 0})).toBe(pen);
  });

  it('returns the same pen when no ink is left for the last position', () => {
    const pen = startPen({x: 0, y: 0}, 1);
    expect(liftPen(pen, {x: 1, y: 1})).toBe(pen);
  });
});

describe('strokePath', () => {
  it('returns an empty path when there is no point', () => {
    expect(strokePath([])).toBe('');
  });

  it('returns a dot when there is one point', () => {
    expect(strokePath([{x: 1, y: 2}])).toBe('M1 2L1 2');
  });

  it('returns a straight line when there are two points', () => {
    expect(strokePath([{x: 0, y: 0}, {x: 1, y: 0.5}])).toBe('M0 0L1 0.5');
  });

  it('returns curves through the midpoints when there are four points', () => {
    expect(strokePath([{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 2, y: 1}])).toBe('M0 0Q1 0 1 0.5Q1 1 1.5 1L2 1');
  });

  it('returns numbers of at most 3 decimals when the points have more', () => {
    expect(strokePath([{x: 1 / 3, y: 2 / 3}, {x: 1, y: 1}])).toBe('M0.333 0.667L1 1');
  });
});
