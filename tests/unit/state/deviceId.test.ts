import {describe, expect, it} from 'vitest';
import {isDeviceImageId} from '@/lib/state';

/**
 * The one device image id rule (A40). The cases below are those of
 * tests/unit/images/deviceStore.test.ts on revamp/5c-custom-images ("accepts 8 to 64
 * URL-safe characters as an id"), plus every Object.prototype member name.
 */
describe('isDeviceImageId', () => {
  it('accepts 8 to 64 URL-safe characters as an id', () => {
    for (const id of ['abcdefgh', 'A-_09zZx', 'a'.repeat(64)]) expect(isDeviceImageId(id), id).toBe(true);
    for (const id of ['', 'abcdefg', 'a'.repeat(65), 'abcd efgh', 'abcd/efgh', 'abcd.efgh', 'blob:https://x', '__proto__', 'constructor', 'hasOwnProperty', 42, null, undefined, ['abcdefgh']]) {
      expect(isDeviceImageId(id), String(id)).toBe(false);
    }
  });

  it('accepts the ids the device store creates and the ids of legacy uploads', () => {
    // deviceStore.createDeviceImageId: 16 URL-safe base64 characters.
    for (const id of ['AAAAAAAAAAAAAAAA', '________________', 'Zm9vYmFyYmF6cXV4']) expect(isDeviceImageId(id), id).toBe(true);
    // ItemCreator before Phase 5c: Math.random().toString(36).slice(2, 11), usually 9 characters.
    expect(isDeviceImageId('k3j9x0a1b')).toBe(true);
    expect(isDeviceImageId('k3j9x0a')).toBe(false);
  });

  it('refuses the name of every Object.prototype member, also those the pattern allows', () => {
    const names = Object.getOwnPropertyNames(Object.prototype);
    expect(names).toContain('__proto__');
    for (const name of names) expect(isDeviceImageId(name), name).toBe(false);
    expect(isDeviceImageId('toString')).toBe(false);
    expect(isDeviceImageId('__defineGetter__')).toBe(false);
    expect(isDeviceImageId('toStringX')).toBe(true);
  });

  it('refuses other characters, including look-alikes and line breaks', () => {
    for (const id of ['abcdefg\n', 'abcdefgh\n', '\nabcdefgh', 'abcdéfgh', 'abcdefgh ', 'abcd+efgh', 'abcd%2Fef', 'abcdеfgh' /* Cyrillic е */]) {
      expect(isDeviceImageId(id), JSON.stringify(id)).toBe(false);
    }
  });
});
