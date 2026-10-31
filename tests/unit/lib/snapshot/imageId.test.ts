import {createHash} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {isDeviceImageId} from '@/lib/state/deviceId';
import {snapshotImageId} from '@/lib/snapshot/imageId';

const bytes = (text: string) => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('snapshotImageId', () => {
  it('returns snap- plus a 22-character base64url SHA-256 prefix, a valid device image id, when given bytes', async () => {
    const id = await snapshotImageId(bytes('a picture'));
    const expected = createHash('sha256').update('a picture').digest('base64url').slice(0, 22);
    expect(id).toBe(`snap-${expected}`);
    expect(isDeviceImageId(id)).toBe(true);
  });

  it('returns equal ids when the bytes are equal, and different ids when they differ', async () => {
    expect(await snapshotImageId(bytes('one'))).toBe(await snapshotImageId(bytes('one')));
    expect(await snapshotImageId(bytes('one'))).not.toBe(await snapshotImageId(bytes('two')));
  });

  it('returns stable, valid snap- ids when Web Crypto is missing (plain http pages)', async () => {
    vi.stubGlobal('crypto', undefined);
    const id = await snapshotImageId(bytes('one'));
    expect(isDeviceImageId(id)).toBe(true);
    expect(id).toMatch(/^snap-[A-Za-z0-9_-]{21,22}$/);
    expect(await snapshotImageId(bytes('one'))).toBe(id);
    expect(await snapshotImageId(bytes('two'))).not.toBe(id);
    expect(await snapshotImageId(new Uint8Array() as Uint8Array<ArrayBuffer>)).toMatch(/^snap-/);
  });
});
