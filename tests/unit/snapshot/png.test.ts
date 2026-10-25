import zlib from 'node:zlib';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {embedSnapshotText, extractSnapshotText, SNAPSHOT_KEYWORD, SNAPSHOT_PNG_LIMITS} from '@/lib/snapshot/png';
import {INFLATE_INPUT_SLICE_BYTES} from '@/lib/snapshot/compression';
import {
  assemble,
  chunk,
  chunkOffsets,
  concat,
  decodePng,
  insertBeforeIend,
  itxtData,
  makePng,
  SIGNATURE,
  splitChunks,
} from './pngHelpers';

const MiB = 1024 * 1024;
const TEXT = '{"version":1,"state":"3.N4Ig","title":"Ünïcödé ✨ 名前 🧪"}';

async function embed(png: Uint8Array, text = TEXT): Promise<Uint8Array> {
  const result = await embedSnapshotText(png, text);
  if (!result.ok) throw new Error(`embed failed: ${result.reason}`);
  return result.png;
}

function snapshotChunk(text: string | Uint8Array, options?: Parameters<typeof itxtData>[2]) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  return chunk('iTXt', itxtData(SNAPSHOT_KEYWORD, bytes, options));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('embedSnapshotText and extractSnapshotText', () => {
  it('round-trips the text, including any Unicode', async () => {
    const png = await embed(makePng(), TEXT);
    expect(await extractSnapshotText(png)).toEqual({ok: true, text: TEXT});
  });

  it('round-trips an empty text and accepts an ArrayBuffer', async () => {
    const png = await embed(makePng(), '');
    const buffer = new Uint8Array(png).buffer;
    expect(await extractSnapshotText(buffer)).toEqual({ok: true, text: ''});
  });

  it('writes a file that still decodes as the same picture', async () => {
    const original = makePng(17, 9, 7);
    const withSnapshot = await embed(original);
    const before = decodePng(original);
    const after = decodePng(withSnapshot);
    expect(after.width).toBe(17);
    expect(after.height).toBe(9);
    expect(Buffer.compare(after.data, before.data)).toBe(0);
  });

  it('writes one compressed iTXt chunk just before IEND that other zlib code can read', async () => {
    const original = makePng();
    const chunks = splitChunks(await embed(original));
    const types = chunks.map(c => c.type);
    expect(types.slice(-2)).toEqual(['iTXt', 'IEND']);
    expect(types.slice(0, -2)).toEqual(splitChunks(original).map(c => c.type).slice(0, -1));

    const data = chunks[chunks.length - 2].data;
    const keyword = new TextEncoder().encode(`${SNAPSHOT_KEYWORD}\0`);
    expect(Array.from(data.subarray(0, keyword.length))).toEqual(Array.from(keyword));
    // compression flag 1, method 0, empty language tag, empty translated keyword
    expect(Array.from(data.subarray(keyword.length, keyword.length + 4))).toEqual([1, 0, 0, 0]);
    const text = zlib.inflateSync(data.subarray(keyword.length + 4)).toString('utf8');
    expect(text).toBe(TEXT);
  });

  it('replaces an existing snapshot chunk instead of adding a second one', async () => {
    const once = await embed(makePng(), 'first');
    const twice = await embed(once, 'second');
    expect(splitChunks(twice).filter(c => c.type === 'iTXt')).toHaveLength(1);
    expect(await extractSnapshotText(twice)).toEqual({ok: true, text: 'second'});
  });

  it('keeps other text chunks, including other iTXt chunks', async () => {
    const png = insertBeforeIend(makePng(), [chunk('tEXt', 'Software\0test'), chunk('iTXt', itxtData('Comment', new TextEncoder().encode('hi')))]);
    const out = await embed(png);
    expect(splitChunks(out).map(c => c.type)).toEqual(expect.arrayContaining(['tEXt', 'iTXt']));
    expect(splitChunks(out).filter(c => c.type === 'iTXt')).toHaveLength(2);
    expect(await extractSnapshotText(out)).toEqual({ok: true, text: TEXT});
  });

  it('accepts text exactly at the decompressed cap and refuses one byte more', async () => {
    const atCap = 'a'.repeat(SNAPSHOT_PNG_LIMITS.maxTextBytes);
    const png = await embed(makePng(), atCap);
    const read = await extractSnapshotText(png);
    expect(read.ok && read.text.length).toBe(atCap.length);

    expect(await embedSnapshotText(makePng(), `${atCap}a`)).toEqual({ok: false, reason: 'text-too-large'});
    // A file written by another tool with one byte too many is refused when read.
    const tooLong = insertBeforeIend(makePng(), [snapshotChunk(`${atCap}a`)]);
    expect(await extractSnapshotText(tooLong)).toEqual({ok: false, reason: 'text-too-large'});
  });

  it('counts the cap in UTF-8 bytes', async () => {
    const emoji = '🧪'.repeat(SNAPSHOT_PNG_LIMITS.maxTextBytes / 4);
    expect((await embedSnapshotText(makePng(), emoji)).ok).toBe(true);
    expect(await embedSnapshotText(makePng(), `${emoji}a`)).toEqual({ok: false, reason: 'text-too-large'});
  });

  it('reads an uncompressed snapshot chunk written by another tool', async () => {
    const png = insertBeforeIend(makePng(), [snapshotChunk(TEXT, {compressed: false, language: 'en', translated: 'OpenTierBoy'})]);
    expect(await extractSnapshotText(png)).toEqual({ok: true, text: TEXT});
  });
});

describe('extractSnapshotText refuses bad files', () => {
  it('reports no-snapshot for a valid PNG without the chunk', async () => {
    expect(await extractSnapshotText(makePng())).toEqual({ok: false, reason: 'no-snapshot'});
  });

  it('ignores text chunks with another keyword or another chunk type', async () => {
    const png = insertBeforeIend(makePng(), [
      chunk('iTXt', itxtData('opentierboy2', new TextEncoder().encode(TEXT))),
      chunk('iTXt', itxtData('opentierbo', new TextEncoder().encode(TEXT))),
      chunk('tEXt', `${SNAPSHOT_KEYWORD}\0${TEXT}`),
      chunk('zTXt', concat([new TextEncoder().encode(`${SNAPSHOT_KEYWORD}\0\0`), new Uint8Array(zlib.deflateSync(TEXT))])),
      chunk('iTXt', 'no terminator at all'),
    ]);
    expect(await extractSnapshotText(png)).toEqual({ok: false, reason: 'no-snapshot'});
  });

  it('refuses bytes that are not a PNG', async () => {
    const samples = [
      new Uint8Array(),
      Uint8Array.from([0x89, 0x50, 0x4e]),
      new TextEncoder().encode('hello, this is not a picture'),
      Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]),
      new TextEncoder().encode('GIF89a\x01\x00\x01\x00'),
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      Uint8Array.from({length: 1000}, (_, i) => (i * 7919) & 0xff),
    ];
    for (const bytes of samples) {
      expect(await extractSnapshotText(bytes)).toEqual({ok: false, reason: 'not-png'});
    }
  });

  it('refuses a bad CRC in any chunk', async () => {
    const png = await embed(makePng());
    for (const {type, dataStart, crcStart} of chunkOffsets(png)) {
      const badData = png.slice();
      if (crcStart > dataStart) {
        badData[dataStart] ^= 0x01;
        expect(await extractSnapshotText(badData), `data of ${type}`).toEqual({ok: false, reason: 'bad-crc'});
      }
      const badCrc = png.slice();
      badCrc[crcStart + 3] ^= 0x80;
      expect(await extractSnapshotText(badCrc), `CRC of ${type}`).toEqual({ok: false, reason: 'bad-crc'});
    }
  });

  it('refuses a truncated file at every length', async () => {
    const png = await embed(makePng());
    for (let length = 8; length < png.length; length++) {
      const result = await extractSnapshotText(png.subarray(0, length));
      expect(result, `length ${length}`).toEqual({ok: false, reason: 'truncated'});
    }
    expect(await extractSnapshotText(png.subarray(0, 5))).toEqual({ok: false, reason: 'not-png'});
  });

  it('refuses a chunk with a huge declared length without reading it', async () => {
    const png = await embed(makePng());
    const ihdr = chunkOffsets(png)[1];
    for (const length of [0xffffffff, 0x80000000, 0x7fffffff, SNAPSHOT_PNG_LIMITS.maxChunkBytes + 1]) {
      const bad = png.slice();
      new DataView(bad.buffer).setUint32(ihdr.start, length);
      expect(await extractSnapshotText(bad), `length ${length}`).toEqual({ok: false, reason: 'chunk-too-large'});
    }
    const bad = png.slice();
    new DataView(bad.buffer).setUint32(ihdr.start, 1_000_000);
    expect(await extractSnapshotText(bad)).toEqual({ok: false, reason: 'truncated'});
  });

  it('stops a decompression bomb at the cap', async () => {
    // 64 MiB of zeros compress to about 64 KB.
    const bomb = new Uint8Array(zlib.deflateSync(Buffer.alloc(64 * MiB)));
    expect(bomb.length).toBeLessThan(100_000);
    const png = insertBeforeIend(makePng(), [
      chunk('iTXt', concat([new TextEncoder().encode(`${SNAPSHOT_KEYWORD}\0`), Uint8Array.from([1, 0, 0, 0]), bomb])),
    ]);

    const RealDecompressionStream = globalThis.DecompressionStream;
    let largestWrite = 0;
    let produced = 0;
    // A constructor function that returns an object: `new` gives back that object.
    function CountingDecompressionStream(format: CompressionFormat): ReadableWritablePair<Uint8Array, BufferSource> {
      const real = new RealDecompressionStream(format);
      const input = new TransformStream<BufferSource, BufferSource>({
        transform(piece, controller) {
          largestWrite = Math.max(largestWrite, (piece as Uint8Array).byteLength);
          controller.enqueue(piece);
        },
      });
      input.readable.pipeTo(real.writable).catch(() => undefined);
      return {
        writable: input.writable,
        readable: real.readable.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(piece, controller) {
              produced += piece.byteLength;
              controller.enqueue(piece);
            },
          }),
        ),
      };
    }
    vi.stubGlobal('DecompressionStream', CountingDecompressionStream);

    const started = performance.now();
    expect(await extractSnapshotText(png)).toEqual({ok: false, reason: 'text-too-large'});
    expect(performance.now() - started).toBeLessThan(10_000);
    // The decompressor gets small slices, so a browser never expands more than ~4 MB at once.
    expect(largestWrite).toBeGreaterThan(0);
    expect(largestWrite).toBeLessThanOrEqual(INFLATE_INPUT_SLICE_BYTES);
    expect(produced).toBeLessThan(SNAPSHOT_PNG_LIMITS.maxTextBytes + 8 * MiB);
  });

  it('accepts many small chunks up to the chunk limit and refuses more', async () => {
    const base = makePng(2, 2);
    const baseCount = splitChunks(base).length;
    const filler = (n: number) => Array.from({length: n}, (_, i) => chunk('teSt', [i & 0xff]));

    const atLimit = insertBeforeIend(base, [...filler(SNAPSHOT_PNG_LIMITS.maxChunks - baseCount - 1), snapshotChunk(TEXT)]);
    expect(await extractSnapshotText(atLimit)).toEqual({ok: true, text: TEXT});

    const overLimit = insertBeforeIend(base, [...filler(SNAPSHOT_PNG_LIMITS.maxChunks - baseCount), snapshotChunk(TEXT)]);
    expect(await extractSnapshotText(overLimit)).toEqual({ok: false, reason: 'too-many-chunks'});
    // Writing never produces a file that reading refuses.
    expect(await embedSnapshotText(insertBeforeIend(base, filler(SNAPSHOT_PNG_LIMITS.maxChunks - baseCount)), TEXT)).toEqual({
      ok: false,
      reason: 'too-many-chunks',
    });
  });

  it('refuses a file over the size limit', async () => {
    const big = new Uint8Array(SNAPSHOT_PNG_LIMITS.maxFileBytes + 1);
    big.set(SIGNATURE);
    expect(await extractSnapshotText(big)).toEqual({ok: false, reason: 'file-too-large'});
  });

  it('refuses a broken chunk layout', async () => {
    const png = makePng();
    const chunks = splitChunks(png);
    const ihdr = chunks[0];
    const iend = chunks[chunks.length - 1];
    const idat = chunks.filter(c => c.type === 'IDAT');
    const layouts: Record<string, Uint8Array> = {
      'IHDR not first': assemble([...idat, ihdr, iend]),
      'IHDR of the wrong size': assemble([chunk('IHDR', [1, 2, 3]), ...idat, iend]),
      'bytes after IEND': concat([png, Uint8Array.from([0])]),
      'IEND with data': assemble([ihdr, ...idat, chunk('IEND', [1])]),
      'chunk type with a digit': assemble([ihdr, chunk('te5t', [1]), ...idat, iend]),
      'chunk type with a space': assemble([ihdr, chunk('te t', [1]), ...idat, iend]),
    };
    for (const [name, bytes] of Object.entries(layouts)) {
      expect(await extractSnapshotText(bytes), name).toEqual({ok: false, reason: 'bad-structure'});
    }
    expect(await extractSnapshotText(assemble([ihdr, ...idat])), 'no IEND').toEqual({ok: false, reason: 'truncated'});
  });

  it('refuses two snapshot chunks', async () => {
    const png = insertBeforeIend(makePng(), [snapshotChunk('one'), snapshotChunk('two')]);
    expect(await extractSnapshotText(png)).toEqual({ok: false, reason: 'duplicate-snapshot'});
  });

  it('refuses a malformed snapshot chunk', async () => {
    const keyword = new TextEncoder().encode(`${SNAPSHOT_KEYWORD}\0`);
    const text = new TextEncoder().encode(TEXT);
    const bad: Record<string, Uint8Array> = {
      'no flags': keyword,
      'only the flag': concat([keyword, Uint8Array.from([1])]),
      'unknown compression flag': concat([keyword, Uint8Array.from([2, 0, 0, 0]), text]),
      'unknown compression method': itxtData(SNAPSHOT_KEYWORD, text, {method: 1}),
      'no language terminator': concat([keyword, Uint8Array.from([0, 0]), new TextEncoder().encode('en')]),
      'no translated keyword terminator': concat([keyword, Uint8Array.from([0, 0, 0]), new TextEncoder().encode('x')]),
    };
    for (const [name, data] of Object.entries(bad)) {
      expect(await extractSnapshotText(insertBeforeIend(makePng(), [chunk('iTXt', data)])), name).toEqual({
        ok: false,
        reason: 'bad-snapshot-chunk',
      });
    }
  });

  it('refuses damaged compressed text', async () => {
    const keywordAndFlags = concat([new TextEncoder().encode(`${SNAPSHOT_KEYWORD}\0`), Uint8Array.from([1, 0, 0, 0])]);
    const good = new Uint8Array(zlib.deflateSync(TEXT));
    const badChecksum = good.slice();
    badChecksum[badChecksum.length - 1] ^= 0xff;
    const damaged: Record<string, Uint8Array> = {
      empty: new Uint8Array(),
      garbage: new TextEncoder().encode('this is not zlib data'),
      truncated: good.subarray(0, good.length - 6),
      'bad checksum': badChecksum,
      'bytes after the end': concat([good, Uint8Array.from([1, 2, 3])]),
      'raw deflate without zlib header': new Uint8Array(zlib.deflateRawSync(TEXT)),
      gzip: new Uint8Array(zlib.gzipSync(TEXT)),
    };
    for (const [name, data] of Object.entries(damaged)) {
      const png = insertBeforeIend(makePng(), [chunk('iTXt', concat([keywordAndFlags, data]))]);
      expect(await extractSnapshotText(png), name).toEqual({ok: false, reason: 'bad-compression'});
    }
  });

  it('refuses text that is not UTF-8', async () => {
    for (const bytes of [Uint8Array.from([0x7b, 0xff, 0x7d]), Uint8Array.from([0xc3]), Uint8Array.from([0xed, 0xa0, 0x80])]) {
      for (const compressed of [true, false]) {
        const png = insertBeforeIend(makePng(), [snapshotChunk(bytes, {compressed})]);
        expect(await extractSnapshotText(png)).toEqual({ok: false, reason: 'bad-utf8'});
      }
    }
  });

  it('refuses an uncompressed text over the cap', async () => {
    const png = insertBeforeIend(makePng(), [snapshotChunk(new Uint8Array(SNAPSHOT_PNG_LIMITS.maxTextBytes + 1).fill(0x61), {compressed: false})]);
    expect(await extractSnapshotText(png)).toEqual({ok: false, reason: 'text-too-large'});
  });

  it('refuses a snapshot chunk over its own size cap', async () => {
    const size = SNAPSHOT_PNG_LIMITS.maxTextChunkBytes;
    const png = insertBeforeIend(makePng(), [snapshotChunk(new Uint8Array(size).fill(0x61), {compressed: false})]);
    expect(await extractSnapshotText(png)).toEqual({ok: false, reason: 'bad-snapshot-chunk'});
  });

  it('reports unsupported when the browser cannot decompress', async () => {
    const png = await embed(makePng());
    vi.stubGlobal('DecompressionStream', undefined);
    expect(await extractSnapshotText(png)).toEqual({ok: false, reason: 'unsupported'});
  });
});

describe('embedSnapshotText refuses bad input', () => {
  it('refuses input that is not a valid PNG', async () => {
    expect(await embedSnapshotText(new TextEncoder().encode('nope'), TEXT)).toEqual({ok: false, reason: 'not-png'});
    const png = makePng();
    expect(await embedSnapshotText(png.subarray(0, png.length - 3), TEXT)).toEqual({ok: false, reason: 'truncated'});
    const bad = png.slice();
    bad[20] ^= 1;
    expect(await embedSnapshotText(bad, TEXT)).toEqual({ok: false, reason: 'bad-crc'});
  });

  it('refuses to write a file over the size limit', async () => {
    const chunks = splitChunks(makePng());
    // Fills the file to 50 bytes under the limit with a private chunk.
    const used = SIGNATURE.length + chunks.reduce((sum, c) => sum + 12 + c.data.length, 0) + 12;
    const filler = chunk('fiLl', new Uint8Array(SNAPSHOT_PNG_LIMITS.maxFileBytes - used - 50));
    const nearlyFull = assemble([chunks[0], filler, ...chunks.slice(1)]);
    expect(nearlyFull.length).toBe(SNAPSHOT_PNG_LIMITS.maxFileBytes - 50);
    expect(await extractSnapshotText(nearlyFull)).toEqual({ok: false, reason: 'no-snapshot'});
    expect(await embedSnapshotText(nearlyFull, TEXT)).toEqual({ok: false, reason: 'file-too-large'});
  });

  it('reports unsupported when the browser cannot compress', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    expect(await embedSnapshotText(makePng(), TEXT)).toEqual({ok: false, reason: 'unsupported'});
  });
});
