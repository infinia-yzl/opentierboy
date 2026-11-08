/**
 * zlib compression for the snapshot text chunk, with the Compression Streams API
 * (`CompressionStream` and `DecompressionStream` with the 'deflate' format, which is the
 * zlib format PNG uses). Every modern browser and Node 22 have it, so no library is needed.
 *
 * Nothing here runs at import time. Both functions return a result and never throw.
 */

/**
 * How many compressed bytes go into the decompressor at a time. Deflate expands at most about
 * 1032 times, so one slice can produce at most about 4 MB. The decompressor only gets the
 * next slice after the previous output was read and counted, so a decompression bomb stops
 * within one slice of the cap. A browser decompresses each input chunk in one go, which is
 * why the input must be small chunks.
 */
export const INFLATE_INPUT_SLICE_BYTES = 4096;

export type InflateResult =
  | {ok: true; bytes: Uint8Array}
  | {ok: false; reason: 'too-large' | 'bad-data' | 'unsupported'};

export type DeflateResult = {ok: true; bytes: Uint8Array} | {ok: false; reason: 'unsupported' | 'failed'};

/**
 * Decompresses a zlib stream, but stops as soon as the output would exceed `maxBytes`.
 *
 * - `too-large`: the output is longer than `maxBytes`. Decompression stopped there.
 * - `bad-data`: not a valid zlib stream (bad header, bad checksum, truncated, or bytes after
 *   the end of the stream).
 * - `unsupported`: this runtime has no DecompressionStream.
 */
export async function inflateCapped(data: Uint8Array, maxBytes: number): Promise<InflateResult> {
  if (typeof DecompressionStream === 'undefined' || typeof ReadableStream === 'undefined') {
    return {ok: false, reason: 'unsupported'};
  }

  let offset = 0;
  // A pull source with no queue: the pipe asks for the next slice only when the
  // decompressor has room, which is after its previous output was read below.
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      pull(controller) {
        if (offset >= data.length) {
          controller.close();
          return;
        }
        const end = Math.min(offset + INFLATE_INPUT_SLICE_BYTES, data.length);
        controller.enqueue(data.slice(offset, end));
        offset = end;
      },
    },
    {highWaterMark: 0},
  );

  let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;
  try {
    reader = source.pipeThrough(new DecompressionStream('deflate')).getReader();
  } catch {
    return {ok: false, reason: 'unsupported'};
  }

  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return {ok: false, reason: 'too-large'};
      }
      parts.push(value);
    }
  } catch {
    return {ok: false, reason: 'bad-data'};
  }
  return {ok: true, bytes: concat(parts, total)};
}

/** Compresses bytes into a zlib stream. */
export async function deflate(data: Uint8Array): Promise<DeflateResult> {
  if (typeof CompressionStream === 'undefined' || typeof ReadableStream === 'undefined') {
    return {ok: false, reason: 'unsupported'};
  }
  try {
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(data.slice());
        controller.close();
      },
    });
    const reader = source.pipeThrough(new CompressionStream('deflate')).getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      parts.push(value);
      total += value.byteLength;
    }
    return {ok: true, bytes: concat(parts, total)};
  } catch {
    return {ok: false, reason: 'failed'};
  }
}

function concat(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}
