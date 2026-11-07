/**
 * Content-addressed ids for images that come from snapshot files: the same picture always
 * gets the same id, so opening the same file again stores nothing new and gives the same link.
 *
 * Plain code. It uses the Web Crypto API (`crypto.subtle`) at call time. Browsers offer it only
 * on secure pages (https and localhost); elsewhere a small non-cryptographic 128-bit hash takes
 * its place. A collision cannot show a wrong picture: the caller compares the bytes of an image
 * already stored under the id, and stores a different picture under a new random id.
 */

export const SNAPSHOT_IMAGE_ID_PREFIX = 'snap-';
/** 22 base64url characters: 132 bits of the hash. With the prefix the id fits isDeviceImageId. */
const HASH_CHARS = 22;

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** cyrb128: four 32-bit lanes of a simple multiply-rotate hash. Used only without Web Crypto. */
function fallbackHash(bytes: Uint8Array): Uint8Array {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (const byte of bytes) {
    h1 = h2 ^ Math.imul(h1 ^ byte, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ byte, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ byte, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ byte, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  [h1, h2, h3, h4].forEach((lane, index) => view.setUint32(index * 4, lane >>> 0));
  return out;
}

/** `snap-` plus the first 22 base64url characters of the SHA-256 of the bytes. */
export async function snapshotImageId(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  let hash: Uint8Array;
  try {
    const subtle = globalThis.crypto?.subtle;
    hash = subtle ? new Uint8Array(await subtle.digest('SHA-256', bytes)) : fallbackHash(bytes);
  } catch {
    hash = fallbackHash(bytes);
  }
  return SNAPSHOT_IMAGE_ID_PREFIX + base64url(hash).slice(0, HASH_CHARS);
}
