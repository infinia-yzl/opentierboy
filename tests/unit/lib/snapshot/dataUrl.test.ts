import {describe, expect, it} from 'vitest';
import {dataUrlFromImageBytes, imageBytesFromDataUrl, snapshotImageTypeOf} from '@/lib/snapshot/dataUrl';
import {heicStart} from '../../support/avif';
import {makePng} from '../../support/png-helpers';

describe('snapshotImageTypeOf, dataUrlFromImageBytes and imageBytesFromDataUrl', () => {
  it('returns the PNG type and the same bytes after a data URL round trip when given PNG bytes', () => {
    const bytes = makePng(3, 3);
    expect(snapshotImageTypeOf(bytes)).toBe('image/png');
    const url = dataUrlFromImageBytes(bytes)!;
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(imageBytesFromDataUrl(url)).toEqual({type: 'image/png', bytes});
  });

  it('returns the type from snapshotImageTypeOf when given JPEG, GIF or WebP bytes', () => {
    expect(snapshotImageTypeOf(Uint8Array.from([0xff, 0xd8, 0xff, 0]))).toBe('image/jpeg');
    expect(snapshotImageTypeOf(new TextEncoder().encode('GIF89a......'))).toBe('image/gif');
    expect(snapshotImageTypeOf(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('returns AVIF bytes with their declared type from imageBytesFromDataUrl, and null when encoding them', () => {
    const avif = new Uint8Array(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypavif\0\0\0\0mif1avif', 'latin1'), Buffer.alloc(40)]));
    const base64 = Buffer.from(avif).toString('base64');
    expect(imageBytesFromDataUrl(`data:image/avif;base64,${base64}`)).toEqual({type: 'image/avif', bytes: avif});
    expect(imageBytesFromDataUrl(`data:image/png;base64,${base64}`)).toEqual({type: 'image/png', bytes: avif});
    // The app never writes one.
    expect(snapshotImageTypeOf(avif)).toBeNull();
    expect(dataUrlFromImageBytes(avif)).toBeNull();
  });

  it('returns HEIC bytes with their declared type from imageBytesFromDataUrl, and null when encoding them', () => {
    const heic = heicStart();
    const base64 = Buffer.from(heic).toString('base64');
    expect(imageBytesFromDataUrl(`data:image/heic;base64,${base64}`)).toEqual({type: 'image/heic', bytes: heic});
    expect(snapshotImageTypeOf(heic)).toBeNull();
    expect(dataUrlFromImageBytes(heic)).toBeNull();
  });

  it('returns null when the bytes or the data URL are not a raster image', () => {
    expect(dataUrlFromImageBytes(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(dataUrlFromImageBytes(new Uint8Array())).toBeNull();
    expect(imageBytesFromDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(imageBytesFromDataUrl('https://example.com/a.png')).toBeNull();
  });

  it('returns a data URL of every byte when the image is 300,000 bytes', () => {
    const bytes = new Uint8Array(300_000);
    bytes.set(makePng(1, 1).subarray(0, 8));
    const url = dataUrlFromImageBytes(bytes)!;
    expect(Buffer.from(url.split(',')[1], 'base64').equals(Buffer.from(bytes))).toBe(true);
  });
});
