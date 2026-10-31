import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {type CanonicalState, decodeState, encodeV2, encodeV3} from '@/lib/state';
import {createTierCortex} from '@/lib/TierCortex';
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

describe('tests/fixtures/state', () => {
  it('returns entries in formats v0, v1 and v2 when the state fixture files are read', () => {
    const formats = new Set(stateFixtures.map(({entry}) => entry.format));
    for (const format of ['v0', 'v1', 'v2']) expect(formats).toContain(format);
  });

  it('returns a unique id for each entry when the state fixture files are read', () => {
    const ids = stateFixtures.map(({entry}) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const {file, entry} of stateFixtures) {
    describe(`${file} ${entry.id}`, () => {
      it('returns entry.expected from decodeState when given entry.state', () => {
        expect(decodeState(entry.state)).toEqual(entry.expected);
      });

      it('returns entry.expected from decodeState when "+" is a space or the state ends in stray characters', () => {
        expect(decodeState(withSpaces(entry.state))).toEqual(entry.expected);
        for (const suffix of STRAY_SUFFIXES) {
          expect(decodeState(entry.state + suffix), `suffix ${JSON.stringify(suffix)}`).toEqual(entry.expected);
        }
      });

      if (entry.format === 'v1' || entry.format === 'v2') {
        it('returns entry.state from encodeV2 when the decoded v1 or v2 state is encoded', () => {
          expect(encodeV2(decodeState(entry.state)!)).toBe(withPlus(entry.state));
        });
      }

      if (entry.format === 'v3') {
        it('returns entry.state from encodeV3 when it encodes entry.expected or the decoded state', () => {
          expect(encodeV3(entry.expected)).toBe(entry.state);
          expect(encodeV3(decodeState(entry.state)!)).toBe(entry.state);
        });
      }
    });
  }

  it('returns v3 entries from v3.json only when the state fixture files are read', () => {
    for (const {file, entry} of stateFixtures) {
      expect(entry.format === 'v3', `${file} ${entry.id}`).toBe(file === 'v3.json');
    }
  });
});

describe('encodeV3 output length', () => {
  const entry = (id: string) => stateFixtures.find(fixture => fixture.entry.id === id)!.entry;

  it('returns a 6381-character v3 state and a 6744-character v2 state when the list has 7 rows and 430 items', () => {
    const v2 = entry('v2-all-items-every-package');
    const v3 = entry('v3-all-items-every-package');
    expect(encodeV2(v3.expected)).toBe(v2.state);
    expect(v3.state.length).toBe(6381);
    expect(v2.state.length).toBe(6744);
  });

  it('returns a 392-character v3 state and a 507-character v2 state when the list has 20 items', () => {
    const v3 = entry('v3-typical-20-items');
    expect(v3.expected.tiers.flatMap(tier => tier.items)).toHaveLength(20);
    expect(v3.state.length).toBe(392);
    expect(encodeV2(v3.expected).length).toBe(507);
  });
});

describe('tests/fixtures/shared-links.json', () => {
  // A version prefix such as "3." never matches a legacy value (lib/state/decode.ts).
  it('returns a state that starts with N when each shared legacy link is read', () => {
    for (const link of sharedLinks) expect(link.state[0], link.id).toBe('N');
  });

  it('returns v0, v1 and v2 links and no unknown format when shared-links.json is read', () => {
    // v3 links (written since Phase 5b) may join the captured links later (A25).
    const formats = new Set(sharedLinks.map(link => link.format));
    for (const format of ['v0', 'v1', 'v2']) expect(formats).toContain(format);
    for (const format of formats) expect(['v0', 'v1', 'v2', 'v3']).toContain(format);
  });

  for (const link of sharedLinks) {
    describe(`${link.id} (${link.format})`, () => {
      it('returns link.format as the version, and the title, from decodeState when given link.state', () => {
        const decoded = decodeState(link.state);
        expect(decoded).not.toBeNull();
        expect(`v${decoded!.version}`).toBe(link.format);
        if (decoded!.title !== undefined) expect(decoded!.title).toBe(link.expected.title);
      });

      it('returns the expected row names and item labels from decodeTierStateFromURL when given link.state', () => {
        const decoded = createTierCortex().decodeTierStateFromURL(link.state);
        expect(decoded).not.toBeNull();
        expect(decoded!.tiers.map(tier => ({
          name: tier.name.trim() || 'Unranked',
          items: tier.items.map(item => item.content),
        }))).toEqual(link.expected.tiers);
      });

      it('returns the same state from decodeState when spaces are "+" or the state ends in stray characters', () => {
        const expected = decodeState(link.state);
        expect(decodeState(withPlus(link.state))).toEqual(expected);
        for (const suffix of STRAY_SUFFIXES) {
          expect(decodeState(link.state + suffix), `suffix ${JSON.stringify(suffix)}`).toEqual(expected);
        }
      });

      if (link.format === 'v1' || link.format === 'v2') {
        it('returns link.state from encodeV2 when the decoded v1 or v2 state is encoded', () => {
          expect(encodeV2(decodeState(link.state)!)).toBe(withPlus(link.state));
        });
      }

      if (link.format === 'v3') {
        it('returns link.state from encodeV3 when the decoded v3 state is encoded', () => {
          expect(encodeV3(decodeState(link.state)!)).toBe(withPlus(link.state));
        });
      }
    });
  }
});
