/**
 * Gets an image file ready for the device store (lib/images/deviceStore.ts), in the browser.
 *
 * The store keeps PNG, JPEG, WebP, GIF and AVIF files of up to 5 MB, judged by their first
 * bytes. A file that already fits is kept exactly as it is (an animated GIF stays animated).
 * Any other image the browser can show (SVG, BMP, HEIC on Safari, a large photo) is drawn on a
 * canvas, at most 2,048 pixels on its longest side, and saved again: as WebP, or PNG where the
 * browser cannot write WebP, and as JPEG when that is still too large. SVG thus becomes a plain
 * picture: its scripts and links never reach the store.
 *
 * Every image is decoded once, and refused when it is wider or taller than 8,192 pixels or
 * larger than 32 megapixels (the caps of lib/images/imageCheck.ts). The size its header
 * declares is checked first, without decoding, so a small file that declares a huge picture (a
 * "decompression bomb") is refused before the browser allocates memory for it. The store's
 * bytes are later read back and drawn, so they must stay within the caps.
 *
 * Uses the browser's Image and canvas at call time only. Tests inject both.
 */
import {DEFAULT_IMAGE_CHECK_LIMITS} from './imageCheck';
import {readImageSize, sniffImageType} from './imageType';

export type PrepareImageRefusal = 'empty' | 'unreadable' | 'too-large' | 'too-many-pixels';
export type PrepareImageResult = {ok: true; blob: Blob; reencoded: boolean} | {ok: false; reason: PrepareImageRefusal};

/** A decoded picture that a canvas can draw. */
export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Frees what decoding needed (an object URL). */
  release: () => void;
}

/** The part of a canvas this module uses. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): Pick<CanvasRenderingContext2D, 'drawImage' | 'fillRect' | 'fillStyle'> | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

export interface PrepareImageOptions {
  /** Largest file the store accepts. */
  maxBytes: number;
  /** Longest side after drawing. */
  maxSide?: number;
  /** Largest file this module tries to decode at all. */
  maxInputBytes?: number;
  decode?: (blob: Blob) => Promise<DecodedImage>;
  createCanvas?: () => CanvasLike;
  /** Pixel caps; the defaults are those of lib/images/imageCheck.ts. */
  maxWidth?: number;
  maxHeight?: number;
  maxPixels?: number;
}

export const DEFAULT_MAX_SIDE = 2048;
/** Size used for an SVG without its own size. */
const FALLBACK_SIDE = 512;
const DEFAULT_MAX_INPUT_BYTES = 50 * 1024 * 1024;
/** Enough of the file to find a JPEG's frame header behind large metadata. */
const HEAD_BYTES = 512 * 1024;

/** Loads an image file through an Image element (also SVG, which createImageBitmap refuses). */
async function decodeWithImageElement(blob: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth || FALLBACK_SIDE,
      height: image.naturalHeight || FALLBACK_SIDE,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

const createDocumentCanvas = (): CanvasLike => document.createElement('canvas');

function toBlob(canvas: CanvasLike, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });
}

async function isStorable(blob: Blob | null, maxBytes: number): Promise<boolean> {
  if (!blob || blob.size === 0 || blob.size > maxBytes) return false;
  return sniffImageType(new Uint8Array(await blob.slice(0, 64).arrayBuffer())) !== null;
}

/** Keeps the file when the store accepts it, otherwise draws it again. Never throws. */
export async function prepareImageForStore(blob: Blob, options: PrepareImageOptions): Promise<PrepareImageResult> {
  const {
    maxBytes,
    maxSide = DEFAULT_MAX_SIDE,
    maxInputBytes = DEFAULT_MAX_INPUT_BYTES,
    maxWidth = DEFAULT_IMAGE_CHECK_LIMITS.maxWidth,
    maxHeight = DEFAULT_IMAGE_CHECK_LIMITS.maxHeight,
    maxPixels = DEFAULT_IMAGE_CHECK_LIMITS.maxPixels,
  } = options;
  const tooManyPixels = ({width, height}: {width: number; height: number}) =>
    width > maxWidth || height > maxHeight || width * height > maxPixels;
  try {
    if (blob.size === 0) return {ok: false, reason: 'empty'};
    if (blob.size > maxInputBytes) return {ok: false, reason: 'too-large'};
    const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
    const declared = readImageSize(head);
    if (declared && tooManyPixels(declared)) return {ok: false, reason: 'too-many-pixels'};

    let decoded: DecodedImage;
    try {
      decoded = await (options.decode ?? decodeWithImageElement)(blob);
    } catch {
      return {ok: false, reason: 'unreadable'};
    }
    try {
      if (tooManyPixels(decoded)) return {ok: false, reason: 'too-many-pixels'};
      // A file the store accepts is kept exactly as it is (an animated GIF stays animated).
      if (await isStorable(blob, maxBytes)) return {ok: true, blob, reencoded: false};
      const createCanvas = options.createCanvas ?? createDocumentCanvas;
      for (const side of [maxSide, Math.round(maxSide / 2)]) {
        const scale = Math.min(1, side / Math.max(decoded.width, decoded.height));
        const canvas = createCanvas();
        canvas.width = Math.max(1, Math.round(decoded.width * scale));
        canvas.height = Math.max(1, Math.round(decoded.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return {ok: false, reason: 'unreadable'};
        context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
        // WebP keeps transparency. A browser that cannot write WebP writes PNG instead.
        const webp = await toBlob(canvas, 'image/webp', 0.9);
        if (await isStorable(webp, maxBytes)) return {ok: true, blob: webp!, reencoded: true};
        // JPEG has no transparency: paint white under the picture first.
        const opaque = createCanvas();
        opaque.width = canvas.width;
        opaque.height = canvas.height;
        const opaqueContext = opaque.getContext('2d');
        if (!opaqueContext) return {ok: false, reason: 'unreadable'};
        opaqueContext.fillStyle = '#ffffff';
        opaqueContext.fillRect(0, 0, opaque.width, opaque.height);
        opaqueContext.drawImage(decoded.source, 0, 0, opaque.width, opaque.height);
        const jpeg = await toBlob(opaque, 'image/jpeg', 0.85);
        if (await isStorable(jpeg, maxBytes)) return {ok: true, blob: jpeg!, reencoded: true};
      }
      return {ok: false, reason: 'too-large'};
    } finally {
      decoded.release();
    }
  } catch {
    return {ok: false, reason: 'unreadable'};
  }
}
