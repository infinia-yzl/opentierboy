import {describe, expect, it} from 'vitest';
import {sha256Hex} from '@/lib/templates/checksum';

describe('sha256Hex', () => {
  it('returns the known SHA-256 values in lowercase hex when the input is empty or "test"', async () => {
    expect(await sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await sha256Hex(new TextEncoder().encode('test'))).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });

  it('returns another value when one byte of the input differs', async () => {
    expect(await sha256Hex(new Uint8Array([1, 2, 3]))).not.toBe(await sha256Hex(new Uint8Array([1, 2, 4])));
  });
});
