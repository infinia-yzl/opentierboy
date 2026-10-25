/**
 * Minimal image headers that declare a size, for tests of the size check. They are not
 * decodable pictures: the snapshot code reads only the header.
 */

const u8 = (...parts: (number[] | string | Uint8Array)[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? Array.from(part, (c) => c.charCodeAt(0)) : Array.from(part))));
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

export function pngHeader(width: number, height: number): Uint8Array {
  return u8([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(width), be32(height), [8, 6, 0, 0, 0], [0, 0, 0, 0]);
}

export function gifHeader(width: number, height: number): Uint8Array {
  return u8('GIF89a', le16(width), le16(height), [0x80, 0, 0], [0, 0, 0]);
}

/** A JPEG with `paddingBytes` of APP1 segments before its SOF (`sof`: 0xc0 baseline, 0xc2 progressive). */
export function jpegHeader(width: number, height: number, {paddingBytes = 0, sof = 0xc0} = {}): Uint8Array {
  const app0 = u8([0xff, 0xe0], be16(16), 'JFIF', [0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const segments: Uint8Array[] = [];
  for (let left = paddingBytes; left > 0;) {
    const size = Math.min(left, 65_000);
    segments.push(u8([0xff, 0xe1], be16(size + 2), new Uint8Array(size)));
    left -= size;
  }
  const frame = u8([0xff, sof], be16(17), [8], be16(height), be16(width), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return u8([0xff, 0xd8], app0, ...segments, frame, [0xff, 0xd9]);
}

export function webpHeader(width: number, height: number, kind: 'VP8 ' | 'VP8L' | 'VP8X' = 'VP8X'): Uint8Array {
  let chunk: Uint8Array;
  if (kind === 'VP8X') chunk = u8('VP8X', le32(10), [0, 0, 0, 0], le24(width - 1), le24(height - 1));
  else if (kind === 'VP8L') {
    const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
    chunk = u8('VP8L', le32(5), [0x2f], le32(bits >>> 0), [0, 0, 0]);
  } else chunk = u8('VP8 ', le32(10), [0x50, 0x01, 0x00], [0x9d, 0x01, 0x2a], le16(width), le16(height));
  return u8('RIFF', le32(4 + chunk.length), 'WEBP', chunk);
}

export function dataUrlOf(type: string, bytes: Uint8Array): string {
  return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
}
