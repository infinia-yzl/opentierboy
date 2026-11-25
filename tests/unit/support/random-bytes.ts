/** Deterministic noise (xorshift32), which does not compress. */
export function randomBytes(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}
