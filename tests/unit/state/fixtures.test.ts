import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {type CanonicalState, decodeState, encodeV2} from '@/lib/state';
import TierCortex from '@/lib/TierCortex';
import sharedLinks from '../../fixtures/shared-links.json';

/**
 * The golden fixtures are a contract: every link people ever shared must keep opening.
 * If a test here fails, the app regressed. Fix the app, never the fixture (tests/README.md).
 */

interface StateFixture {
  id: string;
  format: string;
  state: string;
  expected: CanonicalState;
}

const stateDir = path.resolve(__dirname, '../../fixtures/state');
const stateFiles = fs.readdirSync(stateDir).filter(file => file.endsWith('.json')).sort();
const stateFixtures = stateFiles.flatMap(file =>
  (JSON.parse(fs.readFileSync(path.join(stateDir, file), 'utf8')) as StateFixture[])
    .map(entry => ({file, entry})));

/** Characters that stick to a link pasted into a sentence or a chat message. */
const STRAY_SUFFIXES = ['.', ')', '..', '...', '),', ').', ',', '!', '?', ']', '>', '"', "'", ';', ':', '*', '%29'];

const withPlus = (state: string) => state.replace(/ /g, '+');
const withSpaces = (state: string) => state.replace(/\+/g, ' ');

describe('golden state fixtures (tests/fixtures/state)', () => {
  it('cover every legacy format', () => {
    const formats = new Set(stateFixtures.map(({entry}) => entry.format));
    for (const format of ['v0', 'v1', 'v2']) expect(formats).toContain(format);
  });

  it('have unique ids', () => {
    const ids = stateFixtures.map(({entry}) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const {file, entry} of stateFixtures) {
    describe(`${file} ${entry.id}`, () => {
      it('decodes to its expected state', () => {
        expect(decodeState(entry.state)).toEqual(entry.expected);
      });

      it('decodes the same with spaces for "+" and with stray characters at the end', () => {
        expect(decodeState(withSpaces(entry.state))).toEqual(entry.expected);
        for (const suffix of STRAY_SUFFIXES) {
          expect(decodeState(entry.state + suffix), `suffix ${JSON.stringify(suffix)}`).toEqual(entry.expected);
        }
      });

      if (entry.format === 'v1' || entry.format === 'v2') {
        it('encodes back to the same bytes', () => {
          expect(encodeV2(decodeState(entry.state)!)).toBe(withPlus(entry.state));
        });
      }
    });
  }
});

describe('golden shared links (tests/fixtures/shared-links.json)', () => {
  it('cover every legacy format', () => {
    expect(Array.from(new Set(sharedLinks.map(link => link.format))).sort()).toEqual(['v0', 'v1', 'v2']);
  });

  for (const link of sharedLinks) {
    describe(`${link.id} (${link.format})`, () => {
      it('decodes in its own format', () => {
        const decoded = decodeState(link.state);
        expect(decoded).not.toBeNull();
        expect(`v${decoded!.version}`).toBe(link.format);
        if (decoded!.title !== undefined) expect(decoded!.title).toBe(link.expected.title);
      });

      it('shows the captured tiers and labels', () => {
        const decoded = new TierCortex().decodeTierStateFromURL(link.state);
        expect(decoded).not.toBeNull();
        expect(decoded!.tiers.map(tier => ({
          name: tier.name.trim() || 'Unranked',
          items: tier.items.map(item => item.content),
        }))).toEqual(link.expected.tiers);
      });

      it('decodes the same with "+" for spaces and with stray characters at the end', () => {
        const expected = decodeState(link.state);
        expect(decodeState(withPlus(link.state))).toEqual(expected);
        for (const suffix of STRAY_SUFFIXES) {
          expect(decodeState(link.state + suffix), `suffix ${JSON.stringify(suffix)}`).toEqual(expected);
        }
      });

      if (link.format === 'v1' || link.format === 'v2') {
        it('encodes back to the same bytes', () => {
          expect(encodeV2(decodeState(link.state)!)).toBe(withPlus(link.state));
        });
      }
    });
  }
});
