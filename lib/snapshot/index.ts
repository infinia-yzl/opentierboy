/**
 * Snapshot files: a Freeze Frame PNG that also carries the whole list, so opening the file in
 * OpenTierBoy brings the list back, device images included.
 *
 * - png.ts: the `opentierboy` text chunk inside the PNG (write and checked read).
 * - payload.ts: the JSON inside the chunk (link value plus device images), checked with zod.
 *
 * The two functions below join both steps. The browser code around them (not here yet) takes
 * the screenshot, re-encodes device images, decodes the link value and stores the images.
 */
import {
  embedSnapshotText,
  extractSnapshotText,
  type EmbedSnapshotReason,
  type ExtractSnapshotReason,
} from './png';
import {
  buildSnapshotPayload,
  parseSnapshotPayload,
  type SnapshotPayload,
  type SnapshotPayloadInput,
  type SnapshotPayloadReason,
} from './payload';

export {
  embedSnapshotText,
  extractSnapshotText,
  SNAPSHOT_KEYWORD,
  SNAPSHOT_PNG_LIMITS,
} from './png';
export type {
  EmbedSnapshotReason,
  EmbedSnapshotResult,
  ExtractSnapshotReason,
  ExtractSnapshotResult,
  PngStructureReason,
} from './png';
export {
  buildSnapshotPayload,
  parseSnapshotPayload,
  rasterDataUrlType,
  SNAPSHOT_IMAGE_TYPES,
  SNAPSHOT_PAYLOAD_LIMITS,
  SNAPSHOT_PAYLOAD_VERSION,
} from './payload';
export type {
  BuildSnapshotPayloadResult,
  ParseSnapshotPayloadResult,
  SnapshotImage,
  SnapshotImageType,
  SnapshotPayload,
  SnapshotPayloadInput,
  SnapshotPayloadReason,
} from './payload';

export type ReadSnapshotFileResult =
  | {ok: true; payload: SnapshotPayload}
  | {ok: false; reason: ExtractSnapshotReason | SnapshotPayloadReason; detail?: string};

export type WriteSnapshotFileResult =
  | {ok: true; png: Uint8Array}
  | {ok: false; reason: EmbedSnapshotReason | 'payload-too-large' | 'invalid-payload'; detail?: string};

/**
 * Reads the list from a snapshot PNG. `no-snapshot` means a valid PNG without a list (an
 * ordinary picture); every other reason means the file cannot be opened as a list. Offer to
 * add the file as an image item for `no-snapshot`, `not-png`, `bad-structure` and `bad-crc`:
 * a PNG with bytes after its end or a damaged minor chunk still shows as a picture.
 * Check `File.size` against `SNAPSHOT_PNG_LIMITS.maxFileBytes` before reading the file into
 * memory. Never throws.
 */
export async function readSnapshotFile(file: Uint8Array | ArrayBuffer): Promise<ReadSnapshotFileResult> {
  const extracted = await extractSnapshotText(file);
  if (!extracted.ok) return extracted;
  return parseSnapshotPayload(extracted.text);
}

/** Stores the list in a copy of the screenshot PNG. Never throws. */
export async function writeSnapshotFile(
  png: Uint8Array | ArrayBuffer,
  input: SnapshotPayloadInput,
): Promise<WriteSnapshotFileResult> {
  const built = buildSnapshotPayload(input);
  if (!built.ok) return built;
  return embedSnapshotText(png, built.text);
}
