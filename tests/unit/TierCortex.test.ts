import fs from 'node:fs';
import path from 'node:path';
import LZString from 'lz-string';
import {afterEach, describe, expect, it, vi} from 'vitest';
import TierCortex from '@/lib/TierCortex';
import sharedLinks from '../fixtures/shared-links.json';
import {PreRefactorTierCortex} from './support/TierCortex.pre-refactor';
import {randomAppStates, seededRandom} from './support/randomStates';

/**
 * TierCortex now hands the link format to lib/state. These tests prove that nothing a user
 * can see changed: the same links are written, and every link decodes to the same items,
 * compared with a frozen copy of TierCortex from before the change.
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
  lz('{"tiers":[{"i":"a","n":"b","t":[{"i":"__proto__"},{"i":"toString","c":"x"},{"i":"hasOwnProperty"}]}]}'),
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
      const {before, after, beforeLogs, afterLogs} = decodeWithBoth(inputs[index]);
      expect(after, `input #${index}: ${inputs[index].slice(0, 40)}`).toStrictEqual(before);
      expect(afterLogs, `input #${index}`).toEqual(beforeLogs);
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
      const {before, after, beforeLogs, afterLogs} = decodeWithBoth(input);
      expect(after, input.slice(0, 40)).toStrictEqual(before);
      expect(afterLogs).toEqual(beforeLogs);
    }
  });

  it('starts template pages and shared links with the same tiers', () => {
    const itemSet = {packageName: 'image-overwatch', packageDisplayName: 'OVERWATCH', tagName: 'tank', tagTitle: 'Tank', images: ['mau.webp', 'win.webp', 'gone.webp']};
    for (const state of [undefined, '', 'not-a-state', sharedLinks[0].state, sharedLinks[11].state]) {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(new TierCortex().getInitialTiers(state, itemSet))
        .toStrictEqual(new PreRefactorTierCortex().getInitialTiers(state, itemSet));
      expect(new TierCortex().getInitialTiers(state, undefined))
        .toStrictEqual(new PreRefactorTierCortex().getInitialTiers(state, undefined));
      errorSpy.mockRestore();
    }
  });
});
