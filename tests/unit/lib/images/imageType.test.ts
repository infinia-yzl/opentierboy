import {describe, expect, it} from 'vitest';
import {isIsoMediaFile, readImageSize, sniffImageType} from '@/lib/images/imageType';
import {IMAGE_SIZE_SEARCH_BYTES} from '@/lib/snapshot/payload';
import {avifWithFalseSize, heicStart} from '../../support/avif';
import {gifHeader, jpegHeader, pngHeader, webpHeader} from '../../support/image-headers';
import {makePng} from '../../support/png-helpers';

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)));

// The smallest headers each format needs.
const HEADERS = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  gif: [...'GIF89a'].map(c => c.charCodeAt(0)),
  webp: [...'RIFF\0\0\0\0WEBPVP8 '].map(c => c.charCodeAt(0)),
  avif: [0, 0, 0, 0x1c, ...'ftypavif\0\0\0\0avifmif1miaf'].map(c => (typeof c === 'number' ? c : c.charCodeAt(0))),
};

/** A header padded to 32 bytes. */
function padded(header: number[], size = 32, fill = 7): Uint8Array {
  const out = new Uint8Array(Math.max(size, header.length)).fill(fill);
  out.set(header);
  return out;
}

describe('sniffImageType', () => {
  it('returns the image type when the first bytes are a PNG, JPEG, GIF, WebP or AVIF header', () => {
    expect(sniffImageType(padded(HEADERS.png))).toBe('image/png');
    expect(sniffImageType(padded(HEADERS.jpeg))).toBe('image/jpeg');
    expect(sniffImageType(padded(HEADERS.gif))).toBe('image/gif');
    expect(sniffImageType(padded([...'GIF87a'].map(c => c.charCodeAt(0))))).toBe('image/gif');
    expect(sniffImageType(padded(HEADERS.webp))).toBe('image/webp');
    expect(sniffImageType(padded(HEADERS.avif))).toBe('image/avif');
    // AVIF listed as a compatible brand after another major brand.
    const mif1 = [0, 0, 0, 0x20, ...[...'ftypmif1\0\0\0\0mif1miafMA1Bavif'].map(c => c.charCodeAt(0))];
    expect(sniffImageType(bytes(mif1))).toBe('image/avif');
  });

  it('returns null when the bytes are SVG, HTML, HEIC, another format or shorter than a header', () => {
    const text = (value: string) => new TextEncoder().encode(value.padEnd(32, ' '));
    expect(sniffImageType(text('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(text('<?xml version="1.0"?><svg>'))).toBeNull();
    expect(sniffImageType(text('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageType(text('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(padded([0, 0, 0, 0x18, ...[...'ftypheic\0\0\0\0mif1heic'].map(c => c.charCodeAt(0))]))).toBeNull();
    // "avif" as the minor version field is not a brand.
    expect(sniffImageType(padded([0, 0, 0, 0x14, ...[...'ftypmif1avifmif1'].map(c => c.charCodeAt(0))]))).toBeNull();
    expect(sniffImageType(padded([...'RIFF\0\0\0\0WAVE'].map(c => c.charCodeAt(0))))).toBeNull();
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('readImageSize', () => {
  it('returns the width and height when the bytes are a PNG, GIF, WebP (VP8, VP8L, VP8X) or JPEG header', () => {
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], 'IHDR', [0, 0, 0x01, 0x2c, 0, 0, 0, 0xc8, 8, 6, 0, 0, 0]);
    expect(readImageSize(png)).toEqual({width: 300, height: 200});
    // GIF: the logical screen, then (without a colour table) the first frame's image descriptor.
    const frame = (left: number, top: number, width: number, height: number) =>
      [0x2c, left & 255, left >> 8, top & 255, top >> 8, width & 255, width >> 8, height & 255, height >> 8, 0];
    expect(readImageSize(bytes('GIF89a', [0x40, 0x01, 0xf0, 0x00, 0, 0, 0], frame(0, 0, 320, 240)))).toEqual({width: 320, height: 240});
    const vp8 = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x80, 0x02, 0xe0, 0x01]);
    expect(readImageSize(vp8)).toEqual({width: 640, height: 480});
    // VP8L: width-1 and height-1 in 14 bits each, after the 0x2f signature byte.
    const lossless = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8L', [0, 0, 0, 0, 0x2f], [99, 0xc0, 0x18, 0x00]);
    expect(readImageSize(lossless)).toEqual({width: 100, height: 100});
    const extended = bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8X', [0, 0, 0, 0, 0, 0, 0, 0], [0xff, 0x0f, 0, 0xff, 0x07, 0]);
    expect(readImageSize(extended)).toEqual({width: 4096, height: 2048});
    // JPEG: an APP0 segment, then the frame header (SOF0) with the height before the width.
    const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], 'JFIF', new Array(10).fill(0), [0xff, 0xc0, 0, 17, 8, 0x04, 0x38, 0x07, 0x80, 3, 0, 0, 0]);
    expect(sniffImageType(jpeg)).toBe('image/jpeg');
    expect(readImageSize(jpeg)).toEqual({width: 1920, height: 1080});
    // The 688-byte PNG of the review that declares 12,000 x 12,000 pixels.
    const bomb = new Uint8Array(688);
    bomb.set(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], 'IHDR', [0, 0, 0x2e, 0xe0, 0, 0, 0x2e, 0xe0, 8, 6, 0, 0, 0]));
    expect(readImageSize(bomb)).toEqual({width: 12_000, height: 12_000});
  });

  it('returns the screen enlarged to the first frame when a GIF frame lies past it, after a colour table and extensions', () => {
    const frame = (left: number, top: number, width: number, height: number) =>
      [0x2c, left & 255, left >> 8, top & 255, top >> 8, width & 255, width >> 8, height & 255, height >> 8, 0];
    // A 1 x 1 screen with a 10,000 x 10,000 first frame: Chrome decodes it at the frame's size.
    expect(readImageSize(bytes('GIF89a', [1, 0, 1, 0, 0, 0, 0], frame(0, 0, 10_000, 10_000)))).toEqual({width: 10_000, height: 10_000});
    // A global colour table of 4 colours (flags 0x81), a graphic control extension and a
    // comment of two sub-blocks, then a frame placed at 100, 50.
    const table = new Array(12).fill(0);
    const control = [0x21, 0xf9, 4, 0, 0, 0, 0, 0];
    const comment = [0x21, 0xfe, 3, 0x61, 0x62, 0x63, 2, 0x64, 0x65, 0];
    expect(readImageSize(bytes('GIF89a', [64, 0, 32, 0, 0x81, 0, 0], table, control, comment, frame(100, 50, 64, 32))))
      .toEqual({width: 164, height: 82});
    // A frame inside the screen leaves the screen size.
    expect(readImageSize(bytes('GIF89a', [64, 0, 32, 0, 0, 0, 0], frame(8, 8, 16, 16)))).toEqual({width: 64, height: 32});
    // Cut off before the first frame, or no frame at all: the size is unknown.
    expect(readImageSize(bytes('GIF89a', [64, 0, 32, 0, 0, 0, 0], control))).toBeNull();
    expect(readImageSize(bytes('GIF89a', [64, 0, 32, 0, 0, 0, 0], [0x3b]))).toBeNull();
    expect(readImageSize(bytes('GIF89a', [1, 0, 1, 0, 0, 0, 0], [0x2c, 0, 0, 0, 0]))).toBeNull();
  });

  it('returns null when the bytes are AVIF', () => {
    const liar = avifWithFalseSize([100, 100], [9000, 9000]);
    expect(sniffImageType(liar)).toBe('image/avif');
    expect(readImageSize(liar)).toBeNull();
  });

  it('returns null when the header has no size (PNG without IHDR, JPEG without SOF, SVG, empty bytes)', () => {
    expect(readImageSize(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8, 0xff, 0xda, 0, 8], new Array(20).fill(0)))).toBeNull();
    expect(readImageSize(bytes('<svg width="99999" height="99999"/>'))).toBeNull();
    expect(readImageSize(new Uint8Array())).toBeNull();
  });
});

describe('isIsoMediaFile', () => {
  it('returns true when the bytes are AVIF or HEIC', () => {
    expect(isIsoMediaFile(avifWithFalseSize([100, 100], [9000, 9000]))).toBe(true);
    expect(isIsoMediaFile(heicStart())).toBe(true);
  });

  it('returns false when the bytes are PNG or GIF', () => {
    expect(isIsoMediaFile(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(false);
    expect(isIsoMediaFile(bytes('GIF89a'))).toBe(false);
  });
});

/** The headers that snapshot files carry (tests/unit/support/image-headers.ts). */
describe('readImageSize with snapshot image headers', () => {
  it('returns the width and height when the bytes are a snapshot PNG, GIF, JPEG or WebP header', () => {
    expect(readImageSize(makePng(17, 9))).toEqual({width: 17, height: 9});
    expect(readImageSize(pngHeader(300, 200))).toEqual({width: 300, height: 200});
    expect(readImageSize(gifHeader(64, 32))).toEqual({width: 64, height: 32});
    expect(readImageSize(jpegHeader(640, 480))).toEqual({width: 640, height: 480});
    expect(readImageSize(jpegHeader(640, 480, {sof: 0xc2, paddingBytes: 30_000}))).toEqual({width: 640, height: 480});
    expect(readImageSize(webpHeader(512, 256, 'VP8X'))).toEqual({width: 512, height: 256});
    expect(readImageSize(webpHeader(512, 256, 'VP8L'))).toEqual({width: 512, height: 256});
    expect(readImageSize(webpHeader(512, 256, 'VP8 '))).toEqual({width: 512, height: 256});
    expect(readImageSize(webpHeader(16_384, 16_384, 'VP8X'))).toEqual({width: 16_384, height: 16_384});
  });

  it('returns null when the header is cut off, has no size or is not a raster type', () => {
    expect(readImageSize(new Uint8Array())).toBeNull();
    expect(readImageSize(pngHeader(10, 10).subarray(0, 20))).toBeNull();
    // A JPEG cut off before its size, or with image data before any size.
    expect(readImageSize(jpegHeader(10, 10, {paddingBytes: 70_000}).subarray(0, IMAGE_SIZE_SEARCH_BYTES))).toBeNull();
    expect(readImageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 4, 0, 0]))).toBeNull();
    expect(readImageSize(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(readImageSize(Uint8Array.from([0xff, 0xd8, 0x00, 0x00, 0x00]))).toBeNull();
    expect(readImageSize(new TextEncoder().encode('RIFF\0\0\0\0WEBPABCD' + '\0'.repeat(20)))).toBeNull();
    expect(readImageSize(new TextEncoder().encode('<svg width="10" height="10"/>'))).toBeNull();
  });
});
