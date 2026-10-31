import LZString from 'lz-string';
import {describe, expect, it, vi} from 'vitest';
import {decodeState, encodeV2} from '@/lib/state';
import sharedLinks from '../../../fixtures/shared-links.json';
import {randomAppStates, seededRandom, toCanonical} from '../../support/randomStates';

const lz = (text: string) => LZString.compressToEncodedURIComponent(text);

describe('decodeState', () => {
  it('returns the canonical list when the value is a v0, v1 or v2 link', () => {
    const v0 = lz('[{"i":"tier-s","n":"S","t":[{"i":"image-overwatch-mau.webp","c":"Mauga"}]}]');
    const v1 = lz('{"tiers":[{"i":"tier-s","n":"S","t":[{"i":"image-overwatch-mau.webp","c":"Mauga"}]}],"title":"T"}');
    const v2 = lz('{"tiers":[{"i":"tier-s","n":"S","t":[{"i":"image-overwatch-mau.webp"},{"i":"k3j9x0a1b","c":"cat"}]}],"title":"T"}');

    expect(decodeState(v0)).toEqual({
      version: 0,
      tiers: [{id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-mau.webp', content: 'Mauga'}]}],
    });
    expect(decodeState(v1)).toEqual({
      version: 1,
      title: 'T',
      tiers: [{id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-mau.webp', content: 'Mauga'}]}],
    });
    expect(decodeState(v2)).toEqual({
      version: 2,
      title: 'T',
      tiers: [{id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-mau.webp'}, {id: 'k3j9x0a1b', content: 'cat'}]}],
    });
  });

  it('returns version 1 when a v1 or v2 list has no image-set item (both formats wrote the same bytes)', () => {
    expect(decodeState(lz('{"tiers":[{"i":"uncategorized","n":"","t":[]}]}'))?.version).toBe(1);
    expect(decodeState(lz('{"tiers":[{"i":"tier-s","n":"S","t":[{"i":"k3j9x0a1b","c":"cat"}]}]}'))?.version).toBe(1);
  });

  it('returns content \'\' when the label is empty, and no content property when it is missing', () => {
    const decoded = decodeState(lz('{"tiers":[{"i":"tier-s","n":"S","t":[{"i":"a","c":""},{"i":"b"}]}]}'));
    expect(decoded?.tiers[0].items).toEqual([{id: 'a', content: ''}, {id: 'b'}]);
    expect(decoded?.tiers[0].items[1]).not.toHaveProperty('content');
  });

  it('returns the same list when the value has spaces where the link had + (as URLSearchParams delivers them)', () => {
    // The captured shared links hold spaces, exactly as the app read them from the address bar.
    const withSpaces = sharedLinks.map(link => link.state).filter(state => state.includes(' '));
    expect(withSpaces.length).toBeGreaterThan(0);
    for (const state of withSpaces) {
      const decoded = decodeState(state);
      expect(decoded).not.toBeNull();
      expect(decodeState(state.replace(/ /g, '+'))).toEqual(decoded);
    }
  });

  describe('decodeState with a version prefix', () => {
    const payloads = sharedLinks.map(link => link.state);

    it('returns a value that starts with N, never a digit, when encodeV2 encodes a list or a shared legacy link is read', () => {
      const encoded = [...payloads, ...randomAppStates(300, 5).map(state => encodeV2(toCanonical(state)))];
      for (const value of encoded) expect(value[0]).toBe('N');
    });

    it('returns null when the version prefix has no decoder (0., 1., 2., 4., 10., 03.)', () => {
      for (const prefix of ['0.', '1.', '2.', '4.', '10.', '03.']) {
        for (const payload of payloads) {
          expect(decodeState(prefix + payload), `${prefix}${payload.slice(0, 12)}…`).toBeNull();
        }
        expect(decodeState(prefix)).toBeNull();
      }
    });

    it('returns null, and passes a v3 error to onError, when a 3. prefix comes before a legacy payload', () => {
      const onError = vi.fn();
      for (const payload of payloads) {
        expect(decodeState(`3.${payload}`, {onError}), `3.${payload.slice(0, 12)}…`).toBeNull();
        // v0 values are JSON arrays; v1 and v2 values are objects without "r".
        expect(String(onError.mock.lastCall?.[0])).toMatch(/^Error: Invalid v3 state: (not-an-object|bad-rows)$/);
      }
      expect(decodeState('3.')).toBeNull();
      const v3 = `3.${lz('{"r":[["S",[]]],"tp":3}')}`;
      expect(decodeState(v3)?.version).toBe(3);
    });

    it('returns the legacy list when the value has a dot after the legacy payload', () => {
      const legacy = payloads[1];
      expect(decodeState(legacy)).not.toBeNull();
      expect(decodeState(`${legacy}.`)).toEqual(decodeState(legacy));
      expect(decodeState(`${legacy}.3.x`)).toEqual(decodeState(legacy));
    });
  });

  describe('decodeState with values that are not links', () => {
    it('returns null, and passes the error to onError, when the value is not a link', () => {
      const onError = vi.fn();
      expect(decodeState('', {onError})).toBeNull();
      expect(onError).toHaveBeenLastCalledWith(new Error('Failed to decompress state'));

      expect(decodeState('this-is-not-a-valid-state', {onError})).toBeNull();
      expect(decodeState(lz('hello'), {onError})).toBeNull();
      expect(onError.mock.lastCall?.[0]).toBeInstanceOf(SyntaxError);

      for (const text of ['42', '"text"', 'true', '{}', '{"tiers":"x"}', '{"title":"T"}']) {
        expect(decodeState(lz(text), {onError}), text).toBeNull();
        expect(onError).toHaveBeenLastCalledWith(new Error('Invalid state format'));
      }

      for (const text of ['null', '{"tiers":[null]}', '[{"i":"a","n":"b"}]', '[{"i":"a","n":"b","t":"x"}]', '[{"i":"a","n":"b","t":[null]}]']) {
        expect(decodeState(lz(text), {onError}), text).toBeNull();
        expect(onError.mock.lastCall?.[0]).toBeInstanceOf(TypeError);
      }
    });

    it('returns non-string ids, names, labels and titles unchanged when a legacy value has them', () => {
      expect(decodeState(lz('{"tiers":[{"i":1,"n":2,"t":[5,{"i":"x","c":null}]}],"title":7,"extra":true}'))).toEqual({
        version: 2,
        title: 7,
        tiers: [{id: 1, name: 2, items: [{id: undefined}, {id: 'x', content: null}]}],
      });
      expect(decodeState(lz('{"tiers":[],"title":""}'))).toStrictEqual({version: 1, title: '', tiers: []});
      expect(decodeState(lz('{"tiers":[],"title":null}'))).toStrictEqual({version: 1, title: null, tiers: []});
      expect(decodeState(lz('[]'))).toEqual({version: 0, tiers: []});
      expect(decodeState(lz('{"tiers":[]}'))).toEqual({version: 1, tiers: []});
    });

    it('throws no error when the value is any of 3,000 random strings', () => {
      const random = seededRandom(42);
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$ .)%';
      for (let index = 0; index < 3000; index++) {
        let value = '';
        const length = Math.floor(random() * 120);
        for (let char = 0; char < length; char++) value += alphabet[Math.floor(random() * alphabet.length)];
        expect(() => decodeState(value)).not.toThrow();
      }
    });
  });
});
