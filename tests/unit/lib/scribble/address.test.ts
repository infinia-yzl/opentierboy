import {describe, expect, it} from 'vitest';
import {addressWithoutInk, inkAddressLength, inkInSearch, inkParam, searchWithInk} from '@/lib/scribble/address';

describe('inkParam', () => {
  it.each([null, undefined, ''])('returns null when the value is %j', (value) => {
    expect(inkParam(value)).toBeNull();
  });

  it('returns the value with + for each space when the address read + as a space', () => {
    expect(inkParam('1.ab cd e')).toBe('1.ab+cd+e');
  });
});

describe('inkInSearch', () => {
  it('returns null when the search has no ink value', () => {
    expect(inkInSearch('?state=3.abc')).toBeNull();
    expect(inkInSearch('')).toBeNull();
  });

  it('returns the value with its + characters when the search has state and ink', () => {
    expect(inkInSearch('?state=3.a+b&ink=1.c+d$e-')).toBe('1.c+d$e-');
  });

  it('returns the first value when the search has two ink values', () => {
    expect(inkInSearch('?ink=1.first&ink=1.second')).toBe('1.first');
  });
});

describe('searchWithInk', () => {
  it('returns the search with the ink value at its end, and every other value as written, when ink is added', () => {
    expect(searchWithInk('?state=3.a+b%2Bc$d', '1.x+y')).toBe('?state=3.a+b%2Bc$d&ink=1.x+y');
  });

  it('returns one ink value when the search had one before', () => {
    expect(searchWithInk('?ink=1.old&state=3.abc', '1.new')).toBe('?state=3.abc&ink=1.new');
  });

  it('returns no ink value when the search had two and ink is null', () => {
    expect(searchWithInk('?ink=1.a&state=3.abc&ink=1.b&%69nk=1.c', null)).toBe('?state=3.abc');
  });

  it('returns an empty search when ink was its only value and ink is null', () => {
    expect(searchWithInk('?ink=1.a', null)).toBe('');
  });

  it('returns a search with ink alone when the search was empty', () => {
    expect(searchWithInk('', '1.a')).toBe('?ink=1.a');
  });

  it('returns a value named like ink as it is when its name only starts with ink', () => {
    expect(searchWithInk('?inks=1&linking=2&ink=1.a', null)).toBe('?inks=1&linking=2');
  });
});

describe('addressWithoutInk', () => {
  it('returns the address without its ink value when it has state and ink', () => {
    expect(addressWithoutInk('https://opentierboy.com/rank/overwatch/tank?state=3.a+b&ink=1.c')).toBe('https://opentierboy.com/rank/overwatch/tank?state=3.a+b');
  });

  it('returns the address without a question mark when ink was its only value', () => {
    expect(addressWithoutInk('https://opentierboy.com/rank?ink=1.c#top')).toBe('https://opentierboy.com/rank#top');
  });

  it('returns the address as it is when it has no ink value', () => {
    expect(addressWithoutInk('https://opentierboy.com/rank?state=3.a')).toBe('https://opentierboy.com/rank?state=3.a');
    expect(addressWithoutInk('https://opentierboy.com/rank')).toBe('https://opentierboy.com/rank');
  });
});

describe('inkAddressLength', () => {
  it('returns 0 when there is no ink', () => {
    expect(inkAddressLength(null)).toBe(0);
  });

  it('returns the length of the value and of "&ink=" when there is ink', () => {
    expect(inkAddressLength('1.abc')).toBe('&ink=1.abc'.length);
  });
});
