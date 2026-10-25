import LZString from 'lz-string';
import {describe, expect, it, vi} from 'vitest';
import imagesetConfig from '@/imageset.config.json';
import {
  type CanonicalState,
  decodeState,
  decodeV3Payload,
  type EncodableState,
  encodeV3,
  readV3Payload,
  ROW_TEMPLATE_TIER_IDS,
  V3_LIMITS,
} from '@/lib/state';
import sharedLinks from '../../fixtures/shared-links.json';
import {lzBomb, lzWithRun} from '../support/lzStream';
import {randomAppStates, randomV3States, seededRandom, toCanonical} from '../support/randomStates';

const lz = (json: string) => LZString.compressToEncodedURIComponent(json);
const v3 = (json: string) => `3.${lz(json)}`;
const jsonOf = (value: string) => {
  expect(value.startsWith('3.')).toBe(true);
  return LZString.decompressFromEncodedURIComponent(value.slice(2));
};
const reasonOf = (json: string) => {
  const result = readV3Payload(lz(json));
  return result.ok ? 'ok' : result.reason;
};

/**
 * toEqual on thousands of large lists is slow, so compare the JSON first and fall back to
 * toEqual (with its readable diff) only when the JSON differs, for example in key order.
 */
function expectSameState(actual: CanonicalState | null, expected: CanonicalState, message: string): void {
  if (actual !== null && JSON.stringify(actual) === JSON.stringify(expected)) return;
  expect(actual, message).toEqual(expected);
}

/** The example in docs/link-format-v3.md. */
const EXAMPLE_JSON =
  '{"t":"My picks 🎮","tp":5,"lp":"top","r":[' +
  '["S",["image-overwatch-ana.webp",{"u":"https://i.imgur.com/abc123.png","c":"Wrecking Ball"}]],' +
  '["tier-b","A",[{"d":"k3j9x0a1b","c":"my cat"}]],' +
  '["tier-a","B",[]],' +
  '["C",[]],["F",[]],' +
  '["",["image-overwatch-mau.webp"]]]}';

const EXAMPLE_STATE: CanonicalState = {
  version: 3,
  title: 'My picks 🎮',
  rowTemplate: '5rows',
  labelPosition: 'top',
  showLabels: true,
  tiers: [
    {
      id: 'tier-s',
      name: 'S',
      items: [
        {id: 'image-overwatch-ana.webp'},
        {kind: 'link', id: 'https://i.imgur.com/abc123.png', url: 'https://i.imgur.com/abc123.png', content: 'Wrecking Ball'},
      ],
    },
    {id: 'tier-b', name: 'A', items: [{kind: 'device', id: 'k3j9x0a1b', content: 'my cat'}]},
    {id: 'tier-a', name: 'B', items: []},
    {id: 'tier-c', name: 'C', items: []},
    {id: 'tier-f', name: 'F', items: []},
    {id: 'uncategorized', name: '', items: [{id: 'image-overwatch-mau.webp'}]},
  ],
};

/** One row of the given template's ids, for building small lists. */
function list(overrides: Partial<EncodableState> = {}): EncodableState {
  return {tiers: [{id: 'uncategorized', name: '', items: []}], ...overrides};
}

describe('v3 link format', () => {
  it('decodes the documented example, and writes it back byte for byte', () => {
    expect(decodeState(v3(EXAMPLE_JSON))).toEqual(EXAMPLE_STATE);
    expect(encodeV3(EXAMPLE_STATE)).toBe(v3(EXAMPLE_JSON));
  });

  it('writes the keys in the order t, tp, lp, sl, r', () => {
    const encoded = encodeV3({...EXAMPLE_STATE, labelPosition: 'right', showLabels: false});
    expect(jsonOf(encoded)).toMatch(/^\{"t":"My picks 🎮","tp":5,"lp":"right","sl":false,"r":\[/);
  });

  it('leaves out every field that holds its default', () => {
    const minimal = {tiers: [{id: 'uncategorized', name: '', items: []}]};
    expect(jsonOf(encodeV3(minimal))).toBe('{"r":[["uncategorized","",[]]]}');
    expect(jsonOf(encodeV3({...minimal, title: '', rowTemplate: 'custom', labelPosition: 'left', showLabels: true})))
      .toBe('{"r":[["uncategorized","",[]]]}');
    expect(decodeState(encodeV3(minimal))).toEqual({
      version: 3,
      rowTemplate: 'custom',
      labelPosition: 'left',
      showLabels: true,
      tiers: [{id: 'uncategorized', name: '', items: []}],
    });
  });

  it('keeps a title made of spaces and drops an empty one', () => {
    expect(jsonOf(encodeV3(list({title: '  '})))).toBe('{"t":"  ","r":[["uncategorized","",[]]]}');
    expect(decodeState(encodeV3(list({title: '  '})))?.title).toBe('  ');
    expect(decodeState(v3('{"t":"","r":[["x","",[]]]}'))).not.toHaveProperty('title');
  });

  it('stores the label position and label visibility', () => {
    for (const labelPosition of ['left', 'right', 'top'] as const) {
      for (const showLabels of [true, false]) {
        const decoded = decodeState(encodeV3(list({labelPosition, showLabels})));
        expect(decoded?.labelPosition).toBe(labelPosition);
        expect(decoded?.showLabels).toBe(showLabels);
      }
    }
    expect(jsonOf(encodeV3(list({showLabels: false})))).toBe('{"sl":false,"r":[["uncategorized","",[]]]}');
    expect(jsonOf(encodeV3(list({labelPosition: 'top'})))).toBe('{"lp":"top","r":[["uncategorized","",[]]]}');
  });

  describe('items', () => {
    it('writes image-set items as their id, and link and device images as objects', () => {
      const encoded = encodeV3(list({
        tiers: [{
          id: 'uncategorized',
          name: '',
          items: [
            {id: 'image-overwatch-ana.webp'},
            {kind: 'link', id: 'ignored', url: 'https://thefinals.wiki/a.png', content: 'Light'},
            {kind: 'link', id: 'https://thefinals.wiki/b.png', url: 'https://thefinals.wiki/b.png', content: ''},
            {kind: 'device', id: 'k3j9x0a1b', content: 'my cat'},
            {kind: 'device', id: 'q8w7e6r5t', content: ''},
          ],
        }],
      }));
      expect(jsonOf(encoded)).toBe(
        '{"r":[["uncategorized","",["image-overwatch-ana.webp",{"u":"https://thefinals.wiki/a.png","c":"Light"},' +
        '{"u":"https://thefinals.wiki/b.png"},{"d":"k3j9x0a1b","c":"my cat"},{"d":"q8w7e6r5t"}]]]}');
      expect(decodeState(encoded)?.tiers[0].items).toEqual([
        {id: 'image-overwatch-ana.webp'},
        {kind: 'link', id: 'https://thefinals.wiki/a.png', url: 'https://thefinals.wiki/a.png', content: 'Light'},
        {kind: 'link', id: 'https://thefinals.wiki/b.png', url: 'https://thefinals.wiki/b.png', content: ''},
        {kind: 'device', id: 'k3j9x0a1b', content: 'my cat'},
        {kind: 'device', id: 'q8w7e6r5t', content: ''},
      ]);
    });

    it('drops the stored label of an image-set item, because the image set holds it', () => {
      const decoded = decodeState(encodeV3(list({
        tiers: [{id: 'uncategorized', name: '', items: [{id: 'image-overwatch-ana.webp', content: 'Ana'}]}],
      })));
      expect(decoded?.tiers[0].items).toStrictEqual([{id: 'image-overwatch-ana.webp'}]);
    });

    it('keeps duplicate items: removing them is the app\'s job', () => {
      const json = '{"r":[["x","",["a","a",{"u":"https://x.test/1.png"},{"u":"https://x.test/1.png","c":"other"}]]]}';
      expect(decodeState(v3(json))?.tiers[0].items).toHaveLength(4);
    });
  });

  describe('tier ids (A2)', () => {
    const fiveRows = (ids: string[]): EncodableState => ({
      rowTemplate: '5rows',
      tiers: ids.map((id, index) => ({id, name: ['S', 'A', 'B', 'C', 'F', ''][index] ?? 'Extra', items: []})),
    });

    it('leaves out ids that sit at their template position', () => {
      const encoded = encodeV3(fiveRows(['tier-s', 'tier-a', 'tier-b', 'tier-c', 'tier-f', 'uncategorized']));
      expect(jsonOf(encoded)).toBe('{"tp":5,"r":[["S",[]],["A",[]],["B",[]],["C",[]],["F",[]],["",[]]]}');
    });

    it('writes the ids of rows that moved, and only those', () => {
      // Rows S and B swapped places: the labels stay, the ids move with the items.
      const encoded = encodeV3(fiveRows(['tier-b', 'tier-a', 'tier-s', 'tier-c', 'tier-f', 'uncategorized']));
      expect(jsonOf(encoded)).toBe('{"tp":5,"r":[["tier-b","S",[]],["A",[]],["tier-s","B",[]],["C",[]],["F",[]],["",[]]]}');
      expect(decodeState(encoded)?.tiers.map(tier => tier.id))
        .toEqual(['tier-b', 'tier-a', 'tier-s', 'tier-c', 'tier-f', 'uncategorized']);
    });

    it('writes the ids of rows below the template\'s last row', () => {
      const encoded = encodeV3(fiveRows(['tier-s', 'tier-a', 'tier-b', 'tier-c', 'tier-f', 'tier-x', 'uncategorized']));
      expect(jsonOf(encoded)).toBe(
        '{"tp":5,"r":[["S",[]],["A",[]],["B",[]],["C",[]],["F",[]],["tier-x","",[]],["uncategorized","Extra",[]]]}');
    });

    it('writes every id under the custom template', () => {
      const encoded = encodeV3({...fiveRows(['tier-s', 'uncategorized']), rowTemplate: 'custom'});
      expect(jsonOf(encoded)).toBe('{"r":[["tier-s","S",[]],["uncategorized","A",[]]]}');
    });

    it('reads the same template id at different positions per template', () => {
      expect(decodeState(v3('{"tp":7,"r":[["SS",[]],["S",[]]]}'))?.tiers.map(tier => tier.id)).toEqual(['tier-ss', 'tier-s']);
      expect(decodeState(v3('{"tp":3,"r":[["S",[]],["A",[]],["B",[]],["",[]]]}'))?.tiers.map(tier => tier.id))
        .toEqual(['tier-s', 'tier-a', 'tier-b', 'uncategorized']);
    });

    it('refuses a row without id where the template has none', () => {
      expect(reasonOf('{"r":[["S",[]]]}')).toBe('missing-tier-id');
      expect(reasonOf('{"tp":3,"r":[["S",[]],["A",[]],["B",[]],["",[]],["more",[]]]}')).toBe('missing-tier-id');
    });

    it('keeps the template switch working after a round trip (A2)', () => {
      // Reorder rows in a 5-row list, then share and reopen it: the ids must survive, because
      // switching to 7 rows matches items to the new rows by tier id.
      const reordered = fiveRows(['tier-c', 'tier-s', 'tier-a', 'tier-b', 'tier-f', 'uncategorized']);
      expect(decodeState(encodeV3(reordered))?.tiers.map(tier => tier.id)).toEqual(reordered.tiers.map(tier => tier.id));
    });
  });

  describe('decodeState', () => {
    it('sends "3." values to the v3 decoder and says why one is invalid', () => {
      const onError = vi.fn();
      expect(decodeState(v3('{"r":[]}'), {onError})).toBeNull();
      expect(onError).toHaveBeenLastCalledWith(new Error('Invalid v3 state: bad-row-count'));
      expect(decodeState('3.', {onError})).toBeNull();
      expect(onError).toHaveBeenLastCalledWith(new Error('Invalid v3 state: not-lz-string-or-too-long'));
    });

    it('does not read a v3 payload without its prefix, or with another version', () => {
      const payload = lz(EXAMPLE_JSON);
      expect(decodeState(payload)).toBeNull();
      for (const prefix of ['03.', '4.', '30.', '3', '3-', ' 3.', 'v3.']) {
        expect(decodeState(prefix + payload), prefix).toBeNull();
      }
    });

    it('does not read a legacy link behind the v3 prefix', () => {
      for (const link of sharedLinks) {
        expect(decodeState(link.state)).not.toBeNull();
        expect(decodeState(`3.${link.state}`)).toBeNull();
      }
    });

    it('accepts spaces for "+" and ignores stray characters after the data (A4)', () => {
      const random = seededRandom(5);
      let withPlus = 0;
      for (const state of randomV3States(300, 11)) {
        const encoded = encodeV3(state);
        if (encoded.includes('+')) withPlus++;
        expectSameState(decodeState(encoded.replace(/\+/g, ' ')), state, encoded);
        const suffix = ['.', ')', '...', '),', '%29', '!', ']'][Math.floor(random() * 7)];
        expectSameState(decodeState(encoded + suffix), state, encoded + suffix);
      }
      expect(withPlus).toBeGreaterThan(50);
    });

    it('ignores keys it does not know, and accepts defaults written out (forward compatible)', () => {
      const json = '{"t":"T","x":1,"tp":5,"lp":"left","sl":true,"future":{"a":[1,2]},' +
        '"r":[["tier-s","S",["image-overwatch-ana.webp",{"u":"https://x.test/a.png","c":"","z":true}]],' +
        '["A",[{"d":"abcdefgh","c":"cat","w":2}]]]}';
      const decoded = decodeState(v3(json));
      expect(decoded).toEqual({
        version: 3,
        title: 'T',
        rowTemplate: '5rows',
        labelPosition: 'left',
        showLabels: true,
        tiers: [
          {id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-ana.webp'}, {kind: 'link', id: 'https://x.test/a.png', url: 'https://x.test/a.png', content: ''}]},
          {id: 'tier-a', name: 'A', items: [{kind: 'device', id: 'abcdefgh', content: 'cat'}]},
        ],
      });
      // Encoding the result writes the short form, which is a fixed point.
      const encoded = encodeV3(decoded!);
      expect(jsonOf(encoded)).toBe('{"t":"T","tp":5,"r":[["S",["image-overwatch-ana.webp",{"u":"https://x.test/a.png"}]],["A",[{"d":"abcdefgh","c":"cat"}]]]}');
      expect(encodeV3(decodeState(encoded)!)).toBe(encoded);
    });
  });

  describe('properties (seeded random lists)', () => {
    it('decodes what it encodes to the same list', () => {
      const states = randomV3States(1000, 20261025);
      for (let index = 0; index < states.length; index++) {
        expectSameState(decodeState(encodeV3(states[index])), states[index], `random state #${index}`);
      }
    });

    it('encodes a decoded value back to the same text (fixed point, A1c)', () => {
      const states = randomV3States(1000, 7);
      for (let index = 0; index < states.length; index++) {
        const encoded = encodeV3(states[index]);
        expect(encodeV3(decodeState(encoded)!), `random state #${index}`).toBe(encoded);
      }
    });

    it('is deterministic: the same list always gives the same text', () => {
      const first = randomV3States(300, 3).map(encodeV3);
      const second = randomV3States(300, 3).map(state => encodeV3(structuredClone(state)));
      expect(second).toEqual(first);
    });

    it('settles any list in one step, also lists in legacy form', () => {
      // Legacy-shaped input: labels on image-set items, empty titles, no layout fields. v3 has
      // no place for a list without rows or with an empty tier id (see the test below).
      const states = randomAppStates(500, 77).map(toCanonical)
        .filter(state => state.tiers.length > 0 && state.tiers.every(tier => tier.id !== ''));
      expect(states.length).toBeGreaterThan(300);
      for (let index = 0; index < states.length; index++) {
        const once = encodeV3(states[index]);
        const decoded = decodeState(once);
        expect(decoded, `random state #${index}`).not.toBeNull();
        expect(encodeV3(decoded!), `random state #${index}`).toBe(once);
        expect(decoded!.tiers.map(tier => tier.id)).toEqual(states[index].tiers.map(tier => tier.id));
      }
    });

    it('cannot hold a legacy list with an empty tier id: the app must give it an id first', () => {
      const legacy = {tiers: [{id: '', name: 'S', items: []}, {id: 'uncategorized', name: '', items: []}]};
      expect(decodeState(encodeV3(legacy))).toBeNull();
    });

    it('never throws on random text after "3."', () => {
      const random = seededRandom(42);
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$ .)%';
      for (let index = 0; index < 3000; index++) {
        let value = '3.';
        const length = Math.floor(random() * 120);
        for (let char = 0; char < length; char++) value += alphabet[Math.floor(random() * alphabet.length)];
        expect(() => decodeState(value)).not.toThrow();
      }
    });

    it('never throws on random JSON values in every field', () => {
      const random = seededRandom(9);
      const values: unknown[] = [null, true, false, 0, -1, 3, 5, 7, 1e308, -0, '', 'x', 'left', [], [[]], {}, {u: 'x'}, {d: 1},
        ['x', []], ['x', 'y', []], [1, 'y', []], {__proto__: null}, 'tier-s', [{u: 'x'}], ['', [{}]]];
      const pickValue = () => values[Math.floor(random() * values.length)];
      for (let index = 0; index < 5000; index++) {
        const json: Record<string, unknown> = {};
        for (const key of ['t', 'tp', 'lp', 'sl', 'r']) if (random() < 0.7) json[key] = pickValue();
        if (random() < 0.5) json.r = Array.from({length: Math.floor(random() * 4)}, () => pickValue());
        const value = v3(JSON.stringify(json));
        let decoded: CanonicalState | null = null;
        expect(() => { decoded = decodeState(value); }).not.toThrow();
        if (decoded) expect(encodeV3(decodeState(encodeV3(decoded))!)).toBe(encodeV3(decoded));
      }
    });
  });
});

describe('v3 limits (A29)', () => {
  const L = V3_LIMITS;
  const row = (items: unknown[], name = '', id = 'x') => [id, name, items];
  const linkWith = (json: object) => v3(JSON.stringify(json));

  it('accept each string at its cap and refuse it one character longer', () => {
    const cases: [string, (length: number) => object, number][] = [
      ['title', n => ({t: 'é'.repeat(n), r: [row([])]}), L.maxTitleLength],
      ['tier name', n => ({r: [row([], 'n'.repeat(n))]}), L.maxTierNameLength],
      ['tier id', n => ({r: [row([], '', 'i'.repeat(n))]}), L.maxIdLength],
      ['package item id', n => ({r: [row(['p'.repeat(n)])]}), L.maxIdLength],
      ['link label', n => ({r: [row([{u: 'https://x.test/a.png', c: 'c'.repeat(n)}])]}), L.maxLabelLength],
      ['device label', n => ({r: [row([{d: 'abcdefgh', c: 'c'.repeat(n)}])]}), L.maxLabelLength],
      ['url', n => ({r: [row([{u: `https://x.test/${'u'.repeat(n - 15)}`}])]}), L.maxUrlLength],
    ];
    for (const [name, build, cap] of cases) {
      expect(decodeState(linkWith(build(cap))), `${name} at the cap`).not.toBeNull();
      expect(decodeState(linkWith(build(cap + 1))), `${name} over the cap`).toBeNull();
    }
  });

  it('accept device image ids of 8 to 64 URL-safe characters (deviceId.ts, A40)', () => {
    const withDevice = (d: unknown) => reasonOf(JSON.stringify({r: [row([{d, c: 'label'}])]}));
    expect(withDevice('a'.repeat(8))).toBe('ok');
    expect(withDevice('A-_09zZx'.repeat(8))).toBe('ok');
    expect(withDevice('a'.repeat(7))).toBe('bad-device-id');
    expect(withDevice('a'.repeat(65))).toBe('bad-device-id');
    for (const d of ['', 'abcd efgh', 'abcd/efgh', 'abcd.efgh', 'blob:https://x', 'abcdéfgh', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 12345678, null, ['abcdefgh']]) {
      expect(withDevice(d), JSON.stringify(d)).toBe('bad-device-id');
    }
  });

  it('refuse empty tier ids, item ids and image addresses', () => {
    expect(reasonOf('{"r":[["","",[""]]]}')).toBe('bad-tier-id');
    expect(reasonOf('{"r":[["","",[]]]}')).toBe('bad-tier-id');
    expect(reasonOf('{"r":[["x","",[""]]]}')).toBe('bad-item');
    expect(reasonOf('{"r":[["x","",[{"u":""}]]]}')).toBe('bad-item');
    expect(reasonOf('{"r":[["x","",[{"u":"","c":"label"}]]]}')).toBe('bad-item');
    expect(reasonOf('{"r":[["x","",[{"d":""}]]]}')).toBe('bad-device-id');
    // Names and labels may be empty.
    expect(reasonOf('{"t":"","r":[["x","",["a",{"u":"https://x.test/a.png","c":""}]]]}')).toBe('ok');
  });

  it('counts string lengths in UTF-16 code units', () => {
    expect(decodeState(linkWith({t: '😀'.repeat(L.maxTitleLength / 2), r: [row([])]}))).not.toBeNull();
    expect(decodeState(linkWith({t: `${'😀'.repeat(L.maxTitleLength / 2)}a`, r: [row([])]}))).toBeNull();
  });

  it('accept 1 to 100 rows', () => {
    const rows = (count: number) => Array.from({length: count}, (_, index) => row([], '', `r${index}`));
    expect(reasonOf(JSON.stringify({r: rows(0)}))).toBe('bad-row-count');
    expect(reasonOf(JSON.stringify({r: rows(1)}))).toBe('ok');
    expect(reasonOf(JSON.stringify({r: rows(L.maxRows)}))).toBe('ok');
    expect(reasonOf(JSON.stringify({r: rows(L.maxRows + 1)}))).toBe('bad-row-count');
  });

  it('accept up to 5,000 items over all rows', () => {
    const rows = (count: number) => [row(Array(count - 1000).fill('a')), row(Array(600).fill({d: 'device-b'})), row(Array(400).fill('c'))];
    expect(reasonOf(JSON.stringify({r: rows(L.maxItems)}))).toBe('ok');
    expect(reasonOf(JSON.stringify({r: rows(L.maxItems + 1)}))).toBe('too-many-items');
  });

  it('cap the JSON at 1,000,000 characters, before decompressing it', () => {
    // JSON of an exact length, padded with an unknown key: '{"r":[["x","",[]]],"pad":"aaa…"}'.
    const padded = (length: number) => {
      const frame = '{"r":[["x","",[]]],"pad":"{run}"}';
      const stream = lzWithRun(frame, 'a', length - (frame.length - '{run}'.length));
      expect(stream.outputLength).toBe(length);
      return stream.input;
    };
    expect(readV3Payload(padded(L.maxJsonLength)).ok).toBe(true);
    expect(readV3Payload(padded(L.maxJsonLength + 1))).toEqual({ok: false, reason: 'not-lz-string-or-too-long'});
  });

  it('cap the payload at 1,000,000 characters', () => {
    const encoded = encodeV3(list()).slice(2);
    const atCap = encoded + '.'.repeat(L.maxPayloadLength - encoded.length);
    expect(decodeV3Payload(atCap)).not.toBeNull();
    expect(readV3Payload(`${atCap}.`)).toEqual({ok: false, reason: 'payload-too-long'});
  });

  it('hold the largest shipped list with room to spare', () => {
    // Every item of every image set in one 7-row list.
    const ids = Object.entries(imagesetConfig.packages)
      .flatMap(([packageName, data]) => data.images.map(image => `${packageName}-${image.filename}`));
    const tiers = ROW_TEMPLATE_TIER_IDS['7rows'].map((id, index) => ({
      id,
      name: id,
      items: ids.filter((_, itemIndex) => itemIndex % 8 === index).map(itemId => ({id: itemId})),
    }));
    const encoded = encodeV3({title: 'Everything', rowTemplate: '7rows', tiers});
    expect(decodeState(encoded)?.tiers.flatMap(tier => tier.items)).toHaveLength(ids.length);
    expect(ids.length).toBeLessThan(L.maxItems / 10);
    expect(jsonOf(encoded)!.length).toBeLessThan(L.maxJsonLength / 50);
    expect(encoded.length).toBeLessThan(L.maxPayloadLength / 100);
  });
});

describe('hostile v3 input', () => {
  it('refuses a decompression bomb quickly, without expanding it', () => {
    // Under 16,000 characters (about the longest URL a server accepts) that lz-string alone
    // would expand to 32 million characters.
    const bomb = lzBomb(8_000);
    expect(bomb.input.length).toBeLessThan(16_000);
    expect(bomb.outputLength).toBeGreaterThan(32_000_000);
    const started = performance.now();
    expect(decodeState(`3.${bomb.input}`)).toBeNull();
    expect(readV3Payload(bomb.input)).toEqual({ok: false, reason: 'not-lz-string-or-too-long'});
    expect(performance.now() - started).toBeLessThan(2_000);

    // A pathological but small JSON padding that fits the cap still decodes.
    const fits = lzWithRun('{"r":[["x","",[]]],"pad":"{run}"}', 'a', 500_000);
    expect(fits.input.length).toBeLessThan(10_000);
    expect(decodeV3Payload(fits.input)).not.toBeNull();
  });

  it('refuses deep nesting without throwing', () => {
    const depth = 200_000;
    const deepRows = `{"r":${'['.repeat(depth)}${']'.repeat(depth)}}`;
    expect(() => decodeState(v3(deepRows))).not.toThrow();
    expect(decodeState(v3(deepRows))).toBeNull();
    const deepItems = `{"r":[["x","",[${'{"u":'.repeat(1000)}"x"${'}'.repeat(1000)}]]]}`;
    expect(reasonOf(deepItems)).toBe('bad-item');
    // Deep nesting under a key it does not know: refused or ignored, never thrown.
    const deepUnknown = `{"x":${'['.repeat(depth)}${']'.repeat(depth)},"r":[["x","",[]]]}`;
    expect(() => decodeState(v3(deepUnknown))).not.toThrow();
  });

  it('refuses wrong types', () => {
    const invalid: [string, string][] = [
      ['null', 'not-an-object'], ['[]', 'not-an-object'], ['"text"', 'not-an-object'], ['42', 'not-an-object'],
      ['{"r":[["x","",[]]],"t":1}', 'bad-title'], ['{"t":null,"r":[["x","",[]]]}', 'bad-title'],
      ['{"t":{},"r":[["x","",[]]]}', 'bad-title'], ['{"t":["a"],"r":[["x","",[]]]}', 'bad-title'],
      ['{"tp":"5","r":[["x","",[]]]}', 'bad-row-template'], ['{"tp":4,"r":[["x","",[]]]}', 'bad-row-template'],
      ['{"tp":5.5,"r":[["x","",[]]]}', 'bad-row-template'], ['{"tp":null,"r":[["x","",[]]]}', 'bad-row-template'],
      ['{"tp":"custom","r":[["x","",[]]]}', 'bad-row-template'], ['{"tp":0,"r":[["x","",[]]]}', 'bad-row-template'],
      ['{"lp":"bottom","r":[["x","",[]]]}', 'bad-label-position'], ['{"lp":1,"r":[["x","",[]]]}', 'bad-label-position'],
      ['{"lp":"LEFT","r":[["x","",[]]]}', 'bad-label-position'],
      ['{"sl":"false","r":[["x","",[]]]}', 'bad-show-labels'], ['{"sl":0,"r":[["x","",[]]]}', 'bad-show-labels'],
      ['{"sl":null,"r":[["x","",[]]]}', 'bad-show-labels'],
      ['{}', 'bad-rows'], ['{"r":{}}', 'bad-rows'], ['{"r":"x"}', 'bad-rows'], ['{"r":null}', 'bad-rows'],
      ['{"tiers":[{"i":"x","n":"","t":[]}]}', 'bad-rows'],
      ['{"r":[{}]}', 'bad-row'], ['{"r":[[]]}', 'bad-row'], ['{"r":[["x"]]}', 'bad-row'], ['{"r":[null]}', 'bad-row'],
      ['{"r":[["a","b",[],"d"]]}', 'bad-row'], ['{"r":["x"]}', 'bad-row'],
      ['{"r":[[1,"",[]]]}', 'bad-tier-id'], ['{"r":[[null,"",[]]]}', 'bad-tier-id'],
      ['{"r":[["x",1,[]]]}', 'bad-tier-name'], ['{"r":[["x",["n"],[]]]}', 'bad-tier-name'],
      ['{"r":[["x","",{}]]}', 'bad-items'], ['{"r":[["x","","a"]]}', 'bad-items'], ['{"r":[["x","",null]]}', 'bad-items'],
      ['{"r":[["x","",[1]]]}', 'bad-item'], ['{"r":[["x","",[null]]]}', 'bad-item'], ['{"r":[["x","",[true]]]}', 'bad-item'],
      ['{"r":[["x","",[[]]]]}', 'bad-item'], ['{"r":[["x","",[["a"]]]]}', 'bad-item'], ['{"r":[["x","",[{}]]]}', 'bad-item'],
      ['{"r":[["x","",[{"c":"label"}]]]}', 'bad-item'], ['{"r":[["x","",[{"u":1}]]]}', 'bad-item'],
      ['{"r":[["x","",[{"u":null}]]]}', 'bad-item'], ['{"r":[["x","",[{"d":["a"]}]]]}', 'bad-device-id'],
      ['{"r":[["x","",[{"u":"a","d":"b"}]]]}', 'bad-item'], ['{"r":[["x","",[{"u":"a","c":1}]]]}', 'bad-item'],
      ['{"r":[["x","",[{"d":"a","c":null}]]]}', 'bad-item'], ['{"r":[["x","",[{"i":"a"}]]]}', 'bad-item'],
    ];
    for (const [json, reason] of invalid) expect(reasonOf(json), json).toBe(reason);
    expect(reasonOf('{"r":[["x","",[]]]')).toBe('not-json');
    expect(reasonOf('{"r":[["x","",[]]]}garbage')).toBe('not-json');
  });

  it('never reads keys from Object.prototype, and never changes it', () => {
    // JSON.parse makes "__proto__" an ordinary own key; it must not count as "r", "u" or "d".
    expect(reasonOf('{"__proto__":{"r":[["x","",[]]]}}')).toBe('bad-rows');
    expect(reasonOf('{"r":[["x","",[{"__proto__":{"u":"https://x.test/a.png"}}]]]}')).toBe('bad-item');
    expect(reasonOf('{"r":[["x","",[{"constructor":"x"}]]]}')).toBe('bad-item');
    expect(reasonOf('{"r":[["x","",[{"toString":"x","valueOf":"y","hasOwnProperty":"z"}]]]}')).toBe('bad-item');
    // Device image ids named like Object.prototype members are refused (deviceId.ts).
    expect(reasonOf('{"r":[["x","",[{"d":"__proto__","c":"hasOwnProperty"}]]]}')).toBe('bad-device-id');
    expect(reasonOf('{"r":[["x","",[{"d":"constructor"}]]]}')).toBe('bad-device-id');
    const decoded = decodeState(v3('{"__proto__":{"t":"evil","polluted":true},"constructor":{"prototype":{"polluted":true}},' +
      '"r":[["__proto__","constructor",["__proto__","constructor","toString",{"d":"hasOwnPropertyX","c":"hasOwnProperty"}]]]}'));
    expect(decoded).toEqual({
      version: 3,
      rowTemplate: 'custom',
      labelPosition: 'left',
      showLabels: true,
      tiers: [{
        id: '__proto__',
        name: 'constructor',
        items: [{id: '__proto__'}, {id: 'constructor'}, {id: 'toString'}, {kind: 'device', id: 'hasOwnPropertyX', content: 'hasOwnProperty'}],
      }],
    });
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(decoded).not.toHaveProperty('polluted');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(encodeV3(decodeState(encodeV3(decoded!))!)).toBe(encodeV3(decoded!));
  });

  it('refuses huge and odd numbers where a type is expected', () => {
    expect(reasonOf('{"tp":1e999,"r":[["x","",[]]]}')).toBe('bad-row-template');
    expect(reasonOf('{"tp":-5,"r":[["x","",[]]]}')).toBe('bad-row-template');
    expect(reasonOf('{"tp":500000000000000000000005,"r":[["x","",[]]]}')).toBe('bad-row-template');
    expect(reasonOf('{"sl":1e309,"r":[["x","",[]]]}')).toBe('bad-show-labels');
    expect(reasonOf('{"r":[["x","",[1e999]]]}')).toBe('bad-item');
    expect(reasonOf('{"r":[[1e999,"",[]]]}')).toBe('bad-tier-id');
    expect(reasonOf('{"t":-0,"r":[["x","",[]]]}')).toBe('bad-title');
    // Same number, other spelling: 5.0 and 5e0 are 5.
    expect(reasonOf('{"tp":5.0,"r":[["S",[]]]}')).toBe('ok');
    expect(reasonOf('{"tp":5e0,"r":[["S",[]]]}')).toBe('ok');
  });
});
