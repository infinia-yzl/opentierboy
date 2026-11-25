import LZString from 'lz-string';

/**
 * lz-string decompression with a cap on the output length, checked before decompressing.
 *
 * lz-string builds its whole output before it returns, and a short input can expand to a
 * huge output: each code can repeat everything decoded so far, so the output can grow with
 * the square of the input length. A 12 KB link can expand to 10 MB of JSON (A29), and longer
 * inputs to far more. measureDecompressedLength walks the input once and counts the output
 * length without building any text. Only an input that fits the cap goes to lz-string, so
 * the decompressed text itself always comes from lz-string 1.5.0.
 *
 * The walk follows lz-string's `_decompress` (node_modules/lz-string/libs/lz-string.js, MIT
 * licence) as called by `decompressFromEncodedURIComponent`: 6 bits per character, a space
 * reads as '+', a character outside the alphabet reads as 0, reading past the end reads 0,
 * and characters after the end-of-data code are ignored (so a link with a stray '.' or ')'
 * at the end still decodes). tests/unit/lib/state/lz.test.ts checks the measured length against
 * lz-string's output for random inputs.
 *
 * The walk is stricter than lz-string where lz-string returns garbage: it rejects a stream
 * whose first code is not a character (lz-string would write the text "undefined" into its
 * dictionary, or throw), a code beyond the dictionary (lz-string returns null) and a stream
 * without an end code (lz-string returns ""). lz-string's own encoder never writes these.
 */

const URI_SAFE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';

/** 6-bit value of each ASCII character code; 0 for characters outside the alphabet. */
const CHAR_VALUES: Uint8Array = (() => {
  const values = new Uint8Array(128);
  for (let index = 0; index < URI_SAFE_ALPHABET.length; index++) {
    values[URI_SAFE_ALPHABET.charCodeAt(index)] = index;
  }
  // decompressFromEncodedURIComponent turns every ' ' into '+' first.
  values[' '.charCodeAt(0)] = URI_SAFE_ALPHABET.indexOf('+');
  return values;
})();

const BITS_PER_CHARACTER_RESET = 32; // lz-string's resetValue for the URI-safe alphabet

/**
 * The length of `decompressFromEncodedURIComponent(input)`, or null when the input is not a
 * complete lz-string stream or the output would be longer than `maxLength`.
 * Runs in time linear in the input and memory linear in `maxLength`.
 */
export function measureDecompressedLength(input: string, maxLength: number): number | null {
  const length = input.length;
  if (length === 0) return null;

  const valueAt = (index: number): number => {
    if (index >= length) return 0;
    const code = input.charCodeAt(index);
    return code < 128 ? CHAR_VALUES[code] : 0;
  };

  let value = valueAt(0);
  let position = BITS_PER_CHARACTER_RESET;
  let nextIndex = 1;

  const readBits = (count: number): number => {
    let bits = 0;
    for (let bit = 0; bit < count; bit++) {
      const set = value & position;
      position >>= 1;
      if (position === 0) {
        position = BITS_PER_CHARACTER_RESET;
        value = valueAt(nextIndex++);
      }
      if (set > 0) bits += 2 ** bit;
    }
    return bits;
  };

  // The stream starts with one character: code 0 (8-bit) or 1 (16-bit).
  const first = readBits(2);
  if (first !== 0 && first !== 1) return null;
  readBits(first === 0 ? 8 : 16);

  // entryLengths[code] is the length of dictionary entry `code`. Codes 0-2 are control codes.
  const entryLengths: number[] = [0, 0, 0, 1];
  let dictSize = 4;
  let enlargeIn = 4;
  let numBits = 3;
  let previousLength = 1;
  let total = 1;
  if (total > maxLength) return null;

  for (;;) {
    if (nextIndex > length) return null; // ran out of input before the end code

    let code = readBits(numBits);
    if (code === 0 || code === 1) {
      readBits(code === 0 ? 8 : 16);
      entryLengths[dictSize++] = 1;
      code = dictSize - 1;
      enlargeIn--;
    } else if (code === 2) {
      return total;
    }

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }

    let entryLength: number;
    if (code < dictSize) entryLength = entryLengths[code];
    else if (code === dictSize) entryLength = previousLength + 1;
    else return null; // a code beyond the dictionary

    total += entryLength;
    if (total > maxLength) return null;

    entryLengths[dictSize++] = previousLength + 1;
    enlargeIn--;
    previousLength = entryLength;

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  }
}

/**
 * `LZString.decompressFromEncodedURIComponent(input)`, or null when the input is not a
 * complete stream or its output would be longer than `maxLength` characters. Never throws.
 */
export function decompressFromEncodedURIComponentCapped(input: string, maxLength: number): string | null {
  const expectedLength = measureDecompressedLength(input, maxLength);
  if (expectedLength === null) return null;
  try {
    const text = LZString.decompressFromEncodedURIComponent(input);
    return typeof text === 'string' && text.length <= maxLength ? text : null;
  } catch {
    return null;
  }
}
