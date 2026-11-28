import {describe, expect, it} from 'vitest';
import {INK_SUPPLY, inkLevel, inkStatusText, LOW_INK_PERCENT} from '@/lib/scribble/supply';

describe('INK_SUPPLY', () => {
  it('returns 500 points and a low mark of 30 percent when the constants are read', () => {
    expect([INK_SUPPLY, LOW_INK_PERCENT]).toEqual([500, 30]);
  });
});

describe('inkLevel', () => {
  it('returns plenty at 100 percent when no point is spent', () => {
    expect(inkLevel(0)).toEqual({state: 'plenty', left: 500, percent: 100});
  });

  it('returns plenty when 151 of 500 points are left', () => {
    expect(inkLevel(349)).toEqual({state: 'plenty', left: 151, percent: 31});
  });

  it('returns low at 30 percent when 150 of 500 points are left', () => {
    expect(inkLevel(350)).toEqual({state: 'low', left: 150, percent: 30});
  });

  it('returns low at 1 percent when 1 point is left', () => {
    expect(inkLevel(499)).toEqual({state: 'low', left: 1, percent: 1});
  });

  it('returns out at 0 percent when every point is spent', () => {
    expect(inkLevel(500)).toEqual({state: 'out', left: 0, percent: 0});
  });

  it('returns out when more points are spent than the supply has', () => {
    expect(inkLevel(600)).toEqual({state: 'out', left: 0, percent: 0});
  });

  it('returns the share of the given supply when the supply is 10', () => {
    expect(inkLevel(8, 10)).toEqual({state: 'low', left: 2, percent: 20});
  });
});

describe('inkStatusText', () => {
  it('returns null when the level is plenty', () => {
    expect(inkStatusText(inkLevel(0))).toBeNull();
  });

  it('returns "Ink 18% left" when 90 of 500 points are left', () => {
    expect(inkStatusText(inkLevel(410))).toBe('Ink 18% left');
  });

  it('returns the way to get ink back when the level is out', () => {
    expect(inkStatusText(inkLevel(500))).toBe('Out of ink. Remove a note to get ink back.');
  });
});
