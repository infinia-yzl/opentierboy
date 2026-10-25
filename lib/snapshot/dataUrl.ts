/**
 * Data URLs for snapshot images: bytes to a `data:image/...;base64,` URL and back.
 *
 * Plain code: it uses `btoa` and `atob`, which browsers and Node 22 have, at call time only.
 */
import {snapshotImageTypeOf} from './imageSize';
import {rasterDataUrlType, type SnapshotImageType} from './payload';

export {snapshotImageTypeOf};

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
