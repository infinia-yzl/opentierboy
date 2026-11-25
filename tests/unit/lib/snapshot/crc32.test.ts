import zlib from 'node:zlib';
import {describe, expect, it} from 'vitest';
import {crc32} from '@/lib/snapshot/crc32';
import {randomBytes} from '../../support/random-bytes';

describe('crc32', () => {
  it('returns the node:zlib CRC-32 when given a whole buffer or a range', () => {
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
    for (const length of [1, 7, 256, 10_000]) {
      const bytes = randomBytes(length, length);
      expect(crc32(bytes)).toBe(zlib.crc32(bytes));
      expect(crc32(bytes, 1, length - 1)).toBe(zlib.crc32(bytes.subarray(1, length - 1)));
    }
  });
});
