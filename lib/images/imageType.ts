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
