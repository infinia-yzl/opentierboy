/**
 * Data URLs for snapshot images: bytes to a `data:image/...;base64,` URL and back.
 *
 * Plain code: it uses `btoa` and `atob`, which browsers and Node 22 have, at call time only.
 */
import {sniffImageType} from '@/lib/images/imageType';
import {isAvifOrHeicDataUrl, rasterDataUrlType, type AvifHeicImageType, type SnapshotImageType} from './payload';

/** The snapshot image type of these bytes from their first bytes (PNG, JPEG, WebP or GIF), or null. */
export function snapshotImageTypeOf(bytes: Uint8Array): SnapshotImageType | null {
  const type = sniffImageType(bytes);
  return type === null || type === 'image/avif' ? null : type;
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

/**
 * The bytes and declared type of a snapshot image data URL, or null when it breaks the payload
 * rules. An AVIF or HEIC image (isAvifOrHeicDataUrl) comes back as it is, with the type it
 * declares, for the device store to refuse.
 */
export function imageBytesFromDataUrl(dataUrl: string): {type: SnapshotImageType | AvifHeicImageType; bytes: Uint8Array<ArrayBuffer>} | null {
  const type = rasterDataUrlType(dataUrl) ?? (isAvifOrHeicDataUrl(dataUrl) ? declaredType(dataUrl) : null);
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

/** The type a data URL declares (one of those the payload accepts: see DATA_URL in payload.ts). */
function declaredType(dataUrl: string): SnapshotImageType | AvifHeicImageType {
  return dataUrl.slice('data:'.length, dataUrl.indexOf(';')) as SnapshotImageType | AvifHeicImageType;
}
