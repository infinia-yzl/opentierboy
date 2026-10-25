import {describe, expect, it} from 'vitest';
import {readImageSize, sniffImageType} from '@/lib/images/imageType';

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)));

describe('readImageSize', () => {
  it('reads PNG, GIF, WebP and JPEG headers', () => {
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

  it('enlarges a GIF to its first frame, past a colour table and extensions', () => {
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

  it('reads the largest "ispe" size of an AVIF file', () => {
    const u32 = (value: number) => [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
    const ispe = (width: number, height: number) => [...u32(20), ...'ispe'.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...u32(width), ...u32(height)];
    const ftyp = bytes(u32(24), 'ftypavif', [0, 0, 0, 0], 'mif1avif');
    expect(sniffImageType(ftyp)).toBe('image/avif');
    // meta > iprp > ipco with a thumbnail and the main picture, in any order.
    const avif = Uint8Array.from([...ftyp, ...bytes(u32(60), 'meta', [0, 0, 0, 0]), ...ispe(160, 90), ...ispe(12_000, 9_000)]);
    expect(readImageSize(avif)).toEqual({width: 12_000, height: 9_000});
    expect(readImageSize(ftyp)).toBeNull();
    // An "ispe" that is not a 20-byte box is not one.
    expect(readImageSize(Uint8Array.from([...ftyp, 0, 0, 0, 9, ...'ispe'.split('').map((c) => c.charCodeAt(0)), ...new Array(12).fill(1)]))).toBeNull();
  });

  it('gives null when the header does not tell', () => {
    expect(readImageSize(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8, 0xff, 0xda, 0, 8], new Array(20).fill(0)))).toBeNull();
    expect(readImageSize(bytes('<svg width="99999" height="99999"/>'))).toBeNull();
    expect(readImageSize(new Uint8Array())).toBeNull();
  });
});
