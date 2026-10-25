/**
 * The width and height an image file declares in its header, read without decoding the image.
 * Snapshot images are refused when they declare more than the payload allows, so a tiny file
 * that would decode to a huge picture (an image bomb) never reaches the browser's decoder.
 *
 * Covers the snapshot image types: PNG (IHDR), GIF (logical screen), WebP (VP8, VP8L, VP8X) and
 * JPEG (the first SOF segment). Plain code: no imports, no browser APIs.
 */

export interface ImageSize {
  width: number;
  height: number;
}

/** How many bytes of a JPEG file are searched for its size. Canvas and camera JPEGs have it early. */
export const JPEG_SIZE_SEARCH_BYTES = 64 * 1024;

const be16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const le16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const le24 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const be32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const ascii = (b: Uint8Array, at: number, length: number) => String.fromCharCode(...b.subarray(at, at + length));

function sized(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? {width, height} : null;
}

function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') return null;
  return sized(be32(b, 16), be32(b, 20));
}

function gifSize(b: Uint8Array): ImageSize | null {
  return b.length < 10 ? null : sized(le16(b, 6), le16(b, 8));
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 16) return null;
  switch (ascii(b, 12, 4)) {
    case 'VP8 ':
      // Frame tag (3 bytes), start code 9d 01 2a, then 14-bit width and height.
      if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
      return sized(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff);
    case 'VP8L': {
      // Signature 0x2f, then 14-bit width - 1 and height - 1.
      if (b.length < 25 || b[20] !== 0x2f) return null;
      const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      return sized((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    case 'VP8X':
      // Flags and reserved bytes, then 24-bit canvas width - 1 and height - 1.
      return b.length < 30 ? null : sized(le24(b, 24) + 1, le24(b, 27) + 1);
    default:
      return null;
  }
}

/** SOF markers: baseline, progressive, lossless and arithmetic variants (not DHT, JPG or DAC). */
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function jpegSize(b: Uint8Array): ImageSize | null {
  const end = Math.min(b.length, JPEG_SIZE_SEARCH_BYTES);
  let at = 2;
  while (at + 4 <= end) {
    if (b[at] !== 0xff) return null;
    const marker = b[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2; // markers without a length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image, or image data before any size
    const length = be16(b, at + 2);
    if (length < 2) return null;
    if (JPEG_SOF.has(marker)) {
      if (at + 9 > end) return null;
      return sized(be16(b, at + 7), be16(b, at + 5));
    }
    at += 2 + length;
  }
  return null;
}

/** The declared size of a PNG, GIF, WebP or JPEG file from its first bytes, or null when unreadable. */
export function declaredImageSize(bytes: Uint8Array): ImageSize | null {
  switch (snapshotImageTypeOf(bytes)) {
    case 'image/png':
      return pngSize(bytes);
    case 'image/gif':
      return gifSize(bytes);
    case 'image/webp':
      return webpSize(bytes);
    case 'image/jpeg':
      return jpegSize(bytes);
    default:
      return null;
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The snapshot image type of these bytes from their first bytes, or null. */
export function snapshotImageTypeOf(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 8 && PNG_SIGNATURE.every((value, i) => bytes[i] === value)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && (text(0, 6) === 'GIF87a' || text(0, 6) === 'GIF89a')) return 'image/gif';
  if (bytes.length >= 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

