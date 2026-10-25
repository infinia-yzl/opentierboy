/**
 * The snapshot chunk inside a PNG file.
 *
 * A Freeze Frame download is an ordinary PNG with one extra text chunk: an `iTXt` chunk with
 * the keyword `opentierboy`, placed just before `IEND`. Image viewers skip text chunks, so the
 * file still shows as a normal picture. When the file is opened in OpenTierBoy again, the
 * chunk's text (the snapshot payload, see payload.ts) turns back into the list.
 *
 * Why iTXt: zTXt holds Latin-1 text only, and the payload is JSON with titles and labels in any
 * language. iTXt holds UTF-8 text and can be compressed with zlib just like zTXt. tEXt cannot
 * be compressed at all.
 *
 * Reading treats the file as untrusted input:
 * - the PNG signature and the CRC of every chunk are checked;
 * - the file size, the number of chunks and the chunk sizes are capped;
 * - the text is decompressed in small steps and stops at the text cap, so a small file that
 *   would expand to gigabytes (a decompression bomb) costs at most a few megabytes;
 * - the text must be valid UTF-8.
 *
 * Plain code: no React, no Node modules. It needs the Compression Streams API at call time
 * (every modern browser and Node 22 have it), and nothing at import time.
 * The functions return a result object and never throw.
 */
import {crc32} from './crc32';
import {deflate, inflateCapped} from './compression';

/** The keyword of the snapshot chunk. */
export const SNAPSHOT_KEYWORD = 'opentierboy';

const MiB = 1024 * 1024;

/**
 * Limits for reading and writing snapshot PNGs. Writing refuses anything reading would refuse.
 *
 * - `maxFileBytes`: the largest file. Check `File.size` against it before reading the file.
 * - `maxChunks`: the most chunks in one file. Browsers split the image data into chunks of
 *   about 8 KB, so a 25 MB picture has about 3,200 chunks.
 * - `maxChunkBytes`: the largest chunk of any type. Some encoders write all image data as
 *   one chunk, so this is the whole file size.
 * - `maxTextChunkBytes`: the largest snapshot chunk (compressed).
 * - `maxTextBytes`: the largest snapshot text after decompression (UTF-8 bytes).
 */
export const SNAPSHOT_PNG_LIMITS = Object.freeze({
  maxFileBytes: 25 * MiB,
  maxChunks: 10_000,
  maxChunkBytes: 25 * MiB,
  maxTextChunkBytes: 12 * MiB,
  maxTextBytes: 10 * MiB,
});

/** Why bytes are not a well-formed PNG within the limits. */
export type PngStructureReason =
  /** The bytes do not start with the PNG signature. */
  | 'not-png'
  /** The file is larger than `maxFileBytes`. */
  | 'file-too-large'
  /** The file ends inside a chunk, or before the IEND chunk. */
  | 'truncated'
  /** A chunk's CRC does not match its contents. */
  | 'bad-crc'
  /** Not a valid chunk layout: IHDR is not first, a chunk type is not 4 letters, or bytes follow IEND. */
  | 'bad-structure'
  /** A chunk declares more than `maxChunkBytes`. */
  | 'chunk-too-large'
  /** More than `maxChunks` chunks. */
  | 'too-many-chunks';

/** Why `extractSnapshotText` found no snapshot text. */
export type ExtractSnapshotReason =
  | PngStructureReason
  /** A valid PNG without a snapshot chunk: an ordinary picture. */
  | 'no-snapshot'
  /** More than one snapshot chunk. */
  | 'duplicate-snapshot'
  /** The snapshot chunk is malformed (missing fields, unknown compression, too large). */
  | 'bad-snapshot-chunk'
  /** The text is longer than `maxTextBytes` after decompression. */
  | 'text-too-large'
  /** The compressed text is damaged. */
  | 'bad-compression'
  /** The text is not valid UTF-8. */
  | 'bad-utf8'
  /** This browser cannot decompress (no DecompressionStream). */
  | 'unsupported';

/** Why `embedSnapshotText` could not write the file. */
export type EmbedSnapshotReason =
  | PngStructureReason
  /** The text is longer than `maxTextBytes`. */
  | 'text-too-large'
  /** This browser cannot compress (no CompressionStream). */
  | 'unsupported'
  /** Compression failed. */
  | 'compression-failed';

export type ExtractSnapshotResult = {ok: true; text: string} | {ok: false; reason: ExtractSnapshotReason};
export type EmbedSnapshotResult = {ok: true; png: Uint8Array<ArrayBuffer>} | {ok: false; reason: EmbedSnapshotReason};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** iTXt layout: keyword, 0, compression flag, compression method, language tag, 0, translated keyword, 0, text. */
const COMPRESSION_METHOD_ZLIB = 0;
const MAX_PNG_CHUNK_LENGTH = 0x7fffffff;

interface Chunk {
  type: string;
  /** Offset of the chunk's length field. */
  start: number;
  /** Offset of the chunk's data. */
  dataStart: number;
  /** Offset just after the chunk's data (where the CRC starts). */
  dataEnd: number;
  /** Offset just after the chunk's CRC. */
  end: number;
}

type WalkResult = {ok: true; chunks: Chunk[]} | {ok: false; reason: PngStructureReason};

/**
 * Finds the snapshot text in a PNG file. Returns `no-snapshot` for a valid PNG without one,
 * and another reason for anything that is not a valid PNG within the limits.
 */
export async function extractSnapshotText(file: Uint8Array | ArrayBuffer): Promise<ExtractSnapshotResult> {
  try {
    const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
    const walk = walkChunks(bytes);
    if (!walk.ok) return walk;

    const found = walk.chunks.filter(chunk => chunk.type === 'iTXt' && hasSnapshotKeyword(bytes, chunk));
    if (found.length === 0) return {ok: false, reason: 'no-snapshot'};
    if (found.length > 1) return {ok: false, reason: 'duplicate-snapshot'};

    const chunk = found[0];
    if (chunk.dataEnd - chunk.dataStart > SNAPSHOT_PNG_LIMITS.maxTextChunkBytes) {
      return {ok: false, reason: 'bad-snapshot-chunk'};
    }
    const fields = parseSnapshotChunk(bytes.subarray(chunk.dataStart, chunk.dataEnd));
    if (!fields) return {ok: false, reason: 'bad-snapshot-chunk'};

    let textBytes: Uint8Array;
    if (fields.compressed) {
      const inflated = await inflateCapped(fields.text, SNAPSHOT_PNG_LIMITS.maxTextBytes);
      if (!inflated.ok) {
        const reasons = {'too-large': 'text-too-large', 'bad-data': 'bad-compression', unsupported: 'unsupported'} as const;
        return {ok: false, reason: reasons[inflated.reason]};
      }
      textBytes = inflated.bytes;
    } else {
      if (fields.text.byteLength > SNAPSHOT_PNG_LIMITS.maxTextBytes) return {ok: false, reason: 'text-too-large'};
      textBytes = fields.text;
    }

    try {
      return {ok: true, text: new TextDecoder('utf-8', {fatal: true}).decode(textBytes)};
    } catch {
      return {ok: false, reason: 'bad-utf8'};
    }
  } catch {
    // Not reachable with the checks above; kept so that a runtime surprise never escapes.
    return {ok: false, reason: 'bad-structure'};
  }
}

/**
 * Returns a copy of the PNG with `text` stored in a compressed snapshot chunk just before
 * IEND. An existing snapshot chunk is replaced. The input must be a valid PNG within the
 * limits, and the result is checked against the same limits, so `extractSnapshotText`
 * always accepts it.
 */
export async function embedSnapshotText(png: Uint8Array | ArrayBuffer, text: string): Promise<EmbedSnapshotResult> {
  try {
    const bytes = png instanceof Uint8Array ? png : new Uint8Array(png);
    const walk = walkChunks(bytes);
    if (!walk.ok) return walk;

    const textBytes = new TextEncoder().encode(text);
    if (textBytes.byteLength > SNAPSHOT_PNG_LIMITS.maxTextBytes) return {ok: false, reason: 'text-too-large'};

    const compressed = await deflate(textBytes);
    if (!compressed.ok) {
      return {ok: false, reason: compressed.reason === 'unsupported' ? 'unsupported' : 'compression-failed'};
    }

    const keyword = latin1(SNAPSHOT_KEYWORD);
    // keyword, 0, compression flag 1, method 0 (zlib), empty language tag + 0, empty translated keyword + 0
    const header = [...keyword, 0, 1, COMPRESSION_METHOD_ZLIB, 0, 0];
    const data = new Uint8Array(header.length + compressed.bytes.byteLength);
    data.set(header, 0);
    data.set(compressed.bytes, header.length);
    if (data.byteLength > SNAPSHOT_PNG_LIMITS.maxTextChunkBytes) return {ok: false, reason: 'text-too-large'};
    const snapshotChunk = buildChunk('iTXt', data);

    const kept = walk.chunks.filter(chunk => !(chunk.type === 'iTXt' && hasSnapshotKeyword(bytes, chunk)));
    if (kept.length + 1 > SNAPSHOT_PNG_LIMITS.maxChunks) return {ok: false, reason: 'too-many-chunks'};

    const keptBytes = kept.reduce((sum, chunk) => sum + (chunk.end - chunk.start), 0);
    const total = PNG_SIGNATURE.length + keptBytes + snapshotChunk.byteLength;
    if (total > SNAPSHOT_PNG_LIMITS.maxFileBytes) return {ok: false, reason: 'file-too-large'};

    const out = new Uint8Array(total);
    out.set(PNG_SIGNATURE, 0);
    let at = PNG_SIGNATURE.length;
    for (const chunk of kept) {
      // IEND is always the last chunk (walkChunks checks it), so the snapshot goes right before it.
      if (chunk.type === 'IEND') {
        out.set(snapshotChunk, at);
        at += snapshotChunk.byteLength;
      }
      out.set(bytes.subarray(chunk.start, chunk.end), at);
      at += chunk.end - chunk.start;
    }
    return {ok: true, png: out};
  } catch {
    return {ok: false, reason: 'compression-failed'};
  }
}

/**
 * Splits a PNG into chunks and checks the structure: signature, limits, CRCs, IHDR first,
 * IEND last with nothing after it. Never allocates based on a declared length.
 */
function walkChunks(bytes: Uint8Array): WalkResult {
  const limits = SNAPSHOT_PNG_LIMITS;
  if (bytes.byteLength > limits.maxFileBytes) return {ok: false, reason: 'file-too-large'};
  if (bytes.byteLength < PNG_SIGNATURE.length || PNG_SIGNATURE.some((value, i) => bytes[i] !== value)) {
    return {ok: false, reason: 'not-png'};
  }

  const chunks: Chunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < bytes.byteLength) {
    if (chunks.length >= limits.maxChunks) return {ok: false, reason: 'too-many-chunks'};
    if (offset + 8 > bytes.byteLength) return {ok: false, reason: 'truncated'};

    const length = readUint32(bytes, offset);
    if (length > limits.maxChunkBytes || length > MAX_PNG_CHUNK_LENGTH) return {ok: false, reason: 'chunk-too-large'};
    const type = chunkType(bytes, offset + 4);
    if (type === null) return {ok: false, reason: 'bad-structure'};

    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const end = dataEnd + 4;
    if (end > bytes.byteLength) return {ok: false, reason: 'truncated'};
    if (crc32(bytes, offset + 4, dataEnd) !== readUint32(bytes, dataEnd)) return {ok: false, reason: 'bad-crc'};

    if (chunks.length === 0 && (type !== 'IHDR' || length !== 13)) return {ok: false, reason: 'bad-structure'};
    chunks.push({type, start: offset, dataStart, dataEnd, end});
    offset = end;

    if (type === 'IEND') {
      if (length !== 0 || offset !== bytes.byteLength) return {ok: false, reason: 'bad-structure'};
      return {ok: true, chunks};
    }
  }
  return {ok: false, reason: 'truncated'};
}

/** The 4-letter chunk type, or null when the bytes are not ASCII letters. */
function chunkType(bytes: Uint8Array, at: number): string | null {
  let type = '';
  for (let i = at; i < at + 4; i++) {
    const c = bytes[i];
    const letter = (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
    if (!letter) return null;
    type += String.fromCharCode(c);
  }
  return type;
}

function hasSnapshotKeyword(bytes: Uint8Array, chunk: Chunk): boolean {
  const keyword = latin1(SNAPSHOT_KEYWORD);
  if (chunk.dataEnd - chunk.dataStart < keyword.length + 1) return false;
  for (let i = 0; i < keyword.length; i++) {
    if (bytes[chunk.dataStart + i] !== keyword[i]) return false;
  }
  return bytes[chunk.dataStart + keyword.length] === 0;
}

/** Reads the iTXt fields after the keyword. Returns null when the chunk is malformed. */
function parseSnapshotChunk(data: Uint8Array): {compressed: boolean; text: Uint8Array} | null {
  let at = latin1(SNAPSHOT_KEYWORD).length + 1;
  if (at + 2 > data.byteLength) return null;
  const flag = data[at];
  const method = data[at + 1];
  if (flag !== 0 && flag !== 1) return null;
  if (method !== COMPRESSION_METHOD_ZLIB) return null;
  at += 2;
  // Language tag and translated keyword: both null-terminated. The snapshot writes them empty
  // and the reader ignores their contents.
  for (let field = 0; field < 2; field++) {
    const nul = data.indexOf(0, at);
    if (nul === -1) return null;
    at = nul + 1;
  }
  return {compressed: flag === 1, text: data.subarray(at)};
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.byteLength);
  writeUint32(chunk, 0, data.byteLength);
  chunk.set(latin1(type), 4);
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.byteLength, crc32(chunk, 4, 8 + data.byteLength));
  return chunk;
}

function latin1(text: string): number[] {
  return Array.from(text, char => char.charCodeAt(0));
}

function readUint32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function writeUint32(bytes: Uint8Array, at: number, value: number): void {
  bytes[at] = (value >>> 24) & 0xff;
  bytes[at + 1] = (value >>> 16) & 0xff;
  bytes[at + 2] = (value >>> 8) & 0xff;
  bytes[at + 3] = value & 0xff;
}
