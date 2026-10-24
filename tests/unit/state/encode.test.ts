import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import {decodeState, encodeState, encodeV2} from '@/lib/state';
import {PreRefactorTierCortex} from '../support/TierCortex.pre-refactor';
import {randomAppStates, toCanonical} from '../support/randomStates';

const json = (encoded: string) => LZString.decompressFromEncodedURIComponent(encoded);

describe('encodeState', () => {
  it('writes exactly the bytes TierCortex.encodeTierStateForURL wrote before lib/state', () => {
    const states = randomAppStates(2000, 20261025);
    for (let index = 0; index < states.length; index++) {
      const state = states[index];
      const before = PreRefactorTierCortex.encodeTierStateForURL(state.title, state.tiers);
      expect(encodeState(toCanonical(state)), `random state #${index}`).toBe(before);
    }
  });

  it('writes the v2 format today', () => {
    const state = toCanonical(randomAppStates(1, 7)[0]);
    expect(encodeState(state)).toBe(encodeV2(state));
  });

  it('writes the keys in the order tiers, title', () => {
    const encoded = encodeState({
      title: 'My list',
      tiers: [{id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-mau.webp'}]}],
    });
    expect(json(encoded)).toBe('{"tiers":[{"i":"tier-s","n":"S","t":[{"i":"image-overwatch-mau.webp"}]}],"title":"My list"}');
  });

  it('leaves out a label that is undefined and keeps an empty label', () => {
    const encoded = encodeState({
      tiers: [{id: 'uncategorized', name: '', items: [{id: 'a1b2c3d4e', content: ''}, {id: 'image-set-hero1.webp'}]}],
    });
    expect(json(encoded)).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[{"i":"a1b2c3d4e","c":""},{"i":"image-set-hero1.webp"}]}]}');
  });

  it('leaves out an empty or missing title and keeps a title made of spaces', () => {
    const tiers = [{id: 'uncategorized', name: '', items: []}];
    expect(json(encodeState({tiers}))).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[]}]}');
    expect(json(encodeState({title: '', tiers}))).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[]}]}');
    expect(json(encodeState({title: ' ', tiers}))).toBe('{"tiers":[{"i":"uncategorized","n":"","t":[]}],"title":" "}');
  });

  it('gives back the same bytes after decoding a value it wrote', () => {
    const states = randomAppStates(500, 99);
    for (let index = 0; index < states.length; index++) {
      const encoded = encodeState(toCanonical(states[index]));
      const decoded = decodeState(encoded);
      expect(decoded, `random state #${index}`).not.toBeNull();
      expect(encodeState(decoded!), `random state #${index}`).toBe(encoded);
    }
  });
});
