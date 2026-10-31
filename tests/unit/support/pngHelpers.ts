import zlib from 'node:zlib';
import {PNG} from 'pngjs';

/**
 * Test helpers that build and take apart PNG files independently of lib/snapshot: CRCs come
 * from node:zlib, pictures from pngjs.
 */

export interface RawChunk {
  type: string;
  data: Uint8Array;
}

export const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A small RGBA picture encoded by pngjs, with deterministic pixels. */
export function makePng(width = 4, height = 3, seed = 1): Uint8Array {
  const png = new PNG({width, height});
  let x = seed;
  for (let i = 0; i < png.data.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    png.data[i] = x & 0xff;
  }
  return new Uint8Array(PNG.sync.write(png));
}

export function decodePng(bytes: Uint8Array): PNG {
  return PNG.sync.read(Buffer.from(bytes));
}

export function chunk(type: string, data: Uint8Array | string | number[] = new Uint8Array()): RawChunk {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : Uint8Array.from(data);
  return {type, data: bytes};
}

export function encodeChunk({type, data}: RawChunk): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, zlib.crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function assemble(chunks: RawChunk[]): Uint8Array {
  return concat([SIGNATURE, ...chunks.map(encodeChunk)]);
}

/** Splits a well-formed PNG into chunks (no checks: the input comes from the tests). */
export function splitChunks(bytes: Uint8Array): RawChunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: RawChunk[] = [];
  let at = 8;
  while (at < bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    chunks.push({type, data: bytes.slice(at + 8, at + 8 + length)});
    at += 12 + length;
  }
  return chunks;
}

/** Byte offsets of each chunk in a well-formed PNG. */
export function chunkOffsets(bytes: Uint8Array): {type: string; start: number; dataStart: number; crcStart: number}[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let at = 8;
  while (at < bytes.length) {
    const length = view.getUint32(at);
    out.push({type: String.fromCharCode(...bytes.subarray(at + 4, at + 8)), start: at, dataStart: at + 8, crcStart: at + 8 + length});
    at += 12 + length;
  }
  return out;
}

/** Inserts chunks just before IEND. */
export function insertBeforeIend(png: Uint8Array, extra: RawChunk[]): Uint8Array {
  const chunks = splitChunks(png);
  const iend = chunks.findIndex(c => c.type === 'IEND');
  return assemble([...chunks.slice(0, iend), ...extra, ...chunks.slice(iend)]);
}

/** iTXt chunk data: keyword, 0, flag, method, language, 0, translated keyword, 0, text. */
export function itxtData(
  keyword: string,
  text: Uint8Array,
  {compressed = true, method = 0, language = '', translated = ''}: {compressed?: boolean; method?: number; language?: string; translated?: string} = {},
): Uint8Array {
  const enc = new TextEncoder();
  const body = compressed ? new Uint8Array(zlib.deflateSync(text)) : text;
  return concat([
    Uint8Array.from(Array.from(keyword, c => c.charCodeAt(0))),
    Uint8Array.from([0, compressed ? 1 : 0, method]),
    enc.encode(language),
    Uint8Array.from([0]),
    enc.encode(translated),
    Uint8Array.from([0]),
    body,
  ]);
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
