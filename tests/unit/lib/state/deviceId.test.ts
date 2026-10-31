import {describe, expect, it} from 'vitest';
import {deviceImageIdForUpload, isDeviceImageId, LEGACY_UPLOAD_ID_PREFIX} from '@/lib/state';

/**
 * The one device image id rule (A40). The cases below are those of
 * tests/unit/lib/images/deviceStore.test.ts on revamp/5c-custom-images ("accepts 8 to 64
 * URL-safe characters as an id"), plus every Object.prototype member name.
 */
describe('isDeviceImageId', () => {
  it('returns true only when the value is a string of 8 to 64 URL-safe characters', () => {
    for (const id of ['abcdefgh', 'A-_09zZx', 'a'.repeat(64)]) expect(isDeviceImageId(id), id).toBe(true);
    for (const id of ['', 'abcdefg', 'a'.repeat(65), 'abcd efgh', 'abcd/efgh', 'abcd.efgh', 'blob:https://x', '__proto__', 'constructor', 'hasOwnProperty', 42, null, undefined, ['abcdefgh']]) {
      expect(isDeviceImageId(id), String(id)).toBe(false);
    }
  });

  it('returns true when the id is a 16-character store id or a 9-character legacy upload id', () => {
    // deviceStore.createDeviceImageId: 16 URL-safe base64 characters.
    for (const id of ['AAAAAAAAAAAAAAAA', '________________', 'Zm9vYmFyYmF6cXV4']) expect(isDeviceImageId(id), id).toBe(true);
    // ItemCreator before Phase 5c: Math.random().toString(36).slice(2, 11), usually 9 characters.
    expect(isDeviceImageId('k3j9x0a1b')).toBe(true);
    expect(isDeviceImageId('k3j9x0a')).toBe(false);
  });

  it('returns false when the id is the name of any Object.prototype member', () => {
    const names = Object.getOwnPropertyNames(Object.prototype);
    expect(names).toContain('__proto__');
    for (const name of names) expect(isDeviceImageId(name), name).toBe(false);
    expect(isDeviceImageId('toString')).toBe(false);
    expect(isDeviceImageId('__defineGetter__')).toBe(false);
    expect(isDeviceImageId('toStringX')).toBe(true);
  });

  it('returns false when the id has line breaks, spaces, look-alike letters or other characters', () => {
    for (const id of ['abcdefg\n', 'abcdefgh\n', '\nabcdefgh', 'abcdéfgh', 'abcdefgh ', 'abcd+efgh', 'abcd%2Fef', 'abcdеfgh' /* Cyrillic е */]) {
      expect(isDeviceImageId(id), JSON.stringify(id)).toBe(false);
    }
  });
});

describe('deviceImageIdForUpload (A42)', () => {
  it('returns the id unchanged when it follows the device image id rule', () => {
    for (const id of ['k3j9x0a1b', 'abcdefgh', 'Zm9vYmFyYmF6cXV4', 'a'.repeat(64)]) expect(deviceImageIdForUpload(id)).toBe(id);
  });

  it('returns legacy-<id>, the same valid device image id every time, when a legacy upload id is too short', () => {
    // ItemCreator before Phase 5c: Math.random().toString(36).slice(2, 11), 1 to 9 characters.
    for (const id of ['a', '5', 'ab3c9', 'abcdefg', '0000000']) {
      expect(deviceImageIdForUpload(id)).toBe(`legacy-${id}`);
      expect(isDeviceImageId(deviceImageIdForUpload(id))).toBe(true);
    }
    for (let index = 0; index < 2000; index++) {
      const id = Math.random().toString(36).slice(2, 11);
      const deviceId = deviceImageIdForUpload(id);
      expect(isDeviceImageId(deviceId), id).toBe(true);
      expect(deviceImageIdForUpload(id)).toBe(deviceId);
    }
    expect(LEGACY_UPLOAD_ID_PREFIX).toBe('legacy-');
  });

  it('returns null when no prefix makes the id valid', () => {
    for (const id of ['', 'image-overwatch-ana.webp', 'has space', 'a'.repeat(65), 'blob:https://x']) {
      expect(deviceImageIdForUpload(id), id).toBeNull();
    }
    // A name of an Object.prototype member gets the prefix like any other short id.
    expect(deviceImageIdForUpload('constructor')).toBe('legacy-constructor');
  });
});
