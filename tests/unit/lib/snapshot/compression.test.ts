import zlib from 'node:zlib';
import {describe, expect, it} from 'vitest';
import {deflate, inflateCapped} from '@/lib/snapshot/compression';
import {crc32} from '@/lib/snapshot/crc32';

/** Deterministic noise (xorshift32), which does not compress. */
function randomBytes(length: number, seed = 1): Uint8Array {
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

/** Compares bytes with Buffer.compare: a deep toEqual on large typed arrays takes seconds. */
function expectBytes(result: Awaited<ReturnType<typeof inflateCapped>>, expected: Uint8Array) {
  expect(result.ok).toBe(true);
  if (result.ok) expect(Buffer.compare(result.bytes, expected)).toBe(0);
}

describe('crc32', () => {
  it('matches node:zlib on whole buffers and on ranges', () => {
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
    for (const length of [1, 7, 256, 10_000]) {
      const bytes = randomBytes(length, length);
      expect(crc32(bytes)).toBe(zlib.crc32(bytes));
      expect(crc32(bytes, 1, length - 1)).toBe(zlib.crc32(bytes.subarray(1, length - 1)));
    }
  });
});

describe('deflate and inflateCapped', () => {
  it('writes zlib data that node:zlib reads, and reads zlib data that node:zlib writes', async () => {
    const text = new TextEncoder().encode('Ünïcödé ✨ '.repeat(1000));
    const compressed = await deflate(text);
    expect(compressed.ok).toBe(true);
    if (!compressed.ok) return;
    expect(Buffer.compare(zlib.inflateSync(compressed.bytes), text)).toBe(0);

    const fromNode = new Uint8Array(zlib.deflateSync(text, {level: 9}));
    expectBytes(await inflateCapped(fromNode, text.length), text);
  });

  it('reads output that spans many input slices', async () => {
    const bytes = randomBytes(300_000);
    const compressed = new Uint8Array(zlib.deflateSync(bytes));
    expect(compressed.length).toBeGreaterThan(290_000);
    expectBytes(await inflateCapped(compressed, bytes.length), bytes);
  });

  it('accepts output exactly at the cap and refuses one byte more', async () => {
    const compressed = new Uint8Array(zlib.deflateSync(Buffer.alloc(100_000, 7)));
    expect((await inflateCapped(compressed, 100_000)).ok).toBe(true);
    expect(await inflateCapped(compressed, 99_999)).toEqual({ok: false, reason: 'too-large'});
  });

  it('refuses data that is not a complete zlib stream', async () => {
    const good = new Uint8Array(zlib.deflateSync('hello'));
    for (const bad of [new Uint8Array(), good.subarray(0, 3), new Uint8Array(zlib.deflateRawSync('hello')), Uint8Array.from([...good, 0])]) {
      expect(await inflateCapped(bad, 1000)).toEqual({ok: false, reason: 'bad-data'});
    }
  });
});
