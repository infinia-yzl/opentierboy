import {vi} from 'vitest';
import type {CanvasLike, DecodedImage, DecodeHints} from '@/lib/images/prepareImage';
import {pngHeader, webpHeader} from './image-headers';

/**
 * A stand-in for the browser's image decoder and canvas, for code that calls
 * prepareImageForStore. Pictures are taggedPicture files: a PNG header that declares a size,
 * then a tag. The decoder reads both. The canvas "encodes" a WebP file that declares the drawn
 * size, followed by the tag and the drawn size, so each picture and each size gives other bytes.
 */

const PNG_HEADER_BYTES = 33;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A picture file for fakeDrawing: a PNG header of this size, then the tag. */
export function taggedPicture(tag: string, {width = 1024, height = 512} = {}): Blob {
  return new Blob([new Uint8Array(pngHeader(width, height)), encoder.encode(tag)], {type: 'image/png'});
}

/** The bytes the fake canvas writes for this tag at this size (`bytes`: the file's length, at least the minimum). */
export function drawnBytes(tag: string, width: number, height: number, bytes = 0): Uint8Array<ArrayBuffer> {
  const head = new Uint8Array([...webpHeader(width, height), ...encoder.encode(`${tag}@${width}x${height}`)]);
  const out = new Uint8Array(Math.max(head.length, bytes));
  out.set(head);
  return out;
}

export interface FakeDrawingOptions {
  /** Size of each written file, by tag and longest drawn side. Default: as small as it gets. */
  bytesFor?: (tag: string, side: number) => number;
  /** Tags the decoder cannot read: it throws for them, as a browser does for a broken file. */
  broken?: readonly string[];
}

export function fakeDrawing({bytesFor = () => 0, broken = []}: FakeDrawingOptions = {}) {
  /** Every drawing, in order: the tag and the canvas size. */
  const drawn: {tag: string; width: number; height: number}[] = [];
  const decode = vi.fn(async (blob: Blob, _hints: DecodeHints): Promise<DecodedImage> => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const tag = decoder.decode(bytes.subarray(PNG_HEADER_BYTES));
    if (broken.includes(tag)) throw new Error('The image did not load.');
    return {source: {tag} as unknown as CanvasImageSource, width: view.getUint32(16), height: view.getUint32(20), release: () => undefined};
  });
  const createCanvas = (): CanvasLike => {
    let tag = '';
    const canvas: CanvasLike = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (source: CanvasImageSource) => {
          tag = (source as unknown as {tag: string}).tag;
          drawn.push({tag, width: canvas.width, height: canvas.height});
        },
        fillRect: () => undefined,
        fillStyle: '',
      }),
      toBlob: (callback, type = 'image/png') => {
        if (type !== 'image/webp') {
          callback(null);
          return;
        }
        const side = Math.max(canvas.width, canvas.height);
        callback(new Blob([drawnBytes(tag, canvas.width, canvas.height, bytesFor(tag, side))], {type}));
      },
    };
    return canvas;
  };
  return {decode, createCanvas, drawn};
}
