import {describe, expect, it} from 'vitest';
import {INK_WRITE_LIMIT, INK_WRITE_LIMIT_STORAGE_KEY, inkWriteDecision, inkWriteLimitFrom} from '@/lib/scribble/writeLimit';

const everySecondFrom = (start: number, count: number) => Array.from({length: count}, (_, index) => start + index * 1000);

describe('INK_WRITE_LIMIT', () => {
  it('returns 20 writes in 30 seconds and the storage key when the constants are read', () => {
    expect([INK_WRITE_LIMIT, INK_WRITE_LIMIT_STORAGE_KEY]).toEqual([{writes: 20, windowMs: 30_000}, 'otb-ink-write-limit']);
  });
});

describe('inkWriteDecision', () => {
  it("returns 'write' when no write was made before", () => {
    expect(inkWriteDecision([], 5000)).toBe('write');
  });

  it("returns 'write' when 19 writes were made in the last 30 seconds", () => {
    expect(inkWriteDecision(everySecondFrom(1000, 19), 20_000)).toBe('write');
  });

  it("returns 'hold' when 20 writes were made in the last 30 seconds", () => {
    expect(inkWriteDecision(everySecondFrom(1000, 20), 21_000)).toBe('hold');
  });

  it("returns 'hold' when the oldest of 20 writes was made 29.999 seconds ago", () => {
    expect(inkWriteDecision(everySecondFrom(1000, 20), 30_999)).toBe('hold');
  });

  it("returns 'write' when the oldest of 20 writes was made 30 seconds ago", () => {
    expect(inkWriteDecision(everySecondFrom(1000, 20), 31_000)).toBe('write');
  });

  it("returns 'write' when 25 writes were made and 19 of them in the last 30 seconds", () => {
    expect(inkWriteDecision(everySecondFrom(1000, 25), 36_000)).toBe('write');
  });

  it("returns 'hold' when 20 writes have times after now", () => {
    expect(inkWriteDecision(everySecondFrom(50_000, 20), 1000)).toBe('hold');
  });

  it('returns the same decision when the times are given in another order', () => {
    const times = everySecondFrom(1000, 20);
    expect(inkWriteDecision([...times].reverse(), 30_999)).toBe('hold');
    expect(inkWriteDecision([...times].reverse(), 31_000)).toBe('write');
  });

  it("returns 'hold' when the limit is 2 writes in a day and 2 writes were made hours ago", () => {
    expect(inkWriteDecision([0, 1000], 20_000_000, {writes: 2, windowMs: 86_400_000})).toBe('hold');
  });

  it("returns 'hold' for a first write when the limit is 0 writes", () => {
    expect(inkWriteDecision([], 0, {writes: 0, windowMs: 30_000})).toBe('hold');
  });
});

describe('inkWriteLimitFrom', () => {
  it('returns the default limit when nothing is stored', () => {
    expect(inkWriteLimitFrom(null)).toBe(INK_WRITE_LIMIT);
  });

  it('returns the stored limit when it is lower than the default', () => {
    expect(inkWriteLimitFrom('{"writes":2,"windowMs":86400000}')).toEqual({writes: 2, windowMs: 86_400_000});
    expect(inkWriteLimitFrom('{"writes":0,"windowMs":30000}')).toEqual({writes: 0, windowMs: 30_000});
  });

  it.each([
    ['more writes than the default', '{"writes":21,"windowMs":30000}'],
    ['a shorter window than the default', '{"writes":20,"windowMs":29999}'],
    ['a window longer than a day', '{"writes":2,"windowMs":86400001}'],
    ['a negative count', '{"writes":-1,"windowMs":30000}'],
    ['a count that is not a whole number', '{"writes":1.5,"windowMs":30000}'],
    ['a count as text', '{"writes":"2","windowMs":30000}'],
    ['a missing window', '{"writes":2}'],
    ['an extra key', '{"writes":2,"windowMs":30000,"more":1}'],
    ['text that is not JSON', 'writes=2'],
    ['an empty text', ''],
    ['null as JSON', 'null'],
  ])('returns the default limit when the stored text has %s', (_name, stored) => {
    expect(inkWriteLimitFrom(stored)).toBe(INK_WRITE_LIMIT);
  });
});
