import {describe, expect, it} from 'vitest';
import {modes, mostCommon} from '@/lib/extract/modes';

describe('modes', () => {
  it('returns the most voted values first when values gather around two sizes', () => {
    const values = [100, 100, 101, 99, 100, 50, 50, 51, 7];
    const found = modes(values, 2, 3);
    expect(found.map((mode) => mode.value)).toEqual([100, 50, 7]);
    expect(found[0].votes).toBe(5);
  });

  it('returns no mode when there are no values', () => {
    expect(modes([])).toEqual([]);
  });

  it('returns at most top modes when there are more groups', () => {
    expect(modes([10, 30, 50, 70, 90], 2, 2)).toHaveLength(2);
  });
});

describe('mostCommon', () => {
  it('returns the smallest value when two values are as common', () => {
    expect(mostCommon([5, 3, 5, 3, 9])).toBe(3);
  });
});
