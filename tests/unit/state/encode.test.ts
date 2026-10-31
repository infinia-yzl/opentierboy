import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import {decodeState, DEFAULT_WRITE_FORMAT, encodeState, encodeV2, encodeV3} from '@/lib/state';
import {PreRefactorTierCortex} from '../support/TierCortex.pre-refactor';
import {randomAppStates, randomV3States, toCanonical} from '../support/randomStates';

const json = (encoded: string) => LZString.decompressFromEncodedURIComponent(encoded);

describe('encodeState', () => {
  it('writes the v3 format by default since the Phase 5b wiring step', () => {
    expect(DEFAULT_WRITE_FORMAT).toBe(3);
    for (const state of randomV3States(50, 8)) {
      expect(encodeState(state)).toBe(encodeV3(state));
      expect(encodeState(state, {format: 3})).toBe(encodeV3(state));
    }
  });

  it('still writes v2 when asked', () => {
    for (const state of randomAppStates(50, 7).map(toCanonical)) {
      expect(encodeState(state, {format: 2})).toBe(encodeV2(state));
    }
  });
});

/** The v2 encoder stays byte for byte what the app wrote before lib/state and before v3. */
describe('encodeV2', () => {
  it('writes exactly the bytes TierCortex.encodeTierStateForURL wrote before lib/state', () => {
    const states = randomAppStates(2000, 20261025);
    for (let index = 0; index < states.length; index++) {
      const state = states[index];
      const before = PreRefactorTierCortex.encodeTierStateForURL(state.title, state.tiers);
      expect(encodeV2(toCanonical(state)), `random state #${index}`).toBe(before);
    }
  });

  it('writes the same v2 bytes when a list carries v3 fields', () => {
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

  it('writes the keys in the order tiers, title', () => {
    const encoded = encodeV2({
      title: 'My list',
      tiers: [{id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-mau.webp'}]}],
    });
    expect(json(encoded)).toBe('{"tiers":[{"i":"tier-s","n":"S","t":[{"i":"image-overwatch-mau.webp"}]}],"title":"My list"}');
  });

  it('leaves out a label that is undefined and keeps an empty label', () => {
    const encoded = encodeV2({
      tiers: [{id: 'uncategorized', name: '', items: [{id: 'a1b2c3d4e', content: ''}, {id: 'image-set-hero1.webp'}]}],
    });
    expect(json(encoded)).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[{"i":"a1b2c3d4e","c":""},{"i":"image-set-hero1.webp"}]}]}');
  });

  it('leaves out an empty or missing title and keeps a title made of spaces', () => {
    const tiers = [{id: 'uncategorized', name: '', items: []}];
    expect(json(encodeV2({tiers}))).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[]}]}');
    expect(json(encodeV2({title: '', tiers}))).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[]}]}');
    expect(json(encodeV2({title: ' ', tiers}))).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[]}],"title":" "}');
  });

  it('gives back the same bytes after decoding a value it wrote', () => {
    const states = randomAppStates(500, 99);
    for (let index = 0; index < states.length; index++) {
      const encoded = encodeV2(toCanonical(states[index]));
      const decoded = decodeState(encoded);
      expect(decoded, `random state #${index}`).not.toBeNull();
      expect(encodeV2(decoded!), `random state #${index}`).toBe(encoded);
    }
  });
});
