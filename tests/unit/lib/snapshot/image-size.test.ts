import {describe, expect, it} from 'vitest';
import {readImageSize} from '@/lib/images/imageType';
import {IMAGE_SIZE_SEARCH_BYTES, parseSnapshotPayload, rasterDataUrlInfo, SNAPSHOT_PAYLOAD_LIMITS} from '@/lib/snapshot/payload';
import {dataUrlOf, gifHeader, gifWithLongComment, jpegHeader, pngHeader, webpHeader} from '../../support/imageHeaders';
import {makePng} from '../../support/pngHelpers';

/** The snapshot's cases for the shared header reader (lib/images/imageType.ts has its own too). */
describe('readImageSize with snapshot image headers', () => {
  it('reads the size from the header of every snapshot image type', () => {
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

  it('returns null when the size is unreadable', () => {
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

describe('snapshot images are refused when they declare a huge picture (image bombs)', () => {
  const {maxImageSide, maxImagePixels} = SNAPSHOT_PAYLOAD_LIMITS;

  it('accepts sizes up to 4096 x 4096 pixels', () => {
    expect(maxImagePixels).toBe(maxImageSide * maxImageSide);
    expect(rasterDataUrlInfo(dataUrlOf('image/png', pngHeader(4096, 4096)))).toEqual({type: 'image/png', width: 4096, height: 4096});
    expect(rasterDataUrlInfo(dataUrlOf('image/webp', webpHeader(512, 512)))).toMatchObject({width: 512});
    expect(rasterDataUrlInfo(dataUrlOf('image/jpeg', jpegHeader(4096, 10)))).toMatchObject({width: 4096, height: 10});
    expect(rasterDataUrlInfo(dataUrlOf('image/gif', gifHeader(64, 32)))).toMatchObject({width: 64, height: 32});
    // A GIF keeps its first frame after its extensions: they are searched within the window.
    expect(rasterDataUrlInfo(dataUrlOf('image/gif', gifWithLongComment(64, 32, 20_000)))).toMatchObject({width: 64, height: 32});
  });

  it('refuses larger sizes in every image type, and images whose size cannot be read', () => {
    const refused = [
      dataUrlOf('image/png', pngHeader(0, 10)),
      dataUrlOf('image/gif', gifHeader(10, 0)),
      dataUrlOf('image/png', pngHeader(12_000, 12_000)),
      dataUrlOf('image/png', pngHeader(4097, 1)),
      dataUrlOf('image/png', pngHeader(1, 4097)),
      dataUrlOf('image/gif', gifHeader(65_535, 65_535)),
      // A small screen whose first frame is huge: Chrome shows the frame's size.
      dataUrlOf('image/gif', gifHeader(10, 10, {width: 12_000, height: 12_000})),
      // A GIF whose first frame comes after more than the search window of extensions.
      dataUrlOf('image/gif', gifWithLongComment(10, 10, IMAGE_SIZE_SEARCH_BYTES)),
      dataUrlOf('image/jpeg', jpegHeader(8000, 8000)),
      dataUrlOf('image/jpeg', jpegHeader(10, 10, {paddingBytes: IMAGE_SIZE_SEARCH_BYTES})),
      dataUrlOf('image/webp', webpHeader(16_384, 16_384, 'VP8X')),
      dataUrlOf('image/webp', webpHeader(5000, 2, 'VP8L')),
      dataUrlOf('image/webp', webpHeader(4097, 4097, 'VP8 ')),
      dataUrlOf('image/png', pngHeader(10, 10).subarray(0, 20)),
    ];
    for (const dataUrl of refused) expect(rasterDataUrlInfo(dataUrl), dataUrl.slice(0, 40)).toBeNull();
  });

  it('refuses a payload holding a 12000 x 12000 picture in well under a second', () => {
    const text = JSON.stringify({version: 1, state: '3.abc', images: [{id: 'bombImage001', label: 'Bomb', dataUrl: dataUrlOf('image/png', pngHeader(12_000, 12_000))}]});
    const started = performance.now();
    expect(parseSnapshotPayload(text)).toMatchObject({ok: false, reason: 'invalid-payload'});
    expect(performance.now() - started).toBeLessThan(250);
  });
});
