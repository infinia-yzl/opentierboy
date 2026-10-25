/**
 * The snapshot payload: the text stored in a Freeze Frame PNG (see png.ts).
 *
 * It is JSON with three fields:
 *
 * ```json
 * {"version":1,"state":"3.N4Ig...","images":[{"id":"h3Kx9_Tq2LmZ-a8B","label":"My cat","dataUrl":"data:image/webp;base64,UklGR..."}]}
 * ```
 *
 * - `version`: the payload format version. This file writes and reads version 1. A file with
 *   a higher version gets the reason `unsupported-version` (made by a newer OpenTierBoy).
 * - `state`: the list, as the `?state=` value of a link in a versioned format (`3.` and up).
 *   The link format already has a decoder with size limits and golden fixtures, so the
 *   snapshot reuses it. This module checks only the shape of the value; the caller decodes it
 *   with `decodeState` from lib/state.
 * - `images`: the device images the list uses, keyed by their local id (the `d` of a v3 item).
 *   An id has 8 to 64 characters from `A-Z a-z 0-9 - _`, and is never the name of an
 *   `Object.prototype` member such as `__proto__`: the same rule as the device store.
 *   Each is a base64 data URL of a PNG, JPEG, WebP or GIF picture. SVG is never accepted,
 *   because SVG can carry scripts. The first bytes must match the declared type. Only the
 *   first bytes are checked, so the browser code re-encodes every image through a canvas
 *   before it stores or shows it (A10).
 *
 * Unknown fields are ignored, so a later version can add fields that this version skips.
 *
 * Old snapshot files must keep opening, like old links: never change what version 1 means.
 * A breaking change gets version 2 and a parser for it next to this one.
 *
 * Plain code: zod only, no React, nothing browser-specific. The functions return a result
 * object and never throw.
 */
import {z} from '@/lib/zod';
import {SNAPSHOT_PNG_LIMITS} from './png';

export const SNAPSHOT_PAYLOAD_VERSION = 1;

const MiB = 1024 * 1024;

/**
 * Limits for the payload. Generous for real lists, small enough for a browser tab.
 *
 * - `maxPayloadBytes`: the whole JSON text in UTF-8 bytes. Same as the PNG text cap.
 * - `maxStateChars`: the link value. The v3 decoder applies its own, tighter limits.
 * - `maxImages`, `maxImageDataUrlChars`, `maxTotalImageDataUrlChars`: device images.
 *   8 MB of data URLs is about 6 MB of pictures, for example 300 pictures of 20 KB each.
 * - `maxLabelChars`: per image.
 * - `minLocalIdChars`, `maxLocalIdChars`: the device store's id length (8 to 64).
 * - `maxJsonTokens`: objects, arrays and commas outside strings, counted before JSON.parse.
 *   A payload with 500 images has about 2,000. The count stops JSON.parse and zod from
 *   building millions of tiny values: 9 MB of `{},` would otherwise take seconds.
 */
export const SNAPSHOT_PAYLOAD_LIMITS = Object.freeze({
  maxPayloadBytes: SNAPSHOT_PNG_LIMITS.maxTextBytes,
  maxStateChars: 1 * MiB,
  maxImages: 500,
  maxImageDataUrlChars: 2 * MiB,
  maxTotalImageDataUrlChars: 8 * MiB,
  maxLabelChars: 1_000,
  minLocalIdChars: 8,
  maxLocalIdChars: 64,
  maxJsonTokens: 100_000,
});

/** The image types a snapshot may hold. */
export const SNAPSHOT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type SnapshotImageType = (typeof SNAPSHOT_IMAGE_TYPES)[number];

export interface SnapshotImage {
  /** The device image's local id: the `d` of the v3 items that show it. */
  id: string;
  /** The image's label. May be empty. */
  label: string;
  /** `data:image/<png|jpeg|webp|gif>;base64,<data>` */
  dataUrl: string;
}

export interface SnapshotPayload {
  version: typeof SNAPSHOT_PAYLOAD_VERSION;
  /** The `?state=` value of a link in a versioned format, for example `3.N4Ig...`. */
  state: string;
  images: SnapshotImage[];
}

export interface SnapshotPayloadInput {
  state: string;
  images?: readonly SnapshotImage[];
}

export type SnapshotPayloadReason =
  /** The text or the built payload is larger than `maxPayloadBytes`. */
  | 'payload-too-large'
  /** The text is not JSON. */
  | 'bad-json'
  /** The payload has a version this code does not know (a newer OpenTierBoy made it). */
  | 'unsupported-version'
  /** The JSON does not match the payload format or breaks a limit. */
  | 'invalid-payload';

export type ParseSnapshotPayloadResult =
  | {ok: true; payload: SnapshotPayload}
  | {ok: false; reason: SnapshotPayloadReason; detail?: string};

export type BuildSnapshotPayloadResult =
  | {ok: true; text: string; payload: SnapshotPayload}
  | {ok: false; reason: 'payload-too-large' | 'invalid-payload'; detail?: string};

const limits = SNAPSHOT_PAYLOAD_LIMITS;

/** A versioned link value: version digits, a dot, then lz-string's URL-safe alphabet. */
const VERSIONED_STATE = /^[1-9][0-9]{0,3}\.[A-Za-z0-9+$-]+$/;
/**
 * Device image ids: 8 to 64 URL-safe characters. Same rule as `isDeviceImageId` in the device
 * store (5c, A40); at restack both use one shared definition.
 */
const LOCAL_ID = /^[A-Za-z0-9_-]{8,64}$/;
const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/;

const imageSchema = z.object({
  id: z.string().refine(isSnapshotImageId, {message: 'must be 8 to 64 characters from A-Z a-z 0-9 - _'}),
  label: z.string().max(limits.maxLabelChars),
  dataUrl: z
    .string()
    .max(limits.maxImageDataUrlChars)
    .refine(value => rasterDataUrlType(value) !== null, {
      message: 'must be a base64 data URL of a PNG, JPEG, WebP or GIF picture whose bytes match its type',
    }),
});

const payloadSchema = z
  .object({
    version: z.literal(SNAPSHOT_PAYLOAD_VERSION),
    state: z.string().max(limits.maxStateChars).regex(VERSIONED_STATE),
    images: z.array(imageSchema).max(limits.maxImages).default([]),
  })
  .superRefine((payload, ctx) => {
    // Zod may run this even when a field above already failed, so check the types again.
    if (!Array.isArray(payload.images)) return;
    const seen = new Set<string>();
    let total = 0;
    payload.images.forEach((image, index) => {
      if (typeof image?.id !== 'string' || typeof image.dataUrl !== 'string') return;
      if (seen.has(image.id)) {
        ctx.addIssue({code: 'custom', message: 'duplicate image id', path: ['images', index, 'id']});
      }
      seen.add(image.id);
      total += image.dataUrl.length;
    });
    if (total > limits.maxTotalImageDataUrlChars) {
      ctx.addIssue({code: 'custom', message: 'the images are too large together', path: ['images']});
    }
  });

/** Reads the payload text from a snapshot PNG. Never throws. */
export function parseSnapshotPayload(text: string): ParseSnapshotPayloadResult {
  try {
    if (typeof text !== 'string') return {ok: false, reason: 'invalid-payload'};
    // A string's length never exceeds its UTF-8 byte count, so this is a safe early check.
    if (text.length > limits.maxPayloadBytes) return {ok: false, reason: 'payload-too-large'};
    if (countJsonTokens(text, limits.maxJsonTokens) > limits.maxJsonTokens) {
      return {ok: false, reason: 'invalid-payload', detail: 'payload: too many JSON values'};
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return {ok: false, reason: 'bad-json'};
    }

    if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
      const {version, images} = json as {version?: unknown; images?: unknown};
      if (typeof version === 'number' && Number.isInteger(version) && version > SNAPSHOT_PAYLOAD_VERSION) {
        return {ok: false, reason: 'unsupported-version'};
      }
      // Cap the list before zod walks it: millions of tiny entries would cost seconds.
      if (images !== undefined && (!Array.isArray(images) || images.length > limits.maxImages)) {
        return {ok: false, reason: 'invalid-payload', detail: `images: must be a list of at most ${limits.maxImages} images`};
      }
    }

    const result = payloadSchema.safeParse(json);
    if (!result.success) return {ok: false, reason: 'invalid-payload', detail: describeIssue(result.error)};
    return {ok: true, payload: normalize(result.data)};
  } catch {
    return {ok: false, reason: 'invalid-payload'};
  }
}

/**
 * Builds the payload text for a snapshot PNG from a link value and the device images the list
 * uses. The images must already be re-encoded raster data URLs (the browser code does that).
 * Build the link value with `encodeState(list, {format: 3})`.
 * Checks every limit that `parseSnapshotPayload` checks, so the text always parses back.
 * Never throws.
 */
export function buildSnapshotPayload(input: SnapshotPayloadInput): BuildSnapshotPayloadResult {
  try {
    const candidate = {
      version: SNAPSHOT_PAYLOAD_VERSION,
      state: input.state,
      images: (input.images ?? []).map(image => ({id: image.id, label: image.label, dataUrl: image.dataUrl})),
    };
    const result = payloadSchema.safeParse(candidate);
    if (!result.success) return {ok: false, reason: 'invalid-payload', detail: describeIssue(result.error)};

    const payload = normalize(result.data);
    const text = JSON.stringify(payload);
    if (utf8Length(text) > limits.maxPayloadBytes) return {ok: false, reason: 'payload-too-large'};
    return {ok: true, text, payload};
  } catch {
    return {ok: false, reason: 'invalid-payload'};
  }
}

/**
 * True for a device image id: 8 to 64 characters from `A-Z a-z 0-9 - _`, and never the name
 * of an `Object.prototype` member (`__proto__`, `constructor`, `toString`...).
 */
export function isSnapshotImageId(value: unknown): value is string {
  return typeof value === 'string' && LOCAL_ID.test(value) && !Object.prototype.hasOwnProperty.call(Object.prototype, value);
}

/**
 * The image type of a base64 data URL of a PNG, JPEG, WebP or GIF picture, or null.
 * The declared type must match the first bytes of the data. Only the first bytes are checked:
 * re-encode the image through a canvas before storing it.
 */
export function rasterDataUrlType(dataUrl: string): SnapshotImageType | null {
  if (typeof dataUrl !== 'string' || dataUrl.length > limits.maxImageDataUrlChars) return null;
  const match = DATA_URL.exec(dataUrl);
  if (!match) return null;
  const type = match[1] as SnapshotImageType;
  const base64 = match[2];
  if (base64.length < 16 || base64.length % 4 !== 0) return null;

  let head: string;
  try {
    head = atob(base64.slice(0, 16));
  } catch {
    return null;
  }
  const byte = (i: number) => head.charCodeAt(i);
  const ascii = (from: number, to: number) => head.slice(from, to);
  switch (type) {
    case 'image/png':
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, i) => byte(i) === value) ? type : null;
    case 'image/jpeg':
      return byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff ? type : null;
    case 'image/gif':
      return ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a' ? type : null;
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? type : null;
    default:
      return null;
  }
}

/** A plain object with keys in a fixed order, so the same input always gives the same text. */
function normalize(data: z.infer<typeof payloadSchema>): SnapshotPayload {
  return {
    version: SNAPSHOT_PAYLOAD_VERSION,
    state: data.state,
    images: data.images.map(image => ({id: image.id, label: image.label, dataUrl: image.dataUrl})),
  };
}

/**
 * Counts '{', '[' and ',' outside JSON strings, and stops once the count passes `stopAfter`.
 * One fast pass over the text; it never allocates.
 */
function countJsonTokens(text: string, stopAfter: number): number {
  let count = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 0x5c) i++; // a backslash escapes the next character
      else if (c === 0x22) inString = false;
    } else if (c === 0x22) {
      inString = true;
    } else if (c === 0x7b || c === 0x5b || c === 0x2c) {
      if (++count > stopAfter) return count;
    }
  }
  return count;
}

function describeIssue(error: z.ZodError): string | undefined {
  const issue = error.issues[0];
  if (!issue) return undefined;
  const where = issue.path.length > 0 ? issue.path.join('.') : 'payload';
  return `${where}: ${issue.message}`;
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
