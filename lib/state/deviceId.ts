/**
 * The one rule for device image ids (A40): 8 to 64 URL-safe characters (A-Z, a-z, 0-9, '-'
 * and '_'), and never the name of an Object.prototype member such as `__proto__`,
 * `constructor` or `toString`, in case an id ever becomes an object key.
 *
 * This is the one definition: lib/images/deviceStore.ts (which creates ids of 16 characters)
 * and the snapshot file import it. The v3 link decoder refuses a device image (`d`) whose id
 * breaks it. Changing the rule changes which v3 links decode: only ever widen it.
 */
const DEVICE_IMAGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isDeviceImageId(value: unknown): value is string {
  return typeof value === 'string'
    && DEVICE_IMAGE_ID_PATTERN.test(value)
    && !Object.prototype.hasOwnProperty.call(Object.prototype, value);
}

/** The prefix that turns the id of an upload made before Phase 5c into a device image id (A42). */
export const LEGACY_UPLOAD_ID_PREFIX = 'legacy-';

/**
 * The device image id of an upload, for writing it as a v3 device image (`d`) and for its key in
 * the device image store (A42).
 *
 * Uploads made before Phase 5c have ids from `Math.random().toString(36).slice(2, 11)`: usually
 * 9 characters, but they can be shorter, and v1 and v2 links carry those ids. An id that follows
 * the device id rule stays as it is. Any other id gets the prefix `legacy-`, which makes every
 * such id valid (any 1 to 9 base36 characters). Returns null when no prefix makes the id valid,
 * for example an image-set id with a dot.
 */
export function deviceImageIdForUpload(id: string): string | null {
  if (isDeviceImageId(id)) return id;
  const prefixed = LEGACY_UPLOAD_ID_PREFIX + id;
  return isDeviceImageId(prefixed) ? prefixed : null;
}
