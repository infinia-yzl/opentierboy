import fs from 'node:fs';
import path from 'node:path';
import LZString from 'lz-string';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import TierCortex from '@/lib/TierCortex';
import {checkLegacyState, LEGACY_LINK_LIMITS} from '@/lib/legacyLinkLimits';
import {decodeState} from '@/lib/state';
import {isVersionedValue} from '@/lib/state/decode';
import sharedLinks from '../fixtures/shared-links.json';
import {lzBomb, lzWithRun} from './support/lzStream';

/**
 * Legacy links (v0, v1, v2) with bad data: TierCortex rejects them after the frozen decoder
 * (A29), so the page falls back to the template and /api/og to the default image.
 */

const lz = (value: unknown) => LZString.compressToEncodedURIComponent(JSON.stringify(value));

const stateDir = path.resolve(__dirname, '../fixtures/state');
// The legacy golden links. v3 links (tests/fixtures/state/v3.json) have their own limits.
const GOLDEN = [
  ...sharedLinks.map(link => ({id: link.id, state: link.state})),
  ...fs.readdirSync(stateDir).filter(file => file.endsWith('.json'))
    .flatMap(file => JSON.parse(fs.readFileSync(path.join(stateDir, file), 'utf8')) as {id: string; format: string; state: string}[])
    .filter(entry => entry.format !== 'v3'),
];

const L = LEGACY_LINK_LIMITS;
const tier = (n: unknown, t: unknown[] = [], i: unknown = 'tier-s') => ({i, n, t});
const UNRANKED = tier('', [{i: 'image-overwatch-win.webp'}], 'uncategorized');
const v2 = (tiers: unknown[], title?: unknown) => lz(title === undefined ? {tiers} : {tiers, title});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  errorSpy.mockRestore();
});

const decode = (state: string) => new TierCortex().decodeTierStateFromURL(state);

describe('legacy link limits', () => {
  it('leave every golden link far below each limit', () => {
    const largest = {json: 0, tiers: 0, items: 0};
    for (const {id, state} of GOLDEN) {
      const json = LZString.decompressFromEncodedURIComponent(state)!;
      largest.json = Math.max(largest.json, json.length);
      const decoded = decodeState(state)!;
      const check = checkLegacyState(decoded);
      expect(check.ok, id).toBe(true);
      expect(decode(state), id).not.toBeNull();
      largest.tiers = Math.max(largest.tiers, decoded.tiers.length);
      largest.items = Math.max(largest.items, decoded.tiers.reduce((sum, row) => sum + row.items.length, 0));
    }
    // The 430-item fixture is among them.
    expect(largest.items).toBe(430);
    expect(largest.json * 10).toBeLessThan(L.maxJsonLength);
    expect(largest.tiers * 10).toBeLessThan(L.maxTiers);
    expect(largest.items * 10).toBeLessThan(L.maxItems);
  });

  it('accept a list exactly at the row and item limits, with text of any length (A43)', () => {
    const items = Array.from({length: L.maxItems}, (_, index) => ({i: `custom-${index}`, c: index === 0 ? 'l'.repeat(10_000) : 'x'}));
    const tiers = Array.from({length: L.maxTiers}, (_, index) => tier(index === 0 ? 'n'.repeat(10_000) : 'T', [], `tier-${index}`));
    tiers[0].t = items.slice(0, L.maxItems - 1);
    tiers[1].t = [{i: 'i'.repeat(10_000)}];
    const decoded = decode(v2(tiers, 't'.repeat(100_000)));
    expect(decoded).not.toBeNull();
    expect(decoded!.tiers).toHaveLength(L.maxTiers);
    expect(decoded!.tiers[0].name).toHaveLength(10_000);
    expect(decoded!.title).toHaveLength(100_000);
  });

  it('reject a list one past the row or item limit', () => {
    const over = [
      v2(Array.from({length: L.maxTiers + 1}, (_, index) => tier('T', [], `tier-${index}`))),
      v2([tier('S', Array.from({length: L.maxItems}, (_, index) => ({i: `c${index}`}))), UNRANKED]),
    ];
    for (const state of over) expect(decode(state)).toBeNull();
  });

  it('reject a link whose JSON is longer than the cap, before decompressing it', () => {
    const lastError = () => String((errorSpy.mock.calls.at(-1) as unknown[] | undefined)?.[1]);
    const template = '{"tiers":[{"i":"tier-s","n":"{run}","t":[]}]}';
    const outline = template.length - '{run}'.length;

    // Exactly at the cap, the link decodes: a tier name of almost a million characters.
    const atCap = lzWithRun(template, 'x', L.maxJsonLength - outline);
    expect(atCap.outputLength).toBe(L.maxJsonLength);
    expect(decode(atCap.input)!.tiers[0].name).toHaveLength(L.maxJsonLength - outline);

    // One character more, and the link stops before lz-string decompresses it.
    const overCap = lzWithRun(template, 'x', L.maxJsonLength - outline + 1);
    expect(decode(overCap.input)).toBeNull();
    expect(lastError()).toContain(`more than ${L.maxJsonLength} characters`);

    // A tier name of 5 million characters in an 11,000-character link (A29), and a
    // link that lz-string would expand to 12.5 million characters.
    const hugeName = lzWithRun(template, 'x', 5_000_000);
    expect(hugeName.input.length).toBeLessThan(12_000);
    const bomb = lzBomb(5_000);
    expect(bomb.outputLength).toBeGreaterThan(12_000_000);

    const started = performance.now();
    expect(decode(hugeName.input)).toBeNull();
    expect(lastError()).toContain(`more than ${L.maxJsonLength} characters`);
    expect(decode(bomb.input)).toBeNull();
    expect(lastError()).toContain(`more than ${L.maxJsonLength} characters`);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe('legacy link type checks', () => {
  it('reject values that are not text where text belongs', () => {
    const bad = {
      'an object tier name': v2([tier({text: 'S'}), UNRANKED], 'Bad tier name'),
      'a number tier name': v2([tier(2), UNRANKED]),
      'a missing tier name': v2([{i: 'tier-s', t: []}, UNRANKED]),
      'an object title': v2([tier('S'), UNRANKED], {text: 'Bad title'}),
      'a number title': v2([tier('S'), UNRANKED], 7),
      'a list as title': v2([tier('S'), UNRANKED], ['a']),
      'a number tier id': v2([tier('S', [], 1), UNRANKED]),
      'a number item id': v2([tier('S', [5]), UNRANKED]),
      'an object item id': v2([tier('S', [{i: {}}]), UNRANKED]),
      'an object item label': v2([tier('S', [{i: 'abc', c: {}}]), UNRANKED]),
      'a number item label': v2([tier('S', [{i: 'abc', c: 3}]), UNRANKED]),
      'a v0 list with an object name': lz([tier({text: 'S'}), UNRANKED]),
    };
    for (const [name, state] of Object.entries(bad)) {
      expect(decodeState(state), `${name} still decodes in the frozen decoder`).not.toBeNull();
      expect(decode(state), name).toBeNull();
    }
  });

  it('reject a list without tiers', () => {
    for (const state of [lz({tiers: []}), lz({tiers: [], title: 'Empty'}), lz([])]) {
      expect(decodeState(state)).not.toBeNull();
      expect(decode(state)).toBeNull();
    }
  });

  it('read a title or label of null as absent, as the app always did', () => {
    const decoded = decode(v2([tier('S', [{i: 'abc', c: null}, {i: 'image-overwatch-mau.webp', c: null}]), UNRANKED], null));
    expect(decoded).not.toBeNull();
    expect(decoded!.title).toBeUndefined();
    expect(decoded!.tiers[0].items.map(item => item.content)).toEqual(['', 'Mauga']);
    expect(checkLegacyState(decodeState(v2([tier('S', [{i: 'abc', c: null}])], null))!))
      .toEqual({ok: true, state: {version: 1, tiers: [{id: 'tier-s', name: 'S', items: [{id: 'abc'}]}]}});
  });

  it('keep an empty title, empty names and empty labels', () => {
    const decoded = decode(v2([tier('', [{i: 'abc', c: ''}]), UNRANKED], ''));
    expect(decoded).toEqual({title: '', tiers: [
      {id: 'tier-s', name: '', items: [{id: 'abc', content: '', imageUrl: expect.any(String)}]},
      {id: 'uncategorized', name: '', items: [expect.objectContaining({id: 'image-overwatch-win.webp', content: 'Winston'})]},
    ]});
  });

  it('apply to legacy values only', () => {
    // Golden legacy links go to the legacy decoder; "3." values go to the v3 decoder, which
    // has its own limits (lib/state/limits.ts).
    for (const {state} of GOLDEN) expect(isVersionedValue(state)).toBe(false);
    expect(isVersionedValue('3.abc')).toBe(true);
    expect(isVersionedValue('4.abc')).toBe(false);
  });
});
