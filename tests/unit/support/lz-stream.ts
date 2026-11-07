/**
 * Writes lz-string streams (compressToEncodedURIComponent form) code by code, so tests can
 * build exact, huge or broken streams cheaply. Compressing a million characters with
 * lz-string itself takes seconds; writing the same stream here takes milliseconds.
 *
 * Bits are packed as lz-string packs them: each value least significant bit first, 6 bits
 * per character, first bit on top. The dictionary bookkeeping follows lz-string's
 * `_decompress`, so the decoder reads exactly what the writer meant.
 */

const URI_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';

export class LzBitWriter {
  private chars: string[] = [];
  private value = 0;
  private position = 0;

  write(value: number, bits: number): void {
    for (let bit = 0; bit < bits; bit++) {
      this.value = (this.value << 1) | (value & 1);
      value = Math.floor(value / 2);
      if (this.position === 5) {
        this.chars.push(URI_SAFE[this.value]);
        this.value = 0;
        this.position = 0;
      } else {
        this.position++;
      }
    }
  }

  finish(): string {
    for (;;) {
      this.value <<= 1;
      if (this.position === 5) {
        this.chars.push(URI_SAFE[this.value]);
        return this.chars.join('');
      }
      this.position++;
    }
  }
}

export class LzStreamWriter {
  private readonly bits = new LzBitWriter();
  private started = false;
  private dictSize = 4;
  private enlargeIn = 4;
  private numBits = 3;
  /** Length of the text written so far. */
  length = 0;
  /** Length of the last entry written (lz-string's `w`). */
  private previousLength = 0;

  /** Writes one character as a literal. Returns the dictionary code of that literal. */
  literal(char: string): number {
    const code = char.charCodeAt(0);
    const wide = code > 255;
    if (!this.started) {
      this.started = true;
      this.bits.write(wide ? 1 : 0, 2);
      this.bits.write(code, wide ? 16 : 8);
      this.length = 1;
      this.previousLength = 1;
      return 3;
    }
    this.bits.write(wide ? 1 : 0, this.numBits);
    this.bits.write(code, wide ? 16 : 8);
    const literalCode = this.dictSize++;
    this.enlargeIn--;
    this.grow();
    this.addEntry(1);
    return literalCode;
  }

  /** Writes text as literals, one per UTF-16 code unit. */
  text(text: string): void {
    for (let index = 0; index < text.length; index++) this.literal(text[index]);
  }

  /** Writes a reference to an existing dictionary entry of the given length. */
  ref(code: number, entryLength: number): void {
    this.bits.write(code, this.numBits);
    this.grow();
    this.addEntry(entryLength);
  }

  /** Repeats the last entry plus its first character: the code that is about to be added. */
  repeatPrevious(): void {
    this.ref(this.dictSize, this.previousLength + 1);
  }

  /** Writes `count` copies of one character, mostly with growing repeats (few codes). */
  run(char: string, count: number): void {
    if (count <= 0) return;
    const single = this.literal(char);
    let written = 1;
    while (written + this.previousLength + 1 <= count) {
      written += this.previousLength + 1;
      this.repeatPrevious();
    }
    while (written < count) {
      this.ref(single, 1);
      written++;
    }
  }

  /** Writes the end code (unless `withEnd` is false) and returns the stream. */
  finish(withEnd = true): string {
    if (withEnd) this.bits.write(2, this.numBits);
    return this.bits.finish();
  }

  private addEntry(entryLength: number): void {
    this.length += entryLength;
    this.dictSize++;
    this.enlargeIn--;
    this.previousLength = entryLength;
    this.grow();
  }

  private grow(): void {
    if (this.enlargeIn === 0) {
      this.enlargeIn = 2 ** this.numBits;
      this.numBits++;
    }
  }
}

/**
 * A decompression bomb: 'a', then `codes` codes that each repeat the previous entry plus one
 * character. The output is 1 + 2 + ... + (codes + 1) characters: it grows with the square of
 * the input length.
 */
export function lzBomb(codes: number): {input: string; outputLength: number} {
  const writer = new LzStreamWriter();
  writer.literal('a');
  for (let index = 0; index < codes; index++) writer.repeatPrevious();
  return {input: writer.finish(), outputLength: writer.length};
}

/** An lz-string stream of `text` with a run of `count` copies of `char` in place of `{run}`. */
export function lzWithRun(text: string, char: string, count: number): {input: string; outputLength: number} {
  const [head, tail] = text.split('{run}');
  const writer = new LzStreamWriter();
  writer.text(head);
  writer.run(char, count);
  writer.text(tail ?? '');
  return {input: writer.finish(), outputLength: writer.length};
}
