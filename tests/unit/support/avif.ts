/**
 * Hand-made AVIF files for tests: the attack the 5d review found. The "ispe" box says one size
 * and the AV1 sequence header (in "av1C" and in the item data) says another, much larger one.
 */

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const u32 = (value: number) => [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];

/** An ISO BMFF box: size, type, payload. */
function box(type: string, payload: number[]): number[] {
  return [...u32(8 + payload.length), ...ascii(type), ...payload];
}

/** A full box: a box with version and flags before its payload. */
const fullBox = (type: string, payload: number[]) => box(type, [0, 0, 0, 0, ...payload]);

/**
 * An AV1 sequence header OBU for a still picture (reduced header), 16 bits for each side:
 * seq_profile 0, still_picture 1, reduced_still_picture_header 1, seq_level_idx 0, then the
 * frame width and height bits and the largest frame size.
 */
export function av1SequenceHeader(width: number, height: number): number[] {
  const bits: number[] = [];
  const put = (value: number, count: number) => {
    for (let bit = count - 1; bit >= 0; bit--) bits.push((value >>> bit) & 1);
  };
  put(0, 3);
  put(1, 1);
  put(1, 1);
  put(0, 5);
  put(15, 4);
  put(15, 4);
  put(width - 1, 16);
  put(height - 1, 16);
  while (bits.length % 8 !== 0) bits.push(0);
  const payload: number[] = [];
  for (let index = 0; index < bits.length; index += 8) payload.push(bits.slice(index, index + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  // OBU header: type 1 (sequence header), with a size field.
  return [0x0a, payload.length, ...payload];
}

/** An AVIF whose "ispe" says `declared` while its AV1 data says `coded`. */
export function avifWithFalseSize(declared: [number, number], coded: [number, number]): Uint8Array<ArrayBuffer> {
  const sequenceHeader = av1SequenceHeader(...coded);
  const av1C = box('av1C', [0x81, 0x20, 0x02, 0x00, ...sequenceHeader]);
  const ispe = fullBox('ispe', [...u32(declared[0]), ...u32(declared[1])]);
  const meta = fullBox('meta', [
    ...fullBox('hdlr', [0, 0, 0, 0, ...ascii('pict'), ...new Array(12).fill(0), 0]),
    ...fullBox('pitm', [0, 1]),
    ...box('iprp', [...box('ipco', [...av1C, ...ispe]), ...fullBox('ipma', [0, 0, 0, 1, 0, 1, 2, 0x81, 0x82])]),
  ]);
  return new Uint8Array([
    ...box('ftyp', [...ascii('avif'), 0, 0, 0, 0, ...ascii('mif1avifmiaf')]),
    ...meta,
    // The item data: a temporal delimiter, the sequence header, and no real frame.
    ...box('mdat', [0x12, 0x00, ...sequenceHeader, ...new Array(64).fill(0)]),
  ]);
}

/** A HEIC file's start: an "ftyp" box with the heic brand, then nothing useful. */
export function heicStart(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([...box('ftyp', [...ascii('heic'), 0, 0, 0, 0, ...ascii('mif1heic')]), ...new Array(64).fill(0)]);
}
