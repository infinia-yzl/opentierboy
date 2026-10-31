import {describe, expect, it, vi} from 'vitest';
import {asRasterImage, previewableImage, type CanvasLike, type DecodedImage, type DecodeHints, isPixelCapError, pixelCapError, prepareImageForStore} from '@/lib/images/prepareImage';
import {avifWithFalseSize, heicStart} from '../../support/avif';

/** An AVIF that libavif (through sharp) wrote: 300 x 200, with an empty av1C (no sequence header there). */
const REAL_AVIF = new Uint8Array(Buffer.from('AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAD6AAEAAAAAAAAAKgAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAASwAAADIAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAybWRhdBIACgk4IeV47CAhoNIyGxIAAAAUAcV4wThbaFA3Eb0Y1metvOW8MgWzOA==', 'base64'));

type Decode = (blob: Blob, hints: DecodeHints) => Promise<DecodedImage>;

const HEADERS: Record<string, number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
  'image/webp': [...'RIFF\0\0\0\0WEBPVP8 '].map((c) => c.charCodeAt(0)),
};

function fileOf(type: string, size: number, mime = type): Blob {
  const bytes = new Uint8Array(size).fill(7);
  bytes.set(HEADERS[type] ?? []);
  return new Blob([bytes], {type: mime});
}

/** A canvas that "encodes" to a file of the size `sizeFor` gives for the type and canvas size. */
function fakeCanvas(sizeFor: (type: string, width: number, height: number) => number, writes: string[] = ['image/webp', 'image/jpeg']) {
  const drawn: {width: number; height: number}[] = [];
  const createCanvas = (): CanvasLike => {
    const canvas: CanvasLike = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => drawn.push({width: canvas.width, height: canvas.height}),
        fillRect: () => undefined,
        fillStyle: '',
      }),
      toBlob: (callback, type = 'image/png') => {
        // A browser that cannot write a type writes PNG instead.
        const written = writes.includes(type) ? type : 'image/png';
        callback(fileOf(written, sizeFor(written, canvas.width, canvas.height)));
      },
    };
    return canvas;
  };
  return {createCanvas, drawn};
}

const decodeAs = (width: number, height: number) => {
  const release = vi.fn();
  const decode = vi.fn<Decode>(async () => ({source: {} as CanvasImageSource, width, height, release}));
  return {decode, release};
};

describe('prepareImageForStore', () => {
  it('draws even an accepted file again when asked to (snapshot images)', async () => {
    const file = fileOf('image/png', 1000);
    const {decode, release} = decodeAs(1000, 500);
    const {createCanvas, drawn} = fakeCanvas(() => 800);
    const result = await prepareImageForStore(file, {maxBytes: 5000, maxSide: 512, alwaysReencode: true, decode, createCanvas});
    expect(result).toMatchObject({ok: true, type: 'image/webp', reencoded: true});
    expect(result.ok && result.blob.type).toBe('image/webp');
    expect(drawn[0]).toEqual({width: 512, height: 256});
    expect(release).toHaveBeenCalledOnce();
  });

  it('keeps a file the store accepts exactly as it is, after decoding it once', async () => {
    const file = fileOf('image/png', 1000);
    const {decode, release} = decodeAs(10, 10);
    const result = await prepareImageForStore(file, {maxBytes: 5000, decode});
    expect(result).toMatchObject({ok: true, type: 'image/png', reencoded: false});
    expect(result.ok && new Uint8Array(await result.blob.arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()));
    expect(decode).toHaveBeenCalledTimes(1);
    expect(decode.mock.calls[0][1]).toMatchObject({type: 'image/png'});
    expect(release).toHaveBeenCalled();
  });

  it('gives the kept file the type of its bytes, never the type the browser reported', async () => {
    // A PNG named evil.html, with a script after the picture: the browser reports text/html.
    const evil = new Blob([await fileOf('image/png', 100).arrayBuffer(), '<script>alert(1)</script>'], {type: 'text/html'});
    const {decode} = decodeAs(10, 10);
    const result = await prepareImageForStore(evil, {maxBytes: 5000, decode});
    expect(result).toMatchObject({ok: true, type: 'image/png', reencoded: false});
    expect(result.ok && result.blob.type).toBe('image/png');
    expect(decode.mock.calls[0][1]).toMatchObject({type: 'image/png'});
  });

  it('refuses a file that is not an image by its bytes or by its type, before decoding it', async () => {
    const {decode} = decodeAs(10, 10);
    expect(await prepareImageForStore(new Blob(['<html><script>alert(1)</script>'], {type: 'text/html'}), {maxBytes: 5000, decode}))
      .toEqual({ok: false, reason: 'unsupported-type'});
    expect(await prepareImageForStore(new Blob(['just text']), {maxBytes: 5000, decode})).toEqual({ok: false, reason: 'unsupported-type'});
    expect(decode).not.toHaveBeenCalled();
  });

  it('asRasterImage gives a blob of the sniffed type, or null', async () => {
    const evil = new Blob([await fileOf('image/png', 100).arrayBuffer(), '<script>alert(1)</script>'], {type: 'text/html'});
    const raster = await asRasterImage(evil);
    expect(raster?.type).toBe('image/png');
    expect(raster?.blob.type).toBe('image/png');
    expect(raster?.blob.size).toBe(evil.size);
    expect(await asRasterImage(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], {type: 'image/svg+xml'}))).toBeNull();
    expect(await asRasterImage(new Blob([]))).toBeNull();
  });

  it('refuses a decompression bomb from its header, without decoding it', async () => {
    // A PNG of a few bytes that declares 50,000 x 50,000 pixels (10 GB once decoded).
    const bomb = new Uint8Array(64);
    bomb.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(bomb.buffer).setUint32(16, 50_000);
    new DataView(bomb.buffer).setUint32(20, 50_000);
    bomb.set([8, 6, 0, 0, 0], 24);
    const {decode} = decodeAs(50_000, 50_000);
    expect(await prepareImageForStore(new Blob([bomb]), {maxBytes: 5_000_000, decode})).toEqual({ok: false, reason: 'too-many-pixels'});
    expect(decode).not.toHaveBeenCalled();
  });

  it('refuses AVIF and HEIC before decoding them: their declared size can lie', async () => {
    const {decode} = decodeAs(100, 100);
    // The review's file: "ispe" says 100 x 100, the AV1 data 9,000 x 9,000 (190 MB to decode).
    const liar = avifWithFalseSize([100, 100], [9000, 9000]);
    for (const [file, label] of [
      [new Blob([liar], {type: 'image/avif'}), 'false size'],
      [new Blob([liar], {type: 'text/html'}), 'false size, wrong reported type'],
      [new Blob([REAL_AVIF], {type: 'image/avif'}), 'a real AVIF'],
      [new Blob([heicStart()], {type: 'image/heic'}), 'HEIC'],
      [new Blob(['not even ISO media'], {type: 'image/avif'}), 'reported as AVIF'],
      [new Blob(['not even ISO media'], {type: 'image/heif'}), 'reported as HEIF'],
    ] as const) {
      expect(await prepareImageForStore(file, {maxBytes: 5_000_000, decode}), label).toEqual({ok: false, reason: 'avif-heic'});
      expect(await previewableImage(file), label).toBeNull();
    }
    expect(decode).not.toHaveBeenCalled();
  });

  it('makes pixel cap errors as plain errors with a code', () => {
    const error = pixelCapError();
    expect(error).toBeInstanceOf(Error);
    expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
    expect(error).toMatchObject({name: 'PixelCapError', code: 'PIXEL_CAP'});
    expect(isPixelCapError(error)).toBe(true);
    expect(isPixelCapError(new Error('other'))).toBe(false);
    expect(isPixelCapError({code: 'PIXEL_CAP'})).toBe(false);
  });

  it('previews only raster images whose header declares a size within the caps', async () => {
    const png = (width: number, height: number, type = 'image/png') => {
      const bytes = new Uint8Array(100);
      bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
      new DataView(bytes.buffer).setUint32(16, width);
      new DataView(bytes.buffer).setUint32(20, height);
      return new Blob([bytes, '<script>alert(1)</script>'], {type});
    };
    const preview = await previewableImage(png(300, 200, 'text/html'));
    expect(preview?.type).toBe('image/png');
    expect(preview?.blob.type).toBe('image/png');
    expect(await previewableImage(png(12_000, 12_000))).toBeNull();
    expect(await previewableImage(png(8192, 4097))).toBeNull();
    expect(await previewableImage(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], {type: 'image/svg+xml'}))).toBeNull();
    expect(await previewableImage(fileOf('image/png', 12))).toBeNull(); // no IHDR: the size is unknown
  });

  it('refuses a 688-byte PNG that declares 12,000 x 12,000 pixels quickly, without decoding it', async () => {
    // Decoding such a file takes seconds and about 1.5 GB in a browser.
    const bomb = new Uint8Array(688);
    bomb.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(bomb.buffer).setUint32(16, 12_000);
    new DataView(bomb.buffer).setUint32(20, 12_000);
    bomb.set([8, 6, 0, 0, 0], 24);
    const {decode} = decodeAs(12_000, 12_000);
    const started = performance.now();
    expect(await prepareImageForStore(new Blob([bomb], {type: 'image/png'}), {maxBytes: 5_000_000, decode})).toEqual({ok: false, reason: 'too-many-pixels'});
    expect(performance.now() - started).toBeLessThan(500);
    expect(decode).not.toHaveBeenCalled();
  });

  it('lets the decoder refuse an image above the caps from its natural size, before it decodes the pixels', async () => {
    // An SVG has no header size: the Image element tells its size once it has loaded.
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000"/>'], {type: 'image/svg+xml'});
    const decode = vi.fn<Decode>(async (_blob, hints) => {
      expect(hints.type).toBeNull();
      expect(hints.fits({width: 8192, height: 4096})).toBe(true);
      if (!hints.fits({width: 20_000, height: 20_000})) throw pixelCapError();
      throw new Error('decoded a huge image');
    });
    expect(await prepareImageForStore(svg, {maxBytes: 5000, decode})).toEqual({ok: false, reason: 'too-many-pixels'});
  });

  it('refuses images over 8,192 pixels per side or 32 megapixels, also when the header does not tell', async () => {
    const file = fileOf('image/png', 1000);
    for (const [width, height] of [[8193, 10], [10, 8193], [8192, 4097]]) {
      const {decode, release} = decodeAs(width, height);
      expect(await prepareImageForStore(file, {maxBytes: 5000, decode}), `${width}x${height}`).toEqual({ok: false, reason: 'too-many-pixels'});
      expect(release).toHaveBeenCalled();
    }
    const {decode} = decodeAs(8192, 4096);
    expect(await prepareImageForStore(file, {maxBytes: 5000, decode})).toMatchObject({ok: true});
  });

  it('draws other formats again as WebP, at most 2,048 pixels on the longest side', async () => {
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="1024"><script>alert(1)</script></svg>'], {type: 'image/svg+xml'});
    const {decode, release} = decodeAs(4096, 1024);
    const {createCanvas, drawn} = fakeCanvas(() => 2000);
    const result = await prepareImageForStore(svg, {maxBytes: 5000, decode, createCanvas});
    expect(result).toMatchObject({ok: true, reencoded: true});
    expect(result.ok && result.blob.type).toBe('image/webp');
    expect(drawn[0]).toEqual({width: 2048, height: 512});
    expect(release).toHaveBeenCalled();
  });

  it('writes PNG where the browser cannot write WebP, and JPEG when that is still too large', async () => {
    const big = fileOf('image/png', 9000);
    const {decode} = decodeAs(1000, 1000);
    const noWebp = fakeCanvas((type) => (type === 'image/png' ? 3000 : 1000), ['image/jpeg']);
    expect(await prepareImageForStore(big, {maxBytes: 5000, decode, createCanvas: noWebp.createCanvas}))
      .toMatchObject({ok: true, blob: {type: 'image/png'}, reencoded: true});
    const tooBigPng = fakeCanvas((type) => (type === 'image/jpeg' ? 4000 : 8000));
    expect(await prepareImageForStore(big, {maxBytes: 5000, decode, createCanvas: tooBigPng.createCanvas}))
      .toMatchObject({ok: true, blob: {type: 'image/jpeg'}});
  });

  it('tries half the size before giving up', async () => {
    const big = fileOf('image/jpeg', 9000);
    const {decode} = decodeAs(4000, 3000);
    const halfFits = fakeCanvas((type, width) => (width > 1024 ? 9000 : 4000));
    const result = await prepareImageForStore(big, {maxBytes: 5000, decode, createCanvas: halfFits.createCanvas});
    expect(result).toMatchObject({ok: true, reencoded: true});
    expect(halfFits.drawn.at(-1)).toEqual({width: 1024, height: 768});
    const never = fakeCanvas(() => 9000);
    expect(await prepareImageForStore(big, {maxBytes: 5000, decode, createCanvas: never.createCanvas})).toEqual({ok: false, reason: 'too-large'});
  });

  it('refuses empty files, files it cannot decode, and huge files without decoding them', async () => {
    const {decode} = decodeAs(10, 10);
    expect(await prepareImageForStore(new Blob([]), {maxBytes: 5000, decode})).toEqual({ok: false, reason: 'empty'});
    const failing = vi.fn(async () => {
      throw new Error('cannot decode');
    });
    expect(await prepareImageForStore(new Blob(['not a picture'], {type: 'image/png'}), {maxBytes: 5000, decode: failing})).toEqual({ok: false, reason: 'unreadable'});
    expect(await prepareImageForStore(fileOf('image/png', 2000), {maxBytes: 1000, maxInputBytes: 1500, decode})).toEqual({ok: false, reason: 'too-large'});
    expect(decode).not.toHaveBeenCalled();
  });

  it('never keeps a canvas result that is not an image', async () => {
    const {decode} = decodeAs(10, 10);
    const createCanvas = (): CanvasLike => ({
      width: 0, height: 0,
      getContext: () => ({drawImage: () => undefined, fillRect: () => undefined, fillStyle: ''}),
      toBlob: (callback) => callback(new Blob(['not an image'])),
    });
    expect(await prepareImageForStore(new Blob(['<svg/>'], {type: 'image/svg+xml'}), {maxBytes: 5000, decode, createCanvas})).toEqual({ok: false, reason: 'too-large'});
  });
});
