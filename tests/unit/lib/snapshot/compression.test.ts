import zlib from 'node:zlib';
import {describe, expect, it} from 'vitest';
import {deflate, inflateCapped} from '@/lib/snapshot/compression';
import {randomBytes} from '../../support/random-bytes';

/** Compares bytes with Buffer.compare: a deep toEqual on large typed arrays takes seconds. */
function expectBytes(result: Awaited<ReturnType<typeof inflateCapped>>, expected: Uint8Array) {
  expect(result.ok).toBe(true);
  if (result.ok) expect(Buffer.compare(result.bytes, expected)).toBe(0);
}

describe('deflate and inflateCapped', () => {
  it('returns bytes that round-trip with node:zlib when deflate or inflateCapped gets Unicode text', async () => {
    const text = new TextEncoder().encode('Ünïcödé ✨ '.repeat(1000));
    const compressed = await deflate(text);
    expect(compressed.ok).toBe(true);
    if (!compressed.ok) return;
    expect(Buffer.compare(zlib.inflateSync(compressed.bytes), text)).toBe(0);

    const fromNode = new Uint8Array(zlib.deflateSync(text, {level: 9}));
    expectBytes(await inflateCapped(fromNode, text.length), text);
  });

  it('returns the original bytes when the inflated output spans many input slices', async () => {
    const bytes = randomBytes(300_000);
    const compressed = new Uint8Array(zlib.deflateSync(bytes));
    expect(compressed.length).toBeGreaterThan(290_000);
    expectBytes(await inflateCapped(compressed, bytes.length), bytes);
  });

  it('returns ok when the output is exactly the cap, and reason \'too-large\' when it is one byte over', async () => {
    const compressed = new Uint8Array(zlib.deflateSync(Buffer.alloc(100_000, 7)));
    expect((await inflateCapped(compressed, 100_000)).ok).toBe(true);
    expect(await inflateCapped(compressed, 99_999)).toEqual({ok: false, reason: 'too-large'});
  });

  it('returns reason \'bad-data\' when the input is not a complete zlib stream', async () => {
    const good = new Uint8Array(zlib.deflateSync('hello'));
    for (const bad of [new Uint8Array(), good.subarray(0, 3), new Uint8Array(zlib.deflateRawSync('hello')), Uint8Array.from([...good, 0])]) {
      expect(await inflateCapped(bad, 1000)).toEqual({ok: false, reason: 'bad-data'});
    }
  });
});
