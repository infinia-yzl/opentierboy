/**
 * Image types by their first bytes. Pure code: the device image store and the OG preview
 * route (edge runtime) both use it, and neither trusts the type a file or a server reports.
 */

/** Raster image types the app keeps or draws. SVG is never one of them. */
export const RASTER_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'] as const;
export type RasterImageType = (typeof RASTER_IMAGE_TYPES)[number];

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);
const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...Array.from(bytes.subarray(start, start + length)));

/** The image type of a file from its first bytes, or null. Needs at least the first 32 bytes. */
export function sniffImageType(bytes: Uint8Array): RasterImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) return 'image/gif';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  // AVIF: an ISO BMFF "ftyp" box whose major or compatible brands include avif or avis.
  if (bytes.length >= 16 && ascii(bytes, 4, 4) === 'ftyp') {
    const boxSize = ((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
    const end = Math.min(boxSize, bytes.length, 64);
    for (let offset = 8; offset + 4 <= end; offset += 4) {
      if (offset === 12) continue; // bytes 12-15 hold the minor version
      const brand = ascii(bytes, offset, 4);
      if (brand === 'avif' || brand === 'avis') return 'image/avif';
    }
  }
  return null;
}

const uint32BE = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
const uint16BE = (bytes: Uint8Array, offset: number) => (bytes[offset] << 8) | bytes[offset + 1];
const uint16LE = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const uint24LE = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

/**
 * A GIF's size: its logical screen, enlarged to its first frame where that frame reaches
 * further (Chrome shows such a GIF at the frame's size). Null when the bytes end, or are
 * damaged, before the first frame's image descriptor.
 */
function readGifSize(bytes: Uint8Array): {width: number; height: number} | null {
  if (bytes.length < 13) return null;
  let width = uint16LE(bytes, 6);
  let height = uint16LE(bytes, 8);
  const flags = bytes[10];
  // The global colour table follows the logical screen descriptor when its flag is set.
  let offset = 13 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0);
  while (offset < bytes.length) {
    const block = bytes[offset];
    if (block === 0x2c) {
      // Image descriptor: left, top, width, height (little-endian), then flags.
      if (offset + 9 > bytes.length) return null;
      width = Math.max(width, uint16LE(bytes, offset + 1) + uint16LE(bytes, offset + 5));
      height = Math.max(height, uint16LE(bytes, offset + 3) + uint16LE(bytes, offset + 7));
      return {width, height};
    }
    if (block !== 0x21) return null; // the trailer (0x3b) or damage: no frame
    // Extension: introducer, label, then data sub-blocks until a zero-length one.
    offset += 2;
    while (offset < bytes.length && bytes[offset] !== 0) offset += bytes[offset] + 1;
    offset += 1;
  }
  return null;
}

/**
 * True for an ISO base media file (AVIF, HEIC, HEIF): an "ftyp" box comes first. The size such
 * an image declares (its "ispe" box) can differ from the size of its coded picture, which only
 * an AV1 or HEVC parser could read, so the editor does not take these files.
 */
export function isIsoMediaFile(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && ascii(bytes, 4, 4) === 'ftyp';
}

/**
 * The width and height that a PNG, GIF, WebP or JPEG file declares in its header, without
 * decoding it, or null when the header does not say (damaged or cut-off files, and AVIF, whose
 * declared size can lie: see isIsoMediaFile). A file
 * can declare a huge size in a few bytes (a "decompression bomb"), so the size is checked
 * before anything decodes it. Reads the first bytes only; JPEG needs the bytes up to its frame
 * header, which follows the metadata.
 */
export function readImageSize(bytes: Uint8Array): {width: number; height: number} | null {
  const type = sniffImageType(bytes);
  if (type === 'image/png') {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null;
    return {width: uint32BE(bytes, 16), height: uint32BE(bytes, 20)};
  }
  if (type === 'image/gif') return readGifSize(bytes);
  if (type === 'image/webp') {
    const chunk = bytes.length >= 16 ? ascii(bytes, 12, 4) : '';
    if (chunk === 'VP8 ' && bytes.length >= 30) {
      return {width: uint16LE(bytes, 26) & 0x3fff, height: uint16LE(bytes, 28) & 0x3fff};
    }
    if (chunk === 'VP8L' && bytes.length >= 25) {
      const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
      return {width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1};
    }
    if (chunk === 'VP8X' && bytes.length >= 30) {
      return {width: uint24LE(bytes, 24) + 1, height: uint24LE(bytes, 27) + 1};
    }
    return null;
  }
  if (type === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset++;
        continue;
      }
      // Markers without a length: TEM and RST0-RST7.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      // Start of frame (SOF0-SOF15, except DHT, JPG and DAC) holds the size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return {width: uint16BE(bytes, offset + 7), height: uint16BE(bytes, offset + 5)};
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      offset += 2 + uint16BE(bytes, offset + 2);
    }
    return null;
  }
  return null;
}
