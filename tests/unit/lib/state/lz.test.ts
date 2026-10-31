import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import {decompressFromEncodedURIComponentCapped, measureDecompressedLength} from '@/lib/state/lz';
import sharedLinks from '../../../fixtures/shared-links.json';
import generated from '../../../fixtures/state/generated.json';
import {LzBitWriter, LzStreamWriter, lzBomb, lzWithRun} from '../../support/lzStream';
import {seededRandom} from '../../support/randomStates';

const URI_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';

function randomText(random: () => number, length: number): string {
  const alphabets = [
    'ab',
    'abcdefghijklmnopqrstuvwxyz{}[]":, ',
    '😀🇲🇾日本語한국어مرحباÑé\u0000\ud83d"\\\n',
  ];
  const alphabet = Array.from(alphabets[Math.floor(random() * alphabets.length)]);
  let text = '';
  for (let index = 0; index < length; index++) text += alphabet[Math.floor(random() * alphabet.length)];
  return text;
}

describe('measureDecompressedLength', () => {
  it('returns the length lz-string decompresses to when given 1,500 random compressed texts', () => {
    const random = seededRandom(1);
    for (let index = 0; index < 1500; index++) {
      const text = randomText(random, Math.floor(random() * (random() < 0.1 ? 3000 : 200)) + 1);
      const compressed = LZString.compressToEncodedURIComponent(text);
      expect(LZString.decompressFromEncodedURIComponent(compressed)).toBe(text);
      expect(measureDecompressedLength(compressed, Infinity), `text #${index}`).toBe(text.length);
    }
  });

  it('returns the length lz-string decompresses to when given every golden link', () => {
    const states = [...generated.map(entry => entry.state), ...sharedLinks.map(link => link.state)];
    for (const state of states) {
      const text = LZString.decompressFromEncodedURIComponent(state);
      expect(text).toBeTruthy();
      expect(measureDecompressedLength(state, Infinity)).toBe(text!.length);
    }
  });

  it('returns the same length when spaces replace + or characters follow the end of the data', () => {
    const compressed = LZString.compressToEncodedURIComponent('{"r":[["S",["a+b"]]]} '.repeat(20));
    expect(compressed).toContain('+');
    const length = measureDecompressedLength(compressed, Infinity);
    expect(measureDecompressedLength(compressed.replace(/\+/g, ' '), Infinity)).toBe(length);
    for (const suffix of ['.', ')', '...', '%29', '!', ' ', 'é', '😀']) {
      expect(measureDecompressedLength(compressed + suffix, Infinity), suffix).toBe(length);
      expect(LZString.decompressFromEncodedURIComponent(compressed + suffix)!.length).toBe(length);
    }
  });

  it('returns the length of the lz-string output when it accepts a random input', () => {
    const random = seededRandom(2);
    const alphabet = `${URI_SAFE} .)%é`;
    let accepted = 0;
    for (let index = 0; index < 20000; index++) {
      let input = '';
      const length = 1 + Math.floor(random() * 40);
      for (let char = 0; char < length; char++) input += alphabet[Math.floor(random() * alphabet.length)];
      const measured = measureDecompressedLength(input, Infinity);
      if (measured === null) continue;
      accepted++;
      const text = LZString.decompressFromEncodedURIComponent(input);
      expect(typeof text, input).toBe('string');
      expect(text!.length, input).toBe(measured);
    }
    expect(accepted).toBeGreaterThan(100);
  });

  it('returns null when lz-string would return garbage, null or \'\' for the stream', () => {
    expect(measureDecompressedLength('', Infinity)).toBeNull();
    // First code 2: an empty stream. lz-string returns "".
    const empty = new LzBitWriter();
    empty.write(2, 2);
    expect(LZString.decompressFromEncodedURIComponent(empty.finish())).toBe('');
    expect(measureDecompressedLength(empty.finish(), Infinity)).toBeNull();
    // First code 3: not a character. lz-string writes "undefined" into its dictionary.
    const undefinedFirst = new LzBitWriter();
    undefinedFirst.write(3, 2);
    undefinedFirst.write(0, 3); // a literal...
    undefinedFirst.write(65, 8);
    undefinedFirst.write(2, 3);
    expect(measureDecompressedLength(undefinedFirst.finish(), Infinity)).toBeNull();
    // A code beyond the dictionary. lz-string returns null.
    const beyond = new LzBitWriter();
    beyond.write(0, 2);
    beyond.write(65, 8);
    beyond.write(6, 3);
    expect(LZString.decompressFromEncodedURIComponent(beyond.finish())).toBeNull();
    expect(measureDecompressedLength(beyond.finish(), Infinity)).toBeNull();
    // Cut off before the end code. lz-string returns "".
    const cut = LZString.compressToEncodedURIComponent('a long enough text to cut in half, really');
    expect(LZString.decompressFromEncodedURIComponent(cut.slice(0, 10))).toBe('');
    expect(measureDecompressedLength(cut.slice(0, 10), Infinity)).toBeNull();
  });

  it('returns null when the decompressed length is over the cap', () => {
    const compressed = LZString.compressToEncodedURIComponent('a'.repeat(1000));
    expect(measureDecompressedLength(compressed, 1000)).toBe(1000);
    expect(measureDecompressedLength(compressed, 999)).toBeNull();
    expect(measureDecompressedLength(LZString.compressToEncodedURIComponent('a'), 0)).toBeNull();
  });

  it('returns the lz-string length for a hand-written stream, and null when the stream has no end code', () => {
    const run = lzWithRun('{"pad":"{run}","wide":"日本"}', 'a', 5000);
    const text = '{"pad":"' + 'a'.repeat(5000) + '","wide":"日本"}';
    expect(run.outputLength).toBe(text.length);
    expect(LZString.decompressFromEncodedURIComponent(run.input)).toBe(text);
    expect(measureDecompressedLength(run.input, Infinity)).toBe(text.length);

    const writer = new LzStreamWriter();
    writer.text('abc');
    const cut = writer.finish(false);
    expect(measureDecompressedLength(cut, Infinity)).toBeNull();
  });

  it('returns the bomb\'s length, or null over the cap, within 5 s when the input expands to 5 billion characters', () => {
    const small = lzBomb(400);
    expect(LZString.decompressFromEncodedURIComponent(small.input)).toBe('a'.repeat(small.outputLength));
    expect(measureDecompressedLength(small.input, Infinity)).toBe(small.outputLength);

    // Under 400,000 characters of input that lz-string would expand to 5 billion characters.
    const big = lzBomb(100_000);
    expect(big.input.length).toBeLessThan(400_000);
    const started = performance.now();
    expect(measureDecompressedLength(big.input, Infinity)).toBe(big.outputLength);
    expect(measureDecompressedLength(big.input, 1_000_000)).toBeNull();
    expect(decompressFromEncodedURIComponentCapped(big.input, 1_000_000)).toBeNull();
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

describe('decompressFromEncodedURIComponentCapped', () => {
  it('returns the lz-string text when it fits the cap, also with spaces for + and a trailing dot', () => {
    const text = '{"t":"Ünïcödé 😀","r":[["S",[]]]}';
    const compressed = LZString.compressToEncodedURIComponent(text);
    expect(decompressFromEncodedURIComponentCapped(compressed, text.length)).toBe(text);
    expect(decompressFromEncodedURIComponentCapped(compressed.replace(/\+/g, ' ') + '.', text.length)).toBe(text);
  });

  it('returns null when the text is longer than the cap or the input is not lz-string', () => {
    const text = 'x'.repeat(50);
    expect(decompressFromEncodedURIComponentCapped(LZString.compressToEncodedURIComponent(text), 49)).toBeNull();
    expect(decompressFromEncodedURIComponentCapped('', 100)).toBeNull();
    expect(decompressFromEncodedURIComponentCapped('!!!!', 100)).toBeNull();
  });
});
