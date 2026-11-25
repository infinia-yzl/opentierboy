import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import {decodeState, DEFAULT_WRITE_FORMAT, encodeState, encodeV2, encodeV3} from '@/lib/state';
import {PreRefactorTierCortex} from '../../support/tier-cortex-pre-refactor';
import {randomAppStates, randomV3States, toCanonical} from '../../support/random-states';

const json = (encoded: string) => LZString.decompressFromEncodedURIComponent(encoded);

describe('encodeState', () => {
  it('returns the encodeV3 output when no format or format 3 is given (DEFAULT_WRITE_FORMAT is 3)', () => {
    expect(DEFAULT_WRITE_FORMAT).toBe(3);
    for (const state of randomV3States(50, 8)) {
      expect(encodeState(state)).toBe(encodeV3(state));
      expect(encodeState(state, {format: 3})).toBe(encodeV3(state));
    }
  });

  it('returns the encodeV2 output when format is 2', () => {
    for (const state of randomAppStates(50, 7).map(toCanonical)) {
      expect(encodeState(state, {format: 2})).toBe(encodeV2(state));
    }
  });
});

/** The v2 encoder stays byte for byte what the app wrote before lib/state and before v3. */
describe('encodeV2', () => {
  // Every legacy value starts with N, so a version prefix such as "3." never matches one.
  it('returns a value that starts with N when it encodes 300 random lists', () => {
    for (const state of randomAppStates(300, 5)) expect(encodeV2(toCanonical(state))[0]).toBe('N');
  });

  it('returns the bytes TierCortex.encodeTierStateForURL wrote before lib/state when given 2,000 random lists', () => {
    const states = randomAppStates(2000, 20261025);
    for (let index = 0; index < states.length; index++) {
      const state = states[index];
      const before = PreRefactorTierCortex.encodeTierStateForURL(state.title, state.tiers);
      expect(encodeV2(toCanonical(state)), `random state #${index}`).toBe(before);
    }
  });

  it('returns the plain v2 bytes when the list has v3 fields (layout settings, link and device images)', () => {
    // v2 has no place for layout settings; link and device images keep their label as v2
    // custom items do, so a v2 link of such a list shows label tiles.
    const plain = {title: 'T', tiers: [{id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-ana.webp'}]}]};
    expect(encodeV2({...plain, rowTemplate: '7rows', labelPosition: 'top', showLabels: false})).toBe(encodeV2(plain));
    const withImages = encodeV2({
      tiers: [{
        id: 'uncategorized',
        name: '',
        items: [
          {kind: 'link', id: 'https://x.test/a.png', url: 'https://x.test/a.png', content: 'A'},
          {kind: 'device', id: 'k3j9x0a1b', content: 'cat'},
        ],
      }],
    });
    expect(json(withImages)).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[{"i":"https://x.test/a.png","c":"A"},{"i":"k3j9x0a1b","c":"cat"}]}]}');
  });

  it('returns JSON with tiers before title when the list has a title', () => {
    const encoded = encodeV2({
      title: 'My list',
      tiers: [{id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-mau.webp'}]}],
    });
    expect(json(encoded)).toBe('{"tiers":[{"i":"tier-s","n":"S","t":[{"i":"image-overwatch-mau.webp"}]}],"title":"My list"}');
  });

  it('returns no c key when a label is undefined, and c: \'\' when it is empty', () => {
    const encoded = encodeV2({
      tiers: [{id: 'uncategorized', name: '', items: [{id: 'a1b2c3d4e', content: ''}, {id: 'image-set-hero1.webp'}]}],
    });
    expect(json(encoded)).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[{"i":"a1b2c3d4e","c":""},{"i":"image-set-hero1.webp"}]}]}');
  });

  it('returns no title key when the title is empty or missing, and the title when it is only spaces', () => {
    const tiers = [{id: 'uncategorized', name: '', items: []}];
    expect(json(encodeV2({tiers}))).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[]}]}');
    expect(json(encodeV2({title: '', tiers}))).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[]}]}');
    expect(json(encodeV2({title: ' ', tiers}))).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[]}],"title":" "}');
  });

  it('returns the same bytes when it encodes the decoded value of its own output', () => {
    const states = randomAppStates(500, 99);
    for (let index = 0; index < states.length; index++) {
      const encoded = encodeV2(toCanonical(states[index]));
      const decoded = decodeState(encoded);
      expect(decoded, `random state #${index}`).not.toBeNull();
      expect(encodeV2(decoded!), `random state #${index}`).toBe(encoded);
    }
  });
});
