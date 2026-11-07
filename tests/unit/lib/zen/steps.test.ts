import {describe, expect, it} from 'vitest';
import {entryPaths, followAddress, listSteps, pathOf, pathsToRemember, SINGLE_STEP, startLog} from '@/lib/zen/steps';

/** The Zen bar's step count (lib/zen/steps.ts, read by components/useListSteps.ts). */

const TANK = '/rank/overwatch/tank';
const HOME = '/';

describe('listSteps', () => {
  it('returns step 7 of 13 when the current entry is the 7th of 13 entries of the list', () => {
    const paths = Array.from({length: 13}, () => TANK);
    expect(listSteps(paths, 6)).toEqual({step: 7, total: 13});
  });

  it('returns only the run of the current list when other pages come before and after it', () => {
    expect(listSteps([HOME, TANK, TANK, TANK, '/about'], 2)).toEqual({step: 2, total: 3});
  });

  it('returns only the current run when the same list page appears again after another page', () => {
    expect(listSteps([TANK, TANK, HOME, TANK, TANK, TANK], 4)).toEqual({step: 2, total: 3});
  });

  it('returns step 1 of 1 when the current entry has no known path', () => {
    expect(listSteps([TANK, null], 1)).toEqual(SINGLE_STEP);
  });

  it('returns step 1 of 1 when the current index is outside the entries', () => {
    expect(listSteps([TANK], 3)).toEqual(SINGLE_STEP);
  });
});

describe('pathOf', () => {
  const base = 'https://opentierboy.com/rank/overwatch/tank?state=1';

  it('returns the path when the address is a full URL with a state parameter', () => {
    expect(pathOf('https://opentierboy.com/rank/overwatch/tank?state=abc', base)).toBe(TANK);
  });

  it('returns the path when the address is relative', () => {
    expect(pathOf('/rank/overwatch/support?state=abc', base)).toBe('/rank/overwatch/support');
  });

  it('returns null when the address is missing', () => {
    expect(pathOf(null, base)).toBeNull();
  });
});

describe('followAddress', () => {
  const a = `${TANK}?state=a`;
  const b = `${TANK}?state=b`;
  const c = `${TANK}?state=c`;

  it('returns a log with the new entry last when the change is a push', () => {
    expect(followAddress(startLog(TANK), {kind: 'push', address: a})).toEqual({addresses: [TANK, a], index: 1});
  });

  it('returns a log without the later entries when a push follows Back', () => {
    const log = {addresses: [TANK, a, b], index: 1};
    expect(followAddress(log, {kind: 'push', address: c})).toEqual({addresses: [TANK, a, c], index: 2});
  });

  it('returns a log with the current entry replaced when the change is a replace', () => {
    expect(followAddress({addresses: [TANK, a], index: 1}, {kind: 'replace', address: b})).toEqual({addresses: [TANK, b], index: 1});
  });

  it('returns the entry before when a traverse without a direction lands on its address', () => {
    expect(followAddress({addresses: [TANK, a, b], index: 2}, {kind: 'traverse', address: a})).toEqual({addresses: [TANK, a, b], index: 1});
  });

  it('returns the entry after when a traverse without a direction lands on its address', () => {
    expect(followAddress({addresses: [TANK, a, b], index: 0}, {kind: 'traverse', address: a})).toEqual({addresses: [TANK, a, b], index: 1});
  });

  it('returns the entry after when the direction is Forward and the entries before and after have the same address', () => {
    expect(followAddress({addresses: [a, b, a], index: 1}, {kind: 'traverse', address: a, direction: 1})).toEqual({addresses: [a, b, a], index: 2});
  });

  it('returns a new log when a traverse lands on an address next to none', () => {
    expect(followAddress({addresses: [TANK, a], index: 1}, {kind: 'traverse', address: c})).toEqual(startLog(c));
  });

  it('returns a new log when a traverse with a direction goes past the first entry', () => {
    expect(followAddress(startLog(a), {kind: 'traverse', address: b, direction: -1})).toEqual(startLog(b));
  });
});

describe('entryPaths', () => {
  const base = 'https://opentierboy.com/rank/overwatch/tank?state=1';

  it('returns the remembered path of an entry when the browser hides its address', () => {
    const entries = [{key: 'k1', url: null}, {key: 'k2', url: `https://opentierboy.com${TANK}?state=b`}];
    expect(entryPaths(entries, {k1: TANK}, base)).toEqual([TANK, TANK]);
  });

  it('returns null for an entry when its address is hidden and its key is not remembered', () => {
    expect(entryPaths([{key: 'k1', url: null}], {}, base)).toEqual([null]);
  });

  it('returns the path of the address when the remembered path differs', () => {
    expect(entryPaths([{key: 'k1', url: `https://opentierboy.com${TANK}`}], {k1: '/about'}, base)).toEqual([TANK]);
  });
});

describe('pathsToRemember', () => {
  it('returns the known paths by entry key, without the unknown ones, when some paths are null', () => {
    const entries = [{key: 'k1', url: null}, {key: 'k2', url: null}, {key: 'k3', url: null}];
    expect(pathsToRemember(entries, [TANK, null, HOME])).toEqual({k1: TANK, k3: HOME});
  });
});
