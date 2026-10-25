import {describe, expect, it} from 'vitest';
import {readImageSize, sniffImageType} from '@/lib/images/imageType';

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part)));

describe('readImageSize', () => {
  it('reads PNG, GIF, WebP and JPEG headers', () => {
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13], 'IHDR', [0, 0, 0x01, 0x2c, 0, 0, 0, 0xc8, 8, 6, 0, 0, 0]);
    expect(readImageSize(png)).toEqual({width: 300, height: 200});
    expect(readImageSize(bytes('GIF89a', [0x40, 0x01, 0xf0, 0x00], new Array(10).fill(0)))).toEqual({width: 320, height: 240});
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
  });

  it('gives null when the header does not tell', () => {
    expect(readImageSize(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).toBeNull();
    expect(readImageSize(bytes([0xff, 0xd8, 0xff, 0xda, 0, 8], new Array(20).fill(0)))).toBeNull();
    expect(readImageSize(bytes('<svg width="99999" height="99999"/>'))).toBeNull();
    expect(readImageSize(new Uint8Array())).toBeNull();
  });
});
