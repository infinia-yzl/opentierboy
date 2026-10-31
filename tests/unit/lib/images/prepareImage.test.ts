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
  it('returns a WebP drawn at maxSide when alwaysReencode is true and the store accepts the file (snapshot images)', async () => {
    const file = fileOf('image/png', 1000);
    const {decode, release} = decodeAs(1000, 500);
    const {createCanvas, drawn} = fakeCanvas(() => 800);
    const result = await prepareImageForStore(file, {maxBytes: 5000, maxSide: 512, alwaysReencode: true, decode, createCanvas});
    expect(result).toMatchObject({ok: true, type: 'image/webp', reencoded: true});
    expect(result.ok && result.blob.type).toBe('image/webp');
    expect(drawn[0]).toEqual({width: 512, height: 256});
    expect(release).toHaveBeenCalledOnce();
  });

  it('returns the file\'s bytes unchanged, after one decode, when the store accepts the file', async () => {
    const file = fileOf('image/png', 1000);
    const {decode, release} = decodeAs(10, 10);
    const result = await prepareImageForStore(file, {maxBytes: 5000, decode});
    expect(result).toMatchObject({ok: true, type: 'image/png', reencoded: false});
    expect(result.ok && new Uint8Array(await result.blob.arrayBuffer())).toEqual(new Uint8Array(await file.arrayBuffer()));
    expect(decode).toHaveBeenCalledTimes(1);
    expect(decode.mock.calls[0][1]).toMatchObject({type: 'image/png'});
    expect(release).toHaveBeenCalled();
  });

  it('returns a Blob of the sniffed type when the browser reports another type', async () => {
    // A PNG named evil.html, with a script after the picture: the browser reports text/html.
    const evil = new Blob([await fileOf('image/png', 100).arrayBuffer(), '<script>alert(1)</script>'], {type: 'text/html'});
    const {decode} = decodeAs(10, 10);
    const result = await prepareImageForStore(evil, {maxBytes: 5000, decode});
    expect(result).toMatchObject({ok: true, type: 'image/png', reencoded: false});
    expect(result.ok && result.blob.type).toBe('image/png');
    expect(decode.mock.calls[0][1]).toMatchObject({type: 'image/png'});
  });

  it('returns reason \'unsupported-type\', without decoding, when the bytes and the type name no image', async () => {
    const {decode} = decodeAs(10, 10);
    expect(await prepareImageForStore(new Blob(['<html><script>alert(1)</script>'], {type: 'text/html'}), {maxBytes: 5000, decode}))
      .toEqual({ok: false, reason: 'unsupported-type'});
    expect(await prepareImageForStore(new Blob(['just text']), {maxBytes: 5000, decode})).toEqual({ok: false, reason: 'unsupported-type'});
    expect(decode).not.toHaveBeenCalled();
  });

  it('returns reason \'too-many-pixels\', without decoding, when the PNG header declares 50,000 × 50,000 pixels', async () => {
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

  it('returns reason \'avif-heic\', without decoding, when the file is AVIF or HEIC', async () => {
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
    }
    expect(decode).not.toHaveBeenCalled();
  });

  it('returns reason \'too-many-pixels\' within 500 ms, without decoding, when a 688-byte PNG declares 12,000 × 12,000 pixels', async () => {
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

  it('returns reason \'too-many-pixels\' when the decoder\'s hints.fits refuses the natural size', async () => {
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

  it('returns reason \'too-many-pixels\' when the decoded size is over 8,192 px per side or 32 megapixels', async () => {
    const file = fileOf('image/png', 1000);
    for (const [width, height] of [[8193, 10], [10, 8193], [8192, 4097]]) {
      const {decode, release} = decodeAs(width, height);
      expect(await prepareImageForStore(file, {maxBytes: 5000, decode}), `${width}x${height}`).toEqual({ok: false, reason: 'too-many-pixels'});
      expect(release).toHaveBeenCalled();
    }
    const {decode} = decodeAs(8192, 4096);
    expect(await prepareImageForStore(file, {maxBytes: 5000, decode})).toMatchObject({ok: true});
  });

  it('returns a WebP at most 2,048 px on the longest side when the file is another format', async () => {
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="4096" height="1024"><script>alert(1)</script></svg>'], {type: 'image/svg+xml'});
    const {decode, release} = decodeAs(4096, 1024);
    const {createCanvas, drawn} = fakeCanvas(() => 2000);
    const result = await prepareImageForStore(svg, {maxBytes: 5000, decode, createCanvas});
    expect(result).toMatchObject({ok: true, reencoded: true});
    expect(result.ok && result.blob.type).toBe('image/webp');
    expect(drawn[0]).toEqual({width: 2048, height: 512});
    expect(release).toHaveBeenCalled();
  });

  it('returns a PNG when the browser cannot write WebP, and a JPEG when the PNG is over maxBytes', async () => {
    const big = fileOf('image/png', 9000);
    const {decode} = decodeAs(1000, 1000);
    const noWebp = fakeCanvas((type) => (type === 'image/png' ? 3000 : 1000), ['image/jpeg']);
    expect(await prepareImageForStore(big, {maxBytes: 5000, decode, createCanvas: noWebp.createCanvas}))
      .toMatchObject({ok: true, blob: {type: 'image/png'}, reencoded: true});
    const tooBigPng = fakeCanvas((type) => (type === 'image/jpeg' ? 4000 : 8000));
    expect(await prepareImageForStore(big, {maxBytes: 5000, decode, createCanvas: tooBigPng.createCanvas}))
      .toMatchObject({ok: true, blob: {type: 'image/jpeg'}});
  });

  it('returns the image at half size when the full size is over maxBytes, and reason \'too-large\' when half is too', async () => {
    const big = fileOf('image/jpeg', 9000);
    const {decode} = decodeAs(4000, 3000);
    const halfFits = fakeCanvas((type, width) => (width > 1024 ? 9000 : 4000));
    const result = await prepareImageForStore(big, {maxBytes: 5000, decode, createCanvas: halfFits.createCanvas});
    expect(result).toMatchObject({ok: true, reencoded: true});
    expect(halfFits.drawn.at(-1)).toEqual({width: 1024, height: 768});
    const never = fakeCanvas(() => 9000);
    expect(await prepareImageForStore(big, {maxBytes: 5000, decode, createCanvas: never.createCanvas})).toEqual({ok: false, reason: 'too-large'});
  });

  it('returns reason \'empty\', \'unreadable\' or \'too-large\' when the file is empty, cannot decode or is over maxInputBytes', async () => {
    const {decode} = decodeAs(10, 10);
    expect(await prepareImageForStore(new Blob([]), {maxBytes: 5000, decode})).toEqual({ok: false, reason: 'empty'});
    const failing = vi.fn(async () => {
      throw new Error('cannot decode');
    });
    expect(await prepareImageForStore(new Blob(['not a picture'], {type: 'image/png'}), {maxBytes: 5000, decode: failing})).toEqual({ok: false, reason: 'unreadable'});
    expect(await prepareImageForStore(fileOf('image/png', 2000), {maxBytes: 1000, maxInputBytes: 1500, decode})).toEqual({ok: false, reason: 'too-large'});
    expect(decode).not.toHaveBeenCalled();
  });

  it('returns reason \'too-large\' when the canvas writes bytes that are not an image', async () => {
    const {decode} = decodeAs(10, 10);
    const createCanvas = (): CanvasLike => ({
      width: 0, height: 0,
      getContext: () => ({drawImage: () => undefined, fillRect: () => undefined, fillStyle: ''}),
      toBlob: (callback) => callback(new Blob(['not an image'])),
    });
    expect(await prepareImageForStore(new Blob(['<svg/>'], {type: 'image/svg+xml'}), {maxBytes: 5000, decode, createCanvas})).toEqual({ok: false, reason: 'too-large'});
  });
});

describe('asRasterImage', () => {
  it('returns a Blob of the sniffed type when the bytes are a PNG reported as text/html', async () => {
    const evil = new Blob([await fileOf('image/png', 100).arrayBuffer(), '<script>alert(1)</script>'], {type: 'text/html'});
    const raster = await asRasterImage(evil);
    expect(raster?.type).toBe('image/png');
    expect(raster?.blob.type).toBe('image/png');
    expect(raster?.blob.size).toBe(evil.size);
  });

  it('returns null when the bytes are SVG or empty', async () => {
    expect(await asRasterImage(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], {type: 'image/svg+xml'}))).toBeNull();
    expect(await asRasterImage(new Blob([]))).toBeNull();
  });
});

describe('previewableImage', () => {
  /** A PNG header that declares this size, followed by markup. */
  const png = (width: number, height: number, type = 'image/png') => {
    const bytes = new Uint8Array(100);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(bytes.buffer).setUint32(16, width);
    new DataView(bytes.buffer).setUint32(20, height);
    return new Blob([bytes, '<script>alert(1)</script>'], {type});
  };

  it('returns a Blob of the sniffed type when the header declares a size within the caps', async () => {
    const preview = await previewableImage(png(300, 200, 'text/html'));
    expect(preview?.type).toBe('image/png');
    expect(preview?.blob.type).toBe('image/png');
  });

  it('returns null when the header declares a size over the caps', async () => {
    expect(await previewableImage(png(12_000, 12_000))).toBeNull();
    expect(await previewableImage(png(8192, 4097))).toBeNull();
  });

  it('returns null when the file is SVG or a PNG without IHDR', async () => {
    expect(await previewableImage(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], {type: 'image/svg+xml'}))).toBeNull();
    expect(await previewableImage(fileOf('image/png', 12))).toBeNull(); // no IHDR: the size is unknown
  });

  it('returns null when the file is AVIF or HEIC', async () => {
    const liar = avifWithFalseSize([100, 100], [9000, 9000]);
    for (const [file, label] of [
      [new Blob([liar], {type: 'image/avif'}), 'false size'],
      [new Blob([REAL_AVIF], {type: 'image/avif'}), 'a real AVIF'],
      [new Blob([heicStart()], {type: 'image/heic'}), 'HEIC'],
    ] as const) {
      expect(await previewableImage(file), label).toBeNull();
    }
  });
});

describe('pixelCapError', () => {
  it('returns a plain Error with name PixelCapError and code PIXEL_CAP when it is called', () => {
    const error = pixelCapError();
    expect(error).toBeInstanceOf(Error);
    expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
    expect(error).toMatchObject({name: 'PixelCapError', code: 'PIXEL_CAP'});
  });
});

describe('isPixelCapError', () => {
  it('returns true when the error comes from pixelCapError', () => {
    expect(isPixelCapError(pixelCapError())).toBe(true);
  });

  it('returns false when the value is another Error or a plain object with code PIXEL_CAP', () => {
    expect(isPixelCapError(new Error('other'))).toBe(false);
    expect(isPixelCapError({code: 'PIXEL_CAP'})).toBe(false);
  });
});
