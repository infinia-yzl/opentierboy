import fs from 'node:fs';
import path from 'node:path';
import LZString from 'lz-string';
import {afterEach, describe, expect, it, vi} from 'vitest';
import TierCortex, {uniqueTierIds} from '@/lib/TierCortex';
import sharedLinks from '../fixtures/shared-links.json';
import {PreRefactorTierCortex} from './support/TierCortex.pre-refactor';
import {randomAppStates, seededRandom} from './support/randomStates';

/**
 * TierCortex now hands the link format to lib/state. These tests prove that nothing a user
 * can see changed: the same links are written, and every link decodes to the same items,
 * compared with a frozen copy of TierCortex from before the change.
 *
 * Phase 5a changed some results on purpose, and the comparison allows exactly these:
 * - links with bad data no longer decode (A29, lib/legacyLinkLimits.ts): no tiers, or a value
 *   that is not text where text belongs;
 * - a link that is not complete lz-string data stops before the decoder, with its own message;
 * - an item id that appears twice keeps only its first place (A32);
 * - a tier id that appears twice keeps its first row, and later rows get new ids (A38);
 * - the placeholder tile of an unknown item uses a relative image URL (A37).
 */

const lz = (text: string) => LZString.compressToEncodedURIComponent(text);

const stateDir = path.resolve(__dirname, '../fixtures/state');
const fixtureStates = fs.readdirSync(stateDir)
  .filter(file => file.endsWith('.json'))
  .flatMap(file => (JSON.parse(fs.readFileSync(path.join(stateDir, file), 'utf8')) as {state: string}[]))
  .map(entry => entry.state);

const MALFORMED = [
  '', 'this-is-not-a-valid-state', 'N', '3.', `3.${sharedLinks[1].state}`,
  lz('hello'), lz('42'), lz('null'), lz('{}'), lz('{"tiers":"x"}'), lz('{"tiers":[null]}'),
  lz('[{"i":"a","n":"b"}]'), lz('[{"i":"a","n":"b","t":"x"}]'), lz('[{"i":"a","n":"b","t":[null]}]'),
  lz('{"tiers":[{"i":1,"n":2,"t":[5,{"i":"x","c":null}]}],"title":7}'),
  lz('{"tiers":[],"title":""}'), lz('{"tiers":[],"title":null}'), lz('[{"i":"a","n":"b","t":[{"i":"c","c":""}]}]'),
];

function randomGarbage(count: number): string[] {
  const random = seededRandom(3);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$ .)';
  return Array.from({length: count}, () => {
    let value = 'N';
    const length = Math.floor(random() * 80);
    for (let index = 0; index < length; index++) value += alphabet[Math.floor(random() * alphabet.length)];
    return value;
  });
}

function decodeInputs(): string[] {
  const random = randomAppStates(300, 11).map(state => PreRefactorTierCortex.encodeTierStateForURL(state.title, state.tiers));
  const links = sharedLinks.map(link => link.state);
  const suffixed = [...links, ...fixtureStates].flatMap(state => [`${state}.`, `${state})`, state.replace(/\+/g, ' ')]);
  return [...links, ...fixtureStates, ...suffixed, ...random, ...MALFORMED, ...randomGarbage(500)];
}

/** Decodes with both implementations and records what each logged. */
function decodeWithBoth(input: string) {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const before = new PreRefactorTierCortex().decodeTierStateFromURL(input);
    const beforeLogs = errorSpy.mock.calls.map(call => call.map(String));
    errorSpy.mockClear();
    const after = new TierCortex().decodeTierStateFromURL(input);
    const afterLogs = errorSpy.mock.calls.map(call => call.map(String));
    return {before, after, beforeLogs, afterLogs};
  } finally {
    errorSpy.mockRestore();
  }
}

const LOG_PREFIX = 'Failed to decode tier state from URL:';

type DecodedForComparison = {title?: unknown; tiers: {id: unknown; name: unknown; items: {id: unknown; content: unknown}[]}[]};

/** True for a list that the frozen copy decodes but Phase 5a rejects on purpose (A29). */
function breaksLegacyRules(decoded: DecodedForComparison): boolean {
  const isTextOrAbsent = (value: unknown) => value === undefined || value === null || typeof value === 'string';
  return decoded.tiers.length === 0 || !isTextOrAbsent(decoded.title) || decoded.tiers.some(tier =>
    typeof tier.id !== 'string' || typeof tier.name !== 'string'
    || tier.items.some(item => typeof item.id !== 'string' || typeof item.content !== 'string'));
}

/** The list with each item id only at its first place, as Phase 5a decodes it (A32). */
function withoutDuplicateIds<T extends {tiers: {items: {id: string}[]}[]}>(decoded: T | null): T | null {
  if (decoded === null) return null;
  const seen = new Set<string>();
  return {...decoded, tiers: decoded.tiers.map(tier => ({...tier, items: tier.items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  })}))};
}

/** The list with a new id for each later row with a repeated tier id, as Phase 5a decodes it (A38). */
function withUniqueTierIds<T extends {tiers: {id: string}[]}>(decoded: T | null): T | null {
  if (decoded === null) return null;
  const ids = uniqueTierIds(decoded.tiers.map(tier => tier.id));
  return {...decoded, tiers: decoded.tiers.map((tier, index) => ({...tier, id: ids[index]}))};
}

/** The frozen copy's placeholder URLs were absolute. Phase 5a makes them relative (A37). */
const ABSOLUTE_PLACEHOLDER = /^(http:\/\/localhost:3000|https:\/\/opentierboy\.com)\/placeholder-image\.png$/;
function withRelativePlaceholders<T extends {tiers: {items: {imageUrl?: string}[]}[]}>(decoded: T | null): T | null {
  if (decoded === null) return null;
  return {...decoded, tiers: decoded.tiers.map(tier => ({...tier, items: tier.items.map(item => (
    item.imageUrl !== undefined && ABSOLUTE_PLACEHOLDER.test(item.imageUrl) ? {...item, imageUrl: '/placeholder-image.png'} : item
  ))}))};
}

/** Decodes with both implementations and expects the same result, apart from Phase 5a's changes. */
function expectSameAsBefore(input: string, label: string) {
  const {before, after, beforeLogs, afterLogs} = decodeWithBoth(input);
  if (before !== null && breaksLegacyRules(before)) {
    expect(after, label).toBeNull();
    expect(afterLogs, label).toEqual([[LOG_PREFIX, expect.stringContaining('Error: The link holds ')]]);
    return;
  }
  expect(after, label).toStrictEqual(withUniqueTierIds(withRelativePlaceholders(withoutDuplicateIds(before))));
  // A link that does not decode logs one error. The message is the same, unless the size check
  // stopped the link before the decoder because it is not complete lz-string data.
  expect(afterLogs.length, label).toBe(beforeLogs.length);
  if (afterLogs.length > 0) {
    expect(afterLogs[0][0], label).toBe(LOG_PREFIX);
    if (afterLogs[0][1] !== beforeLogs[0][1]) expect(afterLogs[0][1], label).toContain('not complete lz-string data');
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TierCortex after moving the link format to lib/state', () => {
  it('writes byte-identical links', () => {
    const states = randomAppStates(2000, 424242);
    for (let index = 0; index < states.length; index++) {
      const {title, tiers} = states[index];
      expect(TierCortex.encodeTierStateForURL(title, tiers), `random state #${index}`)
        .toBe(PreRefactorTierCortex.encodeTierStateForURL(title, tiers));
    }
  });

  it('decodes every link to the same items, and logs the same errors, on the server', () => {
    const inputs = decodeInputs();
    for (let index = 0; index < inputs.length; index++) {
      expectSameAsBefore(inputs[index], `input #${index}: ${inputs[index].slice(0, 40)}`);
    }
  });

  it('decodes every link to the same items in the browser, with uploaded images in localStorage', () => {
    const stored = JSON.stringify([
      {i: 'k3j9x0a1b', c: 'stored label', d: 'data:image/png;base64,AAAA'},
      {i: 'm0n9b8v7c', c: 'label for an empty one', d: 'data:image/png;base64,BBBB'},
      {i: 'q8w7e6r5t', c: '', d: ''},
    ]);
    vi.stubGlobal('window', {location: {origin: 'https://opentierboy.com'}});
    vi.stubGlobal('localStorage', {getItem: (key: string) => (key === 'customItems' ? stored : null), setItem: () => undefined});

    const customItems = new TierCortex().decodeTierStateFromURL(fixtureStates.find(state =>
      LZString.decompressFromEncodedURIComponent(state)?.includes('k3j9x0a1b'))!);
    expect(customItems?.tiers.flatMap(tier => tier.items).find(item => item.id === 'k3j9x0a1b')?.imageUrl)
      .toBe('data:image/png;base64,AAAA');

    for (const input of [...sharedLinks.map(link => link.state), ...fixtureStates, ...MALFORMED]) {
      expectSameAsBefore(input, input.slice(0, 40));
    }
  });

  it('still compares the links that Phase 5a changes on purpose', () => {
    // Guards the comparison above: some inputs must reach each of Phase 5a's changes.
    const results = [...MALFORMED, ...decodeInputs()].map(input => decodeWithBoth(input).before);
    expect(results.filter(before => before !== null && breaksLegacyRules(before)).length).toBeGreaterThanOrEqual(4);
    expect(results.filter(before => before !== null && !breaksLegacyRules(before)
      && JSON.stringify(withoutDuplicateIds(before)) !== JSON.stringify(before)).length).toBeGreaterThanOrEqual(10);
    expect(results.filter(before => before !== null && !breaksLegacyRules(before)
      && JSON.stringify(withUniqueTierIds(before)) !== JSON.stringify(before)).length).toBeGreaterThanOrEqual(10);
  });

  it('starts template pages and shared links with the same tiers', () => {
    const itemSet = {packageName: 'image-overwatch', packageDisplayName: 'OVERWATCH', tagName: 'tank', tagTitle: 'Tank', images: ['mau.webp', 'win.webp', 'gone.webp']};
    for (const state of [undefined, '', 'not-a-state', sharedLinks[0].state, sharedLinks[11].state]) {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(new TierCortex().getInitialTiers(state, itemSet))
        .toStrictEqual(withRelativePlaceholders({tiers: new PreRefactorTierCortex().getInitialTiers(state, itemSet)})!.tiers);
      expect(new TierCortex().getInitialTiers(state, undefined))
        .toStrictEqual(withRelativePlaceholders({tiers: new PreRefactorTierCortex().getInitialTiers(state, undefined)})!.tiers);
      errorSpy.mockRestore();
    }
  });
});

describe('TierCortex with item ids named like built-in object members', () => {
  // Phase 5a fixed this on purpose (A27): the frozen copy resolves these ids to Object.prototype
  // members, so they are compared with an unknown id here instead of with the frozen copy.
  const ODD_IDS = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'];
  const listWith = (id: string) => lz(JSON.stringify({tiers: [{i: 'a', n: 'b', t: [{i: id, c: 'Mystery'}, {i: 'image-overwatch-mau.webp'}]}]}));

  it('resolves them like an unknown id: a placeholder with the stored label', () => {
    const cortex = new TierCortex();
    const unknown = cortex.decodeTierStateFromURL(listWith('unknown-item-x'))!.tiers[0].items;
    for (const id of ODD_IDS) {
      const items = cortex.decodeTierStateFromURL(listWith(id))!.tiers[0].items;
      expect(items, id).toEqual([{...unknown[0], id}, unknown[1]]);
      expect(cortex.isCustomItem(id), id).toBe(true);
    }
  });

  it('keeps them in the next saved link, with their label', () => {
    const cortex = new TierCortex();
    for (const id of ODD_IDS) {
      const tiers = cortex.decodeTierStateFromURL(listWith(id))!.tiers;
      const saved = TierCortex.encodeTierStateForURL(undefined, tiers.map(tier => ({
        ...tier,
        items: tier.items.map(item => ({i: item.id, c: cortex.isCustomItem(item.id) ? item.content : undefined})),
      })));
      expect(LZString.decompressFromEncodedURIComponent(saved), id)
        .toBe(`{"tiers":[{"i":"a","n":"b","t":[{"i":${JSON.stringify(id)},"c":"Mystery"},{"i":"image-overwatch-mau.webp"}]}]}`);
    }
  });
});

describe('TierCortex with repeated tier ids (A38)', () => {
  it('gives each later row with a repeated id a new id, and keeps the first', () => {
    expect(uniqueTierIds(['tier-s', 'tier-a', 'tier-s', 'tier-s', 'uncategorized'])).toEqual(['tier-s', 'tier-a', 'tier-s~2', 'tier-s~3', 'uncategorized']);
    // A new id never takes an id that another row already has.
    expect(uniqueTierIds(['x', 'x', 'x~2', 'x'])).toEqual(['x', 'x~3', 'x~2', 'x~4']);
    expect(uniqueTierIds(['', ''])).toEqual(['', '~2']);
    expect(uniqueTierIds(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('decodes a legacy link with repeated tier ids into rows with their own ids', () => {
    for (const legacy of [
      lz(JSON.stringify([{i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-mau.webp', c: 'Mauga'}]}, {i: 'tier-s', n: 'A', t: [{i: 'image-overwatch-win.webp', c: 'Winston'}]}, {i: 'uncategorized', n: '', t: []}])),
      lz(JSON.stringify({tiers: [{i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-mau.webp'}]}, {i: 'tier-s', n: 'A', t: [{i: 'image-overwatch-win.webp'}]}, {i: 'uncategorized', n: '', t: []}]})),
    ]) {
      const tiers = new TierCortex().decodeTierStateFromURL(legacy)!.tiers;
      expect(tiers.map(tier => [tier.id, tier.name, tier.items.map(item => item.content)])).toEqual([
        ['tier-s', 'S', ['Mauga']],
        ['tier-s~2', 'A', ['Winston']],
        ['uncategorized', '', []],
      ]);
    }
  });
});

describe('TierCortex placeholder tiles (A37)', () => {
  const unknownLink = lz(JSON.stringify({tiers: [{i: 'tier-s', n: 'S', t: [{i: 'unknown-item-x', c: 'Mystery'}]}]}));

  it('give an unknown item a relative image URL, the same on the server and in the browser', () => {
    const onServer = new TierCortex().decodeTierStateFromURL(unknownLink)!.tiers[0].items[0];
    vi.stubGlobal('window', {location: {origin: 'https://opentierboy.com'}});
    vi.stubGlobal('localStorage', {getItem: () => null, setItem: () => undefined});
    const inBrowser = new TierCortex().decodeTierStateFromURL(unknownLink)!.tiers[0].items[0];
    expect(onServer).toEqual({id: 'unknown-item-x', content: 'Mystery', imageUrl: '/placeholder-image.png'});
    expect(inBrowser).toEqual(onServer);
  });

  it('give link previews an absolute URL for the placeholder', () => {
    const cortex = new TierCortex();
    const item = cortex.decodeTierStateFromURL(unknownLink)!.tiers[0].items[0];
    expect(cortex.getOgSafeItem(item).imageUrl).toBe('http://localhost:3000/placeholder-image.png');
  });
});

describe('TierCortex follows image-aliases.json for renamed images', () => {
  const MAUGA = {id: 'image-overwatch-mau.webp', content: 'Mauga', imageUrl: '/images/image-overwatch/mau.webp'};
  const link = (...itemIds: string[]) =>
    lz(JSON.stringify({tiers: [{i: 'tier-s', n: 'S', t: itemIds.map(id => ({i: id, c: `stored ${id}`}))}]}));
  const itemsOf = (cortex: TierCortex, state: string) => cortex.decodeTierStateFromURL(state)!.tiers[0].items;
  const placeholder = (id: string) => ({id, content: `stored ${id}`, imageUrl: '/placeholder-image.png'});

  it('ships with no aliases', async () => {
    expect((await import('@/image-aliases.json')).default).toEqual({});
  });

  it('shows the renamed image for an old id', () => {
    const cortex = new TierCortex({aliases: {'image-overwatch-old-mauga.webp': 'image-overwatch-mau.webp'}});
    expect(itemsOf(cortex, link('image-overwatch-old-mauga.webp'))).toEqual([MAUGA]);
    expect(cortex.resolveItemsFromPackage('image-overwatch', ['old-mauga.webp'])).toEqual([MAUGA]);
  });

  it('follows a chain of renames', () => {
    const cortex = new TierCortex({aliases: {
      'image-overwatch-mauga-v1.webp': 'image-overwatch-mauga-v2.webp',
      'image-overwatch-mauga-v2.webp': 'image-overwatch-mau.webp',
    }});
    expect(itemsOf(cortex, link('image-overwatch-mauga-v1.webp'))).toEqual([MAUGA]);
    expect(itemsOf(cortex, link('image-overwatch-mauga-v2.webp'))).toEqual([MAUGA]);
  });

  it('keeps only the first place of an item that appears twice after following aliases (A32)', () => {
    const cortex = new TierCortex({aliases: {
      'image-overwatch-mauga-v1.webp': 'image-overwatch-mauga-v2.webp',
      'image-overwatch-mauga-v2.webp': 'image-overwatch-mau.webp',
    }});
    // Before Phase 5a this showed Mauga twice, with the same drag id twice.
    expect(itemsOf(cortex, link('image-overwatch-mauga-v1.webp', 'image-overwatch-mauga-v2.webp'))).toEqual([MAUGA]);
    const twoRows = lz(JSON.stringify({tiers: [
      {i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-win.webp'}, {i: 'image-overwatch-mauga-v2.webp'}]},
      {i: 'uncategorized', n: '', t: [{i: 'image-overwatch-mau.webp'}, {i: 'image-overwatch-win.webp'}, {i: 'k3j9x0a1b', c: 'a'}, {i: 'k3j9x0a1b', c: 'b'}]},
    ]}));
    const tiers = cortex.decodeTierStateFromURL(twoRows)!.tiers;
    expect(tiers.map(tier => tier.items.map(item => item.content))).toEqual([['Winston', 'Mauga'], ['a']]);
  });

  it('falls back to a placeholder when an alias loops or leads nowhere', () => {
    const cortex = new TierCortex({aliases: {
      'image-a-loop1.webp': 'image-a-loop2.webp',
      'image-a-loop2.webp': 'image-a-loop1.webp',
      'image-a-gone.webp': 'image-a-also-gone.webp',
      'image-a-proto.webp': 'toString',
    }});
    const ids = ['image-a-loop1.webp', 'image-a-gone.webp', 'image-a-proto.webp'];
    expect(itemsOf(cortex, link(...ids))).toEqual(ids.map(placeholder));
  });

  it('prefers a shipped id over an alias for it', () => {
    const cortex = new TierCortex({aliases: {'image-overwatch-mau.webp': 'image-overwatch-win.webp'}});
    expect(itemsOf(cortex, link('image-overwatch-mau.webp'))).toEqual([MAUGA]);
  });

  it('writes the new id the next time the list is saved', () => {
    const cortex = new TierCortex({aliases: {'image-overwatch-old-mauga.webp': 'image-overwatch-mau.webp'}});
    const tiers = cortex.decodeTierStateFromURL(link('image-overwatch-old-mauga.webp'))!.tiers;
    // What TierListManager.handleTiersUpdate hands to the encoder.
    const forEncoding = tiers.map(tier => ({
      ...tier,
      items: tier.items.map(item => ({i: item.id, c: cortex.isCustomItem(item.id) ? item.content : undefined})),
    }));
    const saved = TierCortex.encodeTierStateForURL(undefined, forEncoding);
    expect(LZString.decompressFromEncodedURIComponent(saved))
      .toBe('{"tiers":[{"i":"tier-s","n":"S","t":[{"i":"image-overwatch-mau.webp"}]}]}');
  });
});

describe('TierCortex limits for legacy links (A29)', () => {
  // Links are compressed, so a short link can hold a huge list: the review found a 5,760-character
  // link that holds a 5-million-character tier name (it blocked /api/og and every other request
  // to `next start` for over a minute), and a 12 KB link that expands to 10 MB of JSON. Never
  // send such a link to a server in a test. This modest case keeps the test fast.
  const hugeName = 'x'.repeat(300_000);
  const state = lz(JSON.stringify({tiers: [{i: 'tier-s', n: hugeName, t: []}, {i: 'uncategorized', n: '', t: []}]}));

  it('the test link with a huge tier name is short', () => {
    expect(state.length).toBeLessThan(2_000);
  });

  it('rejects a link whose decoded list is far larger than any real list', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(new TierCortex().decodeTierStateFromURL(state)).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(LOG_PREFIX, expect.any(Error));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
