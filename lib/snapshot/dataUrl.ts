/**
 * Data URLs for snapshot images: bytes to a `data:image/...;base64,` URL and back.
 *
 * Plain code: it uses `btoa` and `atob`, which browsers and Node 22 have, at call time only.
 */
import {rasterDataUrlType, type SnapshotImageType} from './payload';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The snapshot image type of these bytes from their first bytes, or null. */
export function snapshotImageTypeOf(bytes: Uint8Array): SnapshotImageType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 8 && PNG.every((value, i) => bytes[i] === value)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** A data URL of a PNG, JPEG, WebP or GIF picture, typed by its first bytes. Null for any other bytes. */
export function dataUrlFromImageBytes(bytes: Uint8Array): string | null {
  const type = snapshotImageTypeOf(bytes);
  if (!type) return null;
  let binary = '';
  const step = 0x8000;
  for (let at = 0; at < bytes.length; at += step) {
    binary += String.fromCharCode(...bytes.subarray(at, at + step));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

/** The bytes and type of a snapshot image data URL, or null when it breaks the payload rules. */
export function imageBytesFromDataUrl(dataUrl: string): {type: SnapshotImageType; bytes: Uint8Array<ArrayBuffer>} | null {
  const type = rasterDataUrlType(dataUrl);
  if (!type) return null;
  try {
    const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return {type, bytes};
  } catch {
    return null;
  }
}
