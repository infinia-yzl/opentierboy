import {createHash} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {isDeviceImageId} from '@/lib/state/deviceId';
import {snapshotImageId} from '@/lib/snapshot/imageId';

const bytes = (text: string) => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('snapshotImageId', () => {
  it('is snap- plus a SHA-256 prefix in base64url, and a valid device image id', async () => {
    const id = await snapshotImageId(bytes('a picture'));
    const expected = createHash('sha256').update('a picture').digest('base64url').slice(0, 22);
    expect(id).toBe(`snap-${expected}`);
    expect(isDeviceImageId(id)).toBe(true);
  });

  it('gives the same picture the same id and another picture another id', async () => {
    expect(await snapshotImageId(bytes('one'))).toBe(await snapshotImageId(bytes('one')));
    expect(await snapshotImageId(bytes('one'))).not.toBe(await snapshotImageId(bytes('two')));
  });

  it('works without Web Crypto (plain http pages), with stable valid ids', async () => {
    vi.stubGlobal('crypto', undefined);
    const id = await snapshotImageId(bytes('one'));
    expect(isDeviceImageId(id)).toBe(true);
    expect(id).toMatch(/^snap-[A-Za-z0-9_-]{21,22}$/);
    expect(await snapshotImageId(bytes('one'))).toBe(id);
    expect(await snapshotImageId(bytes('two'))).not.toBe(id);
    expect(await snapshotImageId(new Uint8Array() as Uint8Array<ArrayBuffer>)).toMatch(/^snap-/);
  });
});
