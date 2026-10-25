/**
 * The one rule for device image ids (A40): 8 to 64 URL-safe characters (A-Z, a-z, 0-9, '-'
 * and '_'), and never the name of an Object.prototype member such as `__proto__`,
 * `constructor` or `toString`, in case an id ever becomes an object key.
 *
 * The same rule as `isDeviceImageId` in lib/images/deviceStore.ts (Phase 5c), which creates
 * ids of 16 characters. The v3 link decoder refuses a device image (`d`) whose id breaks it.
 * Changing the rule changes which v3 links decode: only ever widen it.
 */
const DEVICE_IMAGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isDeviceImageId(value: unknown): value is string {
  return typeof value === 'string'
    && DEVICE_IMAGE_ID_PATTERN.test(value)
    && !Object.prototype.hasOwnProperty.call(Object.prototype, value);
}
