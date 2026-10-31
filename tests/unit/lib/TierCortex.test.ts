import fs from 'node:fs';
import path from 'node:path';
import LZString from 'lz-string';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createTierCortex, type TierCortex} from '@/lib/TierCortex';
import {encodeTierStateForURL, rowTemplateOf, uniqueTierIds} from '@/lib/listLink';
import {decodeState, deviceImageIdForUpload} from '@/lib/state';
import sharedLinks from '../../fixtures/shared-links.json';
import {PreRefactorTierCortex} from '../support/TierCortex.pre-refactor';
import {randomAppStates, seededRandom} from '../support/randomStates';
import {isCustomItem, packageItemLookup, resolveItemsFromPackage} from '@/lib/packageItems';
import imagesetConfig from '@/imageset.config.json';
import ImageSetConfig from '@/models/ImageSet';

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
 * Phase 5b adds one: an upload or unknown id shows under the id its v3 link writes
 * (`legacy-<id>` for an id that breaks the device id rule, A42).
 */

const lz = (text: string) => LZString.compressToEncodedURIComponent(text);

const stateDir = path.resolve(__dirname, '../../fixtures/state');

const allFixtures = fs.readdirSync(stateDir)
  .filter(file => file.endsWith('.json'))
  .flatMap(file => (JSON.parse(fs.readFileSync(path.join(stateDir, file), 'utf8')) as {format: string; state: string}[]));

// The comparison with the pre-refactor copy covers the legacy formats only: v3 links are new
// in Phase 5b, so the old copy cannot read them. The "v3 links" tests below cover them.
const fixtureStates = allFixtures.filter(entry => entry.format !== 'v3').map(entry => entry.state);

const v3FixtureStates = allFixtures.filter(entry => entry.format === 'v3').map(entry => entry.state);

// '3.' values go to the v3 decoder since Phase 5b: see "v3 links" below.
const MALFORMED = [
  '', 'this-is-not-a-valid-state', 'N',
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
    const after = createTierCortex().decodeTierStateFromURL(input);
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

/** Uploads and unknown ids under the id their v3 link writes, as Phase 5b decodes them (A42). */
function withLegacyUploadIds<T extends {tiers: {items: {id: string}[]}[]}>(decoded: T | null): T | null {
  if (decoded === null) return null;
  const cortex = createTierCortex();
  return {...decoded, tiers: decoded.tiers.map(tier => ({...tier, items: tier.items.map(item => (
    typeof item.id === 'string' && cortex.isCustomItem(item.id) ? {...item, id: deviceImageIdForUpload(item.id) ?? item.id} : item
  ))}))};
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
  expect(after, label).toStrictEqual(withUniqueTierIds(withRelativePlaceholders(withoutDuplicateIds(withLegacyUploadIds(before)))));
  // A link that does not decode logs one error. The message is the same, unless the size check
  // stopped the link before the decoder because it is not complete lz-string data.
  expect(afterLogs.length, label).toBe(beforeLogs.length);
  if (afterLogs.length > 0) {
    expect(afterLogs[0][0], label).toBe(LOG_PREFIX);
    if (afterLogs[0][1] !== beforeLogs[0][1]) expect(afterLogs[0][1], label).toContain('not complete lz-string data');
  }
}

/**
 * TierCortex is a factory (A47): createTierCortex binds the functions of lib/packageItems.ts,
 * lib/listLink.ts and lib/linkPreview.ts to one configuration (aliases, image-set config, base
 * URL). The item lookup is built once per image-set config and shared by every TierCortex.
 */

const APP_CONFIG = imagesetConfig as ImageSetConfig;

const TINY_CONFIG = {
  packages: {
    'image-tiny': {
      displayName: 'Tiny',
      images: [{filename: 'one.webp', label: 'One', tags: ['all']}],
      tags: {all: {title: 'All', description: 'All', category: 'general'}},
    },
  },
} as unknown as ImageSetConfig;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createTierCortex compared with PreRefactorTierCortex', () => {
  it('returns links byte-identical to PreRefactorTierCortex when encoding 2,000 random states', () => {
    const states = randomAppStates(2000, 424242);
    for (let index = 0; index < states.length; index++) {
      const {title, tiers} = states[index];
      expect(encodeTierStateForURL(title, tiers), `random state #${index}`)
        .toBe(PreRefactorTierCortex.encodeTierStateForURL(title, tiers));
    }
  });

  it('returns the lists and errors of PreRefactorTierCortex when decoding every test link on the server', () => {
    const inputs = decodeInputs();
    for (let index = 0; index < inputs.length; index++) {
      expectSameAsBefore(inputs[index], `input #${index}: ${inputs[index].slice(0, 40)}`);
    }
  });

  // Phase 5c: TierCortex no longer reads uploads from localStorage. The editor loads them from
  // the device image store in an effect, so the browser decodes every link exactly as the server.
  it('returns the server result and calls no localStorage.getItem when decoding every link in the browser', () => {
    const inputs = [...sharedLinks.map(link => link.state), ...fixtureStates, ...MALFORMED];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const onServer = inputs.map(input => createTierCortex().decodeTierStateFromURL(input));
      const getItem = vi.fn(() => JSON.stringify([{i: 'k3j9x0a1b', c: 'stored label', d: 'data:image/png;base64,AAAA'}]));
      vi.stubGlobal('window', {location: {origin: 'https://opentierboy.com'}});
      vi.stubGlobal('localStorage', {getItem, setItem: () => undefined});
      inputs.forEach((input, index) => {
        expect(createTierCortex().decodeTierStateFromURL(input), input.slice(0, 40)).toStrictEqual(onServer[index]);
      });
      expect(getItem).not.toHaveBeenCalled();
      const upload = onServer.flatMap(list => list?.tiers ?? []).flatMap(tier => tier.items).find(item => item.id === 'k3j9x0a1b');
      expect(upload?.imageUrl).toBe('/placeholder-image.png');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('returns at least 4 A29, 10 A32 and 10 A38 cases when PreRefactorTierCortex decodes the test links', () => {
    // Guards the comparison above: some inputs must reach each of Phase 5a's changes.
    const results = [...MALFORMED, ...decodeInputs()].map(input => decodeWithBoth(input).before);
    expect(results.filter(before => before !== null && breaksLegacyRules(before)).length).toBeGreaterThanOrEqual(4);
    expect(results.filter(before => before !== null && !breaksLegacyRules(before)
      && JSON.stringify(withoutDuplicateIds(before)) !== JSON.stringify(before)).length).toBeGreaterThanOrEqual(10);
    expect(results.filter(before => before !== null && !breaksLegacyRules(before)
      && JSON.stringify(withUniqueTierIds(before)) !== JSON.stringify(before)).length).toBeGreaterThanOrEqual(10);
  });

  it('returns the tiers of PreRefactorTierCortex when getInitialTiers gets a template or a shared link', () => {
    const itemSet = {packageName: 'image-overwatch', packageDisplayName: 'OVERWATCH', tagName: 'tank', tagTitle: 'Tank', images: ['mau.webp', 'win.webp', 'gone.webp']};
    for (const state of [undefined, '', 'not-a-state', sharedLinks[0].state, sharedLinks[11].state]) {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(createTierCortex().getInitialTiers(state, itemSet))
        .toStrictEqual(withRelativePlaceholders({tiers: new PreRefactorTierCortex().getInitialTiers(state, itemSet)})!.tiers);
      expect(createTierCortex().getInitialTiers(state, undefined))
        .toStrictEqual(withRelativePlaceholders({tiers: new PreRefactorTierCortex().getInitialTiers(state, undefined)})!.tiers);
      errorSpy.mockRestore();
    }
  });
});

describe('createTierCortex with item ids named like Object.prototype members', () => {
  // Phase 5a fixed this on purpose (A27): the frozen copy resolves these ids to Object.prototype
  // members, so they are compared with an unknown id here instead of with the frozen copy.
  const ODD_IDS = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'];
  const listWith = (id: string) => lz(JSON.stringify({tiers: [{i: 'a', n: 'b', t: [{i: id, c: 'Mystery'}, {i: 'image-overwatch-mau.webp'}]}]}));

  it('returns a placeholder with the stored label and the id legacy-<id> when a link names such an id', () => {
    const cortex = createTierCortex();
    const unknown = cortex.decodeTierStateFromURL(listWith('unknown-item-x'))!.tiers[0].items;
    for (const id of ODD_IDS) {
      const items = cortex.decodeTierStateFromURL(listWith(id))!.tiers[0].items;
      // Shown under the id its v3 link writes (A42): these names break the device id rule.
      expect(items, id).toEqual([{...unknown[0], id: `legacy-${id}`}, unknown[1]]);
      expect(cortex.isCustomItem(id), id).toBe(true);
    }
  });

  it('returns {d: legacy-<id>, c: label} when encodeListForURL saves the decoded list', () => {
    const cortex = createTierCortex();
    for (const id of ODD_IDS) {
      const tiers = cortex.decodeTierStateFromURL(listWith(id))!.tiers;
      const saved = cortex.encodeListForURL('', tiers);
      expect(LZString.decompressFromEncodedURIComponent(saved.slice(2)), id)
        .toBe(`{"r":[["a","b",[{"d":"legacy-${id}","c":"Mystery"},"image-overwatch-mau.webp"]]]}`);
      expect(cortex.decodeTierStateFromURL(saved)!.tiers[0].items[0], id).toMatchObject({id: `legacy-${id}`, content: 'Mystery'});
    }
  });
});

describe('createTierCortex with repeated tier ids (A38)', () => {
  it('returns the first id unchanged and a new free id for each repeat or empty id when uniqueTierIds runs', () => {
    expect(uniqueTierIds(['tier-s', 'tier-a', 'tier-s', 'tier-s', 'uncategorized'])).toEqual(['tier-s', 'tier-a', 'tier-s~2', 'tier-s~3', 'uncategorized']);
    // A new id never takes an id that another row already has.
    expect(uniqueTierIds(['x', 'x', 'x~2', 'x'])).toEqual(['x', 'x~3', 'x~2', 'x~4']);
    // An empty id gets a new id too: v3 links refuse empty ids (A40).
    expect(uniqueTierIds(['', ''])).toEqual(['tier~1', 'tier~2']);
    expect(uniqueTierIds(['tier~1', '', 'x'])).toEqual(['tier~1', 'tier~2', 'x']);
    expect(uniqueTierIds(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('returns rows with their own ids (tier-s, tier-s~2) when a legacy link repeats a tier id', () => {
    for (const legacy of [
      lz(JSON.stringify([{i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-mau.webp', c: 'Mauga'}]}, {i: 'tier-s', n: 'A', t: [{i: 'image-overwatch-win.webp', c: 'Winston'}]}, {i: 'uncategorized', n: '', t: []}])),
      lz(JSON.stringify({tiers: [{i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-mau.webp'}]}, {i: 'tier-s', n: 'A', t: [{i: 'image-overwatch-win.webp'}]}, {i: 'uncategorized', n: '', t: []}]})),
    ]) {
      const tiers = createTierCortex().decodeTierStateFromURL(legacy)!.tiers;
      expect(tiers.map(tier => [tier.id, tier.name, tier.items.map(item => item.content)])).toEqual([
        ['tier-s', 'S', ['Mauga']],
        ['tier-s~2', 'A', ['Winston']],
        ['uncategorized', '', []],
      ]);
    }
  });
});

describe('createTierCortex with unknown items (A37)', () => {
  const unknownLink = lz(JSON.stringify({tiers: [{i: 'tier-s', n: 'S', t: [{i: 'unknown-item-x', c: 'Mystery'}]}]}));

  it('returns imageUrl /placeholder-image.png on the server and in the browser when the item id is unknown', () => {
    const onServer = createTierCortex().decodeTierStateFromURL(unknownLink)!.tiers[0].items[0];
    vi.stubGlobal('window', {location: {origin: 'https://opentierboy.com'}});
    vi.stubGlobal('localStorage', {getItem: () => null, setItem: () => undefined});
    const inBrowser = createTierCortex().decodeTierStateFromURL(unknownLink)!.tiers[0].items[0];
    expect(onServer).toEqual({id: 'unknown-item-x', content: 'Mystery', imageUrl: '/placeholder-image.png'});
    expect(inBrowser).toEqual(onServer);
  });

  it('returns an absolute placeholder-image.preview.png URL when getOgSafeItem gets an unknown item', () => {
    const cortex = createTierCortex();
    const item = cortex.decodeTierStateFromURL(unknownLink)!.tiers[0].items[0];
    expect(cortex.getOgSafeItem(item).imageUrl).toBe('http://localhost:3000/placeholder-image.preview.png');
  });
});

describe('createTierCortex with aliases (image-aliases.json)', () => {
  const MAUGA = {id: 'image-overwatch-mau.webp', content: 'Mauga', imageUrl: '/images/image-overwatch/mau.webp'};
  const link = (...itemIds: string[]) =>
    lz(JSON.stringify({tiers: [{i: 'tier-s', n: 'S', t: itemIds.map(id => ({i: id, c: `stored ${id}`}))}]}));
  const itemsOf = (cortex: TierCortex, state: string) => cortex.decodeTierStateFromURL(state)!.tiers[0].items;
  const placeholder = (id: string) => ({id, content: `stored ${id}`, imageUrl: '/placeholder-image.png'});

  it('returns an empty object when image-aliases.json is imported', async () => {
    expect((await import('@/image-aliases.json')).default).toEqual({});
  });

  it('returns the renamed image when a link or resolveItemsFromPackage names the old id', () => {
    const cortex = createTierCortex({aliases: {'image-overwatch-old-mauga.webp': 'image-overwatch-mau.webp'}});
    expect(itemsOf(cortex, link('image-overwatch-old-mauga.webp'))).toEqual([MAUGA]);
    expect(cortex.resolveItemsFromPackage('image-overwatch', ['old-mauga.webp'])).toEqual([MAUGA]);
  });

  it('returns the final image when aliases chain two renames', () => {
    const cortex = createTierCortex({aliases: {
      'image-overwatch-mauga-v1.webp': 'image-overwatch-mauga-v2.webp',
      'image-overwatch-mauga-v2.webp': 'image-overwatch-mau.webp',
    }});
    expect(itemsOf(cortex, link('image-overwatch-mauga-v1.webp'))).toEqual([MAUGA]);
    expect(itemsOf(cortex, link('image-overwatch-mauga-v2.webp'))).toEqual([MAUGA]);
  });

  it('returns each item only at its first place when two ids resolve to one item after aliases (A32)', () => {
    const cortex = createTierCortex({aliases: {
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

  it('returns a placeholder when an alias loops, leads to a missing id or leads to toString', () => {
    const cortex = createTierCortex({aliases: {
      'image-a-loop1.webp': 'image-a-loop2.webp',
      'image-a-loop2.webp': 'image-a-loop1.webp',
      'image-a-gone.webp': 'image-a-also-gone.webp',
      'image-a-proto.webp': 'toString',
    }});
    const ids = ['image-a-loop1.webp', 'image-a-gone.webp', 'image-a-proto.webp'];
    expect(itemsOf(cortex, link(...ids))).toEqual(ids.map(placeholder));
  });

  it('returns the shipped image when an alias names a shipped id', () => {
    const cortex = createTierCortex({aliases: {'image-overwatch-mau.webp': 'image-overwatch-win.webp'}});
    expect(itemsOf(cortex, link('image-overwatch-mau.webp'))).toEqual([MAUGA]);
  });

  it('returns a link with the new id when a list opened from an old id is encoded', () => {
    const cortex = createTierCortex({aliases: {'image-overwatch-old-mauga.webp': 'image-overwatch-mau.webp'}});
    const tiers = cortex.decodeTierStateFromURL(link('image-overwatch-old-mauga.webp'))!.tiers;
    // What TierListManager.handleTiersUpdate hands to the encoder.
    const forEncoding = tiers.map(tier => ({
      ...tier,
      items: tier.items.map(item => ({i: item.id, c: cortex.isCustomItem(item.id) ? item.content : undefined})),
    }));
    const saved = encodeTierStateForURL(undefined, forEncoding);
    expect(LZString.decompressFromEncodedURIComponent(saved))
      .toBe('{"tiers":[{"i":"tier-s","n":"S","t":[{"i":"image-overwatch-mau.webp"}]}]}');
  });
});

/**
 * v3 links (Phase 5b): TierCortex resolves items by kind, reads the layout settings, and writes
 * every list as a v3 link (encodeListForURL).
 */
describe('createTierCortex with v3 links', () => {
  const v3 = (json: string) => `3.${lz(json)}`;
  const v3Json = (link: string) => LZString.decompressFromEncodedURIComponent(link.slice(2));
  // The placeholder tile has a relative URL since Phase 5a (A37); previews use its PNG copy.
  const PLACEHOLDER = '/placeholder-image.png';
  const LAYOUT = {labelPosition: 'left', showLabels: true};
  const v3Fixtures = allFixtures.filter(entry => entry.format === 'v3') as unknown as {id: string; state: string}[];

  const browserWithUploads = (uploads: {i: string; c: string; d: string}[]) => {
    vi.stubGlobal('window', {location: {origin: 'https://opentierboy.com'}});
    vi.stubGlobal('localStorage', {getItem: (key: string) => (key === 'customItems' ? JSON.stringify(uploads) : null), setItem: () => undefined});
  };

  it('returns a list and logs no error when decoding each v3 fixture', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const state of v3FixtureStates) expect(createTierCortex().decodeTierStateFromURL(state), state.slice(0, 40)).not.toBeNull();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('returns image-set labels and the layout when a v3 link sets t, tp, lp and sl', () => {
    const decoded = createTierCortex().decodeTierStateFromURL(v3('{"t":"T","tp":3,"lp":"top","sl":false,"r":[["S",["image-overwatch-mau.webp"]],["A",[]],["B",[]],["",[]]]}'));
    expect(decoded).toEqual({
      title: 'T',
      tiers: [
        {id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-mau.webp', content: 'Mauga', imageUrl: '/images/image-overwatch/mau.webp'}]},
        {id: 'tier-a', name: 'A', items: []},
        {id: 'tier-b', name: 'B', items: []},
        {id: 'uncategorized', name: '', items: []},
      ],
      layout: {labelPosition: 'top', showLabels: false},
    });
  });

  it('returns no layout when decoding a legacy link', () => {
    for (const link of sharedLinks) expect(createTierCortex().decodeTierStateFromURL(link.state)).not.toHaveProperty('layout');
  });

  it('returns a placeholder, then the plain id on save, when a v3 link names an unknown image-set id', () => {
    const cortex = createTierCortex({aliases: {'image-overwatch-old.webp': 'image-overwatch-mau.webp'}});
    const items = cortex.decodeTierStateFromURL(v3('{"r":[["x","",["image-overwatch-gone.webp","image-overwatch-old.webp","abcdefgh"]]]}'))!.tiers[0].items;
    expect(items).toEqual([
      {id: 'image-overwatch-gone.webp', content: '', imageUrl: PLACEHOLDER, source: 'package'},
      {id: 'image-overwatch-mau.webp', content: 'Mauga', imageUrl: '/images/image-overwatch/mau.webp'},
      {id: 'abcdefgh', content: '', imageUrl: PLACEHOLDER, source: 'package'},
    ]);
    const saved = cortex.encodeListForURL('', [{id: 'x', name: '', items}], LAYOUT as never);
    expect(v3Json(saved)).toBe('{"r":[["x","",["image-overwatch-gone.webp","image-overwatch-mau.webp","abcdefgh"]]]}');
  });

  it('returns a label tile with no preview image URL when a v3 link has a link image (A8, A36)', () => {
    const addresses = ['http://localhost:3000/secret.png', 'http://127.0.0.1:3001/secret.webp', 'https://example.com/a.png'];
    const state = v3(JSON.stringify({r: [['uncategorized', '', addresses.map(u => ({u, c: 'label'}))]]}));
    for (const inBrowser of [false, true]) {
      if (inBrowser) browserWithUploads([]);
      const cortex = createTierCortex();
      const items = cortex.decodeTierStateFromURL(state)!.tiers[0].items;
      expect(items).toEqual(addresses.map(url => ({id: url, content: 'label', source: 'link', url})));
      expect(items.map(item => cortex.getOgSafeItem(item).imageUrl)).toEqual(addresses.map(() => undefined));
    }
  });

  it('returns a placeholder with the link label, no preview URL, when a v3 link has a device image (Phase 5c)', () => {
    // The editor puts the image from the device image store on the tile (CustomImagesContext).
    browserWithUploads([{i: 'k3j9x0a1b', c: 'stored label', d: 'data:image/png;base64,AAAA'}]);
    const cortex = createTierCortex();
    const items = cortex.decodeTierStateFromURL(v3('{"r":[["x","",[{"d":"k3j9x0a1b","c":"my cat"},{"d":"legacy-ab3c9"},{"d":"gone-image"}]]]}'))!.tiers[0].items;
    expect(items).toEqual([
      {id: 'k3j9x0a1b', content: 'my cat', imageUrl: PLACEHOLDER, source: 'device'},
      {id: 'legacy-ab3c9', content: '', imageUrl: PLACEHOLDER, source: 'device'},
      {id: 'gone-image', content: '', imageUrl: PLACEHOLDER, source: 'device'},
    ]);
    // Link previews draw device images as label tiles.
    expect(items.map(item => cortex.getOgSafeItem(item).imageUrl)).toEqual([undefined, undefined, undefined]);
  });

  it('returns a v3 link with the layout and tp from the row count when encodeListForURL saves a list', () => {
    const cortex = createTierCortex();
    const tiers = cortex.decodeTierStateFromURL(sharedLinks.find(link => link.id === 'link-002')!.state)!.tiers;
    const link = cortex.encodeListForURL('My list', tiers, {labelPosition: 'right', showLabels: false});
    expect(link.startsWith('3.')).toBe(true);
    expect(decodeState(link)).toMatchObject({version: 3, title: 'My list', rowTemplate: '5rows', labelPosition: 'right', showLabels: false});
    expect(v3Json(cortex.encodeListForURL('', tiers))).toMatch(/^\{"tp":5,"r":/);
    expect(rowTemplateOf(tiers)).toBe('5rows');
    expect(rowTemplateOf(tiers.slice(1))).toBe('custom');
    expect(rowTemplateOf([...tiers, ...tiers.slice(0, 2)])).toBe('7rows');
  });

  it('returns uploads as {d, c} items, short ids as legacy-<id>, when encodeListForURL saves a v2 list (A42)', () => {
    browserWithUploads([{i: 'ab3c9', c: 'My cat', d: 'data:image/png;base64,BBBB'}]);
    const cortex = createTierCortex();
    // A v2 link with a 5-character upload id, an upload with a 9-character id, and an unknown
    // id with a dot (a removed image-set item, from a legacy link).
    const legacy = lz(JSON.stringify({tiers: [{i: 'tier-s', n: 'S', t: [
      {i: 'ab3c9', c: 'My cat'}, {i: 'k3j9x0a1b', c: 'Nine'}, {i: 'image-overwatch-gone.webp', c: 'Gone'}, {i: 'image-overwatch-mau.webp'},
    ]}, {i: 'uncategorized', n: '', t: []}]}));
    const opened = cortex.decodeTierStateFromURL(legacy)!;
    const saved = cortex.encodeListForURL('', opened.tiers);
    expect(v3Json(saved)).toBe('{"r":[["tier-s","S",[{"d":"legacy-ab3c9","c":"My cat"},{"d":"k3j9x0a1b","c":"Nine"},' +
      '{"i":"image-overwatch-gone.webp","c":"Gone"},"image-overwatch-mau.webp"]],["uncategorized","",[]]]}');
    // Reopened, the upload shows with its label (its image comes from the device image store).
    const reopened = cortex.decodeTierStateFromURL(saved)!.tiers[0].items[0];
    expect(reopened).toEqual({id: 'legacy-ab3c9', content: 'My cat', imageUrl: PLACEHOLDER, source: 'device'});
    // Saving the reopened list writes the same link.
    expect(cortex.encodeListForURL('', cortex.decodeTierStateFromURL(saved)!.tiers)).toBe(saved);
  });

  it('returns the fixture link unchanged when saving an opened v3 fixture without duplicates or extra rows', () => {
    // v3-rows-beyond-template: the app takes the row template from the row count (6 rows: custom).
    // v3-duplicates-kept, v3-limit-rows and v3-limit-items: the app shows a repeated item once (A32).
    const skipped = ['v3-rows-beyond-template', 'v3-duplicates-kept', 'v3-limit-rows', 'v3-limit-items'];
    const cortex = createTierCortex();
    for (const {id, state} of v3Fixtures.filter(entry => !skipped.includes(entry.id))) {
      const opened = cortex.decodeTierStateFromURL(state)!;
      expect(cortex.encodeListForURL(opened.title ?? '', opened.tiers, opened.layout), id).toBe(state);
    }
  });

  it('returns {i, c} with the label when encodeListForURL saves an id that names no image-set item (A45)', () => {
    const cortex = createTierCortex({aliases: {'image-overwatch-old.webp': 'image-overwatch-mau.webp'}});
    const legacy = lz(JSON.stringify({title: 'T', tiers: [{i: 'tier-s', n: 'S', t: [
      {i: 'image-overwatch-gone.webp', c: 'Gone hero'}, {i: 'image-overwatch-old.webp', c: 'Old Mauga'}, {i: 'image-overwatch-win.webp', c: 'Winston'},
    ]}, {i: 'uncategorized', n: '', t: []}]}));
    const opened = cortex.decodeTierStateFromURL(legacy)!;
    const saved = cortex.encodeListForURL('T', opened.tiers);
    // Image-set items (also by an alias) stay plain ids; the unknown id keeps its label.
    expect(v3Json(saved)).toBe('{"t":"T","r":[["tier-s","S",[{"i":"image-overwatch-gone.webp","c":"Gone hero"},' +
      '"image-overwatch-mau.webp","image-overwatch-win.webp"]],["uncategorized","",[]]]}');
    const reopened = cortex.decodeTierStateFromURL(saved)!.tiers[0].items;
    expect(reopened[0]).toEqual({id: 'image-overwatch-gone.webp', content: 'Gone hero', imageUrl: PLACEHOLDER, source: 'package'});
    expect(cortex.encodeListForURL('T', cortex.decodeTierStateFromURL(saved)!.tiers)).toBe(saved);
    // Once an image set ships the id again, the link shows that image and its label.
    const later = createTierCortex({aliases: {'image-overwatch-gone.webp': 'image-overwatch-ana.webp'}});
    expect(later.decodeTierStateFromURL(saved)!.tiers[0].items[0]).toMatchObject({id: 'image-overwatch-ana.webp', content: 'Ana'});
  });

  it('returns item~N ids and a link that reopens with the labels when a legacy list has empty item ids', () => {
    const legacy = lz(JSON.stringify({tiers: [{i: 'tier-s', n: 'S', t: [{i: '', c: 'No id'}, {i: 'item~1', c: 'Taken'}, {i: '', c: 'Also no id'}]}, {i: 'uncategorized', n: '', t: []}]}));
    const cortex = createTierCortex();
    const opened = cortex.decodeTierStateFromURL(legacy)!;
    // New ids skip the ones the list already uses; the same list always gets the same ids.
    expect(opened.tiers[0].items.map(item => [item.id, item.content])).toEqual([['item~2', 'No id'], ['item~1', 'Taken'], ['item~3', 'Also no id']]);
    const saved = cortex.encodeListForURL('', opened.tiers);
    const reopened = cortex.decodeTierStateFromURL(saved);
    expect(reopened?.tiers[0].items.map(item => item.content)).toEqual(['No id', 'Taken', 'Also no id']);
    expect(cortex.encodeListForURL('', reopened!.tiers)).toBe(saved);
  });

  it('returns tier~N ids and a link that reopens with the rows when a legacy list has an empty tier id', () => {
    const legacy = lz(JSON.stringify({tiers: [{i: '', n: 'S', t: [{i: 'image-overwatch-mau.webp'}]}, {i: '', n: 'A', t: []}, {i: 'uncategorized', n: '', t: []}]}));
    const cortex = createTierCortex();
    const opened = cortex.decodeTierStateFromURL(legacy)!;
    expect(opened.tiers.map(tier => tier.id)).toEqual(['tier~1', 'tier~2', 'uncategorized']);
    const reopened = cortex.decodeTierStateFromURL(cortex.encodeListForURL('', opened.tiers));
    expect(reopened?.tiers.map(tier => [tier.name, tier.items.map(item => item.content)])).toEqual([['S', ['Mauga']], ['A', []], ['', []]]);
  });

  it('returns the same link from a second save when a golden link is opened, saved and reopened', () => {
    const cortex = createTierCortex();
    for (const state of [...sharedLinks.map(link => link.state), ...fixtureStates, ...v3FixtureStates]) {
      const opened = cortex.decodeTierStateFromURL(state)!;
      const once = cortex.encodeListForURL(opened.title ?? '', opened.tiers, opened.layout);
      const reopened = cortex.decodeTierStateFromURL(once)!;
      expect(cortex.encodeListForURL(reopened.title ?? '', reopened.tiers, reopened.layout), state.slice(0, 40)).toBe(once);
    }
  });

  it('returns null and logs Invalid v3 state: <reason> when a v3 link is invalid', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const cases: [string, string][] = [
        [v3('{"r":[["S",[]]]}'), 'missing-tier-id'],
        ['3.', 'not-lz-string-or-too-long'],
        [`3.${sharedLinks[1].state}`, 'bad-rows'],
      ];
      for (const [state, reason] of cases) {
        // The pre-refactor copy also returned null for these: only the logged reason is new.
        expect(new PreRefactorTierCortex().decodeTierStateFromURL(state)).toBeNull();
        errorSpy.mockClear();
        expect(createTierCortex().decodeTierStateFromURL(state)).toBeNull();
        expect(errorSpy).toHaveBeenCalledWith('Failed to decode tier state from URL:', new Error(`Invalid v3 state: ${reason}`));
      }
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('createTierCortex with oversized legacy links (A29)', () => {
  // Links are compressed, so a short link can hold a huge list: the review found a 5,760-character
  // link that holds a 5-million-character tier name (it blocked /api/og and every other request
  // to `next start` for over a minute), and a 12 KB link that expands to 10 MB of JSON. Never
  // send such a link to a server in a test. This case is just over the 1,000,000-character JSON
  // cap (lib/legacyLinkLimits.ts); a longer text in a list under the cap decodes (A43).
  const hugeName = 'x'.repeat(1_000_001);
  const state = lz(JSON.stringify({tiers: [{i: 'tier-s', n: hugeName, t: []}, {i: 'uncategorized', n: '', t: []}]}));

  it('returns a link under 4,000 characters when lz-string compresses a 1,000,001-character tier name', () => {
    expect(state.length).toBeLessThan(4_000);
  });

  it('returns null and logs an error when the decoded JSON passes the 1,000,000-character cap', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(createTierCortex().decodeTierStateFromURL(state)).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(LOG_PREFIX, expect.any(Error));
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('createTierCortex', () => {
  it('returns the same lookup and the same item objects when called twice with one image-set config', () => {
    expect(packageItemLookup(APP_CONFIG)).toBe(packageItemLookup(APP_CONFIG));
    expect(packageItemLookup(TINY_CONFIG)).toBe(packageItemLookup(TINY_CONFIG));
    // Another config object, even with the same content, gets its own lookup.
    const copy = structuredClone(TINY_CONFIG);
    expect(packageItemLookup(copy)).not.toBe(packageItemLookup(TINY_CONFIG));
    expect(packageItemLookup(copy).get('image-tiny-one.webp')).toEqual(packageItemLookup(TINY_CONFIG).get('image-tiny-one.webp'));

    const [first] = createTierCortex().resolveItemsFromPackage('image-overwatch', ['mau.webp']);
    const [second] = createTierCortex().resolveItemsFromPackage('image-overwatch', ['mau.webp']);
    expect(first).toEqual({id: 'image-overwatch-mau.webp', content: 'Mauga', imageUrl: '/images/image-overwatch/mau.webp'});
    expect(second).toBe(first);
  });

  it('returns a frozen lookup with only get and has when packageItemLookup builds one', () => {
    const lookup = packageItemLookup(TINY_CONFIG);
    expect(Object.keys(lookup).sort()).toEqual(['get', 'has']);
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(lookup.has('image-tiny-one.webp')).toBe(true);
    expect(lookup.get('image-tiny-one.webp')).toEqual({id: 'image-tiny-one.webp', content: 'One', imageUrl: '/images/image-tiny/one.webp'});
    // Ids named like built-in object members find nothing, like any unknown id.
    for (const id of ['constructor', '__proto__', 'toString', 'set', 'clear']) {
      expect(lookup.has(id), id).toBe(false);
      expect(lookup.get(id), id).toBeUndefined();
    }
  });

  it('returns frozen items and a frozen TierCortex when createTierCortex runs', () => {
    const cortex = createTierCortex();
    const [item] = cortex.resolveItemsFromPackage('image-overwatch', ['mau.webp']);
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(cortex)).toBe(true);
    expect(() => {
      (item as {content: string}).content = 'changed';
    }).toThrow(TypeError);
    expect(createTierCortex().resolveItemsFromPackage('image-overwatch', ['mau.webp'])[0].content).toBe('Mauga');
  });

  it('returns results of its own aliases and imageSetConfig when another TierCortex has other options', () => {
    const aliased = createTierCortex({aliases: {'image-overwatch-old-mauga.webp': 'image-overwatch-mau.webp'}});
    const plain = createTierCortex();
    expect(aliased.resolveItemsFromPackage('image-overwatch', ['old-mauga.webp'])[0].content).toBe('Mauga');
    expect(plain.resolveItemsFromPackage('image-overwatch', ['old-mauga.webp'])[0]).toEqual(
      {id: 'image-overwatch-old-mauga.webp', content: 'old-mauga', imageUrl: '/placeholder-image.png'});

    const tiny = createTierCortex({imageSetConfig: TINY_CONFIG});
    expect(tiny.isCustomItem('image-tiny-one.webp')).toBe(false);
    expect(tiny.isCustomItem('image-overwatch-mau.webp')).toBe(true);
    expect(plain.isCustomItem('image-tiny-one.webp')).toBe(true);
  });

  it('returns the plain resolveItemsFromPackage and isCustomItem results when they get the same config', () => {
    const aliases = {'image-tiny-old.webp': 'image-tiny-one.webp'};
    const catalog = {items: packageItemLookup(TINY_CONFIG), aliases};
    const cortex = createTierCortex({imageSetConfig: TINY_CONFIG, aliases});
    const files = ['one.webp', 'old.webp', 'gone.webp'];
    expect(cortex.resolveItemsFromPackage('image-tiny', files)).toStrictEqual(resolveItemsFromPackage(catalog, 'image-tiny', files));
    expect(cortex.isCustomItem('image-tiny-old.webp')).toBe(isCustomItem(catalog, 'image-tiny-old.webp'));
  });
});

describe('createTierCortex in each environment', () => {
  const logo = 'brand/otb-logo-wide.png';

  it('returns http://localhost:3000 URLs when VERCEL_PROJECT_PRODUCTION_URL is empty on the server', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    expect(createTierCortex().getAssetUrl(logo)).toBe('http://localhost:3000/brand/otb-logo-wide.png');
  });

  it('returns https://opentierboy.com URLs when VERCEL_PROJECT_PRODUCTION_URL is opentierboy.com', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'opentierboy.com');
    const cortex = createTierCortex();
    expect(cortex.getAssetUrl(logo)).toBe('https://opentierboy.com/brand/otb-logo-wide.png');
    expect(cortex.getOgSafeImageUrl('/images/image-overwatch/mau.webp')).toBe('https://opentierboy.com/images/image-overwatch/mau.png');
  });

  it('returns URLs on window.location.origin when window exists', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'opentierboy.com');
    vi.stubGlobal('window', {location: {origin: 'https://preview.example'}});
    expect(createTierCortex().getAssetUrl(logo)).toBe('https://preview.example/brand/otb-logo-wide.png');
  });

  it('returns the base URL read at creation when the env changes later, and options.baseUrl when set', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'opentierboy.com');
    const cortex = createTierCortex();
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'elsewhere.example');
    expect(cortex.getAssetUrl(logo)).toBe('https://opentierboy.com/brand/otb-logo-wide.png');
    expect(createTierCortex({baseUrl: 'https://given.example'}).getOgSafeItem({id: 'x', content: 'X', imageUrl: '/placeholder-image.png'}))
      .toEqual({id: 'x', content: 'X', imageUrl: 'https://given.example/placeholder-image.preview.png'});
  });

  it('throws no error when the modules load and window throws on access (the edge OG route imports them)', async () => {
    vi.resetModules();
    vi.stubGlobal('window', new Proxy({}, {get: () => {
      throw new Error('window was read');
    }}));
    const fresh = await import('@/lib/TierCortex');
    await import('@/lib/listLink');
    await import('@/lib/linkPreview');
    await import('@/lib/packageItems');
    // With a base URL in the options, making a TierCortex reads no global either.
    expect(fresh.createTierCortex({baseUrl: 'https://given.example'}).getAssetUrl(logo)).toBe('https://given.example/brand/otb-logo-wide.png');
    expect(() => fresh.createTierCortex()).toThrow('window was read');
  });
});
