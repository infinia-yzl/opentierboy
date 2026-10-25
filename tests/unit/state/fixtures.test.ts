import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {type CanonicalState, decodeState, encodeV2, encodeV3} from '@/lib/state';
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

      if (entry.format === 'v3') {
        it('encodes back to the same text, from the expected state and from the decoded one', () => {
          expect(encodeV3(entry.expected)).toBe(entry.state);
          expect(encodeV3(decodeState(entry.state)!)).toBe(entry.state);
        });
      }
    });
  }

  it('keep v3 entries in v3.json and legacy entries out of it (A25)', () => {
    for (const {file, entry} of stateFixtures) {
      expect(entry.format === 'v3', `${file} ${entry.id}`).toBe(file === 'v3.json');
    }
  });
});

describe('v3 link length (docs/link-format-v3.md)', () => {
  const entry = (id: string) => stateFixtures.find(fixture => fixture.entry.id === id)!.entry;

  it('is shorter than v2 for the 7-row list of all 430 items', () => {
    const v2 = entry('v2-all-items-every-package');
    const v3 = entry('v3-all-items-every-package');
    expect(encodeV2(v3.expected)).toBe(v2.state);
    expect(v3.state.length).toBe(6381);
    expect(v2.state.length).toBe(6744);
  });

  it('is shorter than v2 for a typical 20-item list', () => {
    const v3 = entry('v3-typical-20-items');
    expect(v3.expected.tiers.flatMap(tier => tier.items)).toHaveLength(20);
    expect(v3.state.length).toBe(392);
    expect(encodeV2(v3.expected).length).toBe(507);
  });
});

describe('golden shared links (tests/fixtures/shared-links.json)', () => {
  it('cover every legacy format, and hold only known formats', () => {
    // v3 links (written since Phase 5b) may join the captured links later (A25).
    const formats = new Set(sharedLinks.map(link => link.format));
    for (const format of ['v0', 'v1', 'v2']) expect(formats).toContain(format);
    for (const format of formats) expect(['v0', 'v1', 'v2', 'v3']).toContain(format);
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

      if (link.format === 'v3') {
        it('encodes back to the same text', () => {
          expect(encodeV3(decodeState(link.state)!)).toBe(withPlus(link.state));
        });
      }
    });
  }
});
