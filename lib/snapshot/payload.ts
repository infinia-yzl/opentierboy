/**
 * The snapshot payload: the text stored in a Freeze Frame PNG (see png.ts).
 *
 * It is JSON, for example:
 *
 * ```json
 * {"version":1,"state":"3.N4Ig...","path":"/rank/overwatch/tank","images":[{"id":"h3Kx9_Tq2LmZ-a8B","label":"My cat","dataUrl":"data:image/webp;base64,UklGR..."}]}
 * ```
 *
 * - `version`: the payload format version. This file writes and reads version 1. A file with
 *   a higher version gets the reason `unsupported-version` (made by a newer OpenTierBoy).
 * - `state`: the list, as the `?state=` value of a link in a versioned format (`3.` and up).
 *   The link format already has a decoder with size limits and golden fixtures, so the
 *   snapshot reuses it. This module checks only the shape of the value; the caller decodes it
 *   with `decodeState` from lib/state.
 * - `path` (optional): the editor page of the list (`/rank/<set>/<tag>`), a plain /rank path
 *   (lib/rankPath.ts). Opening the file goes there, or to `/rank` when it is missing.
 * - `images`: the device images the list uses, keyed by their local id (the `d` of a v3 item).
 *   Ids follow the device id rule (`isDeviceImageId` in lib/state/deviceId.ts, A40).
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
 * Plain code: zod (through lib/zod, A39) and two small app rules, no React, nothing
 * browser-specific. The functions return a result object and never throw.
 */
import {normalizeRankPath} from '@/lib/rankPath';
import {isDeviceImageId} from '@/lib/state/deviceId';
import {z} from '@/lib/zod';
import {readImageSize, sniffImageType} from '@/lib/images/imageType';
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
 * - `maxImageSide`, `maxImagePixels`: the size an image's header declares (16 megapixels is
 *   4096 x 4096). The app writes at most 512 pixels per side.
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
  maxImageSide: 4096,
  maxImagePixels: 4096 * 4096,
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
  /** The editor page of the list, for example `/rank/overwatch/tank`. */
  path?: string;
  images: SnapshotImage[];
}

export interface SnapshotPayloadInput {
  state: string;
  path?: string;
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

/**
 * How many bytes of a JPEG or GIF image are searched for its size (readImageSize in
 * lib/images/imageType.ts): a JPEG keeps it after its metadata, a GIF in its first frame after
 * the colour table and extensions. Canvas and camera files have it early; later means refused.
 */
export const IMAGE_SIZE_SEARCH_BYTES = 64 * 1024;

/** A versioned link value: version digits, a dot, then lz-string's URL-safe alphabet. */
const VERSIONED_STATE = /^[1-9][0-9]{0,3}\.[A-Za-z0-9+$-]+$/;
const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/;

const imageSchema = z.object({
  id: z.string().refine(isDeviceImageId, {message: 'must follow the device image id rule (8 to 64 characters from A-Z a-z 0-9 - _)'}),
  label: z.string().max(limits.maxLabelChars),
  dataUrl: z
    .string()
    .max(limits.maxImageDataUrlChars)
    .refine(value => rasterDataUrlType(value) !== null, {
      message: 'must be a base64 data URL of a PNG, JPEG, WebP or GIF picture of at most 4096 x 4096 pixels whose bytes match its type',
    }),
});

const payloadSchema = z
  .object({
    version: z.literal(SNAPSHOT_PAYLOAD_VERSION),
    state: z.string().max(limits.maxStateChars).regex(VERSIONED_STATE),
    path: z.string().refine(path => normalizeRankPath(path) !== null, {message: 'must be a /rank path'}).optional(),
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
      ...(input.path === undefined ? {} : {path: input.path}),
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
 * The type and declared size of a base64 data URL of a PNG, JPEG, WebP or GIF picture, or null.
 * The declared type must match the first bytes of the data, and the size the header declares
 * must be within `maxImageSide` and `maxImagePixels`: a tiny file can declare a huge picture,
 * and the browser would decode it at full size (an image bomb). Nothing is decoded here. Only
 * the header is checked, so re-encode the image through a canvas before storing it.
 */
export function rasterDataUrlInfo(dataUrl: string): {type: SnapshotImageType; width: number; height: number} | null {
  if (typeof dataUrl !== 'string' || dataUrl.length > limits.maxImageDataUrlChars) return null;
  const match = DATA_URL.exec(dataUrl);
  if (!match) return null;
  const type = match[1] as SnapshotImageType;
  const base64 = match[2];
  if (base64.length < 16 || base64.length % 4 !== 0) return null;

  // JPEG and GIF keep their size after optional segments; PNG and WebP within the first 30 bytes.
  const headChars = type === 'image/jpeg' || type === 'image/gif' ? Math.ceil(IMAGE_SIZE_SEARCH_BYTES / 3) * 4 : 64;
  let head: Uint8Array;
  try {
    const binary = atob(base64.slice(0, headChars));
    head = Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch {
    return null;
  }
  if (sniffImageType(head) !== type) return null;
  const size = readImageSize(head);
  if (!size || !(size.width > 0 && size.height > 0) || size.width > limits.maxImageSide || size.height > limits.maxImageSide || size.width * size.height > limits.maxImagePixels) {
    return null;
  }
  return {type, ...size};
}

/** The image type of a valid snapshot image data URL (see rasterDataUrlInfo), or null. */
export function rasterDataUrlType(dataUrl: string): SnapshotImageType | null {
  return rasterDataUrlInfo(dataUrl)?.type ?? null;
}

/** A plain object with keys in a fixed order, so the same input always gives the same text. */
function normalize(data: z.infer<typeof payloadSchema>): SnapshotPayload {
  return {
    version: SNAPSHOT_PAYLOAD_VERSION,
    state: data.state,
    ...(data.path === undefined ? {} : {path: normalizeRankPath(data.path) ?? undefined}),
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
