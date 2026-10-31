/**
 * Gets an image file ready for the device store (lib/images/deviceStore.ts), in the browser.
 *
 * The store keeps PNG, JPEG, WebP and GIF files of up to 5 MB, judged by their first bytes. A
 * file that already fits is kept exactly as it is (an animated GIF stays animated). Any other
 * image the browser can show (SVG, BMP, a large photo) is drawn on a
 * canvas, at most 2,048 pixels on its longest side, and saved again: as WebP, or PNG where the
 * browser cannot write WebP, and as JPEG when that is still too large. SVG thus becomes a plain
 * picture: its scripts and links never reach the store. With `alwaysReencode`, every file is
 * drawn again, even one the store would accept: snapshot files use it, because their images
 * passed only a check of their header (A10).
 *
 * Every image is decoded once, and refused when it is wider or taller than 8,192 pixels or
 * larger than 32 megapixels (the caps of lib/images/imageCheck.ts). The size is checked before
 * the pixels are decoded: from the file's header (PNG, GIF, WebP, JPEG), or else from the
 * loaded image's natural size, so a small file that declares a huge picture (a "decompression
 * bomb") is refused before the browser allocates memory for it. The store's bytes are later
 * read back and drawn, so they must stay within the caps.
 *
 * AVIF and HEIC files are refused: the size in their header can differ from the size of the
 * coded picture, and the browser reports the header's size as the natural size. A 2 KB AVIF
 * that says 100 x 100 can decode at 9,000 x 9,000. Checking the real size needs an AV1 (or
 * HEVC) parser and the file's item locations; until then, such files are not taken.
 *
 * The type of a file comes from its bytes, never from the type the browser reports (which
 * comes from the file name). A blob: URL is a page of this site when opened in a tab, so an
 * object URL is only ever made from a Blob of the sniffed raster type (`asRasterImage`,
 * `previewableImage`, `ObjectUrlRegistry.urlFor` in lib/images/deviceStore.ts): a
 * PNG named evil.html shows as image/png, and its trailing <script> never runs. Images that
 * are converted (SVG, BMP) load from a data: URL, which has no access to this site.
 *
 * Uses the browser's Image and canvas at call time only. Tests inject both.
 */
import {DEFAULT_IMAGE_CHECK_LIMITS} from './imageCheck';
import {isIsoMediaFile, type RasterImageType, readImageSize, sniffImageType} from './imageType';

export type PrepareImageRefusal = 'empty' | 'unreadable' | 'unsupported-type' | 'avif-heic' | 'too-large' | 'too-many-pixels';
/** `blob` always has `type`, the type sniffed from its bytes. */
export type PrepareImageResult =
  | {ok: true; blob: Blob; type: RasterImageType; reencoded: boolean}
  | {ok: false; reason: PrepareImageRefusal};

/** A decoded picture that a canvas can draw. */
export interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Frees what decoding needed (an object URL). */
  release: () => void;
}

/** What a decoder gets to know about the file. */
export interface DecodeHints {
  /** The raster type sniffed from the file's bytes, or null for an image to convert (SVG, BMP). */
  type: RasterImageType | null;
  /** False for a size above the pixel caps: the decoder then throws pixelCapError() before decoding. */
  fits: (size: {width: number; height: number}) => boolean;
}

const PIXEL_CAP_ERROR = 'PIXEL_CAP';

/**
 * The error a decoder throws when the image is above the pixel caps (DecodeHints.fits): a
 * plain Error with `name` and `code` (A47: no classes).
 */
export function pixelCapError(): Error & {code: typeof PIXEL_CAP_ERROR} {
  return Object.assign(new Error('The image is above the pixel caps.'), {name: 'PixelCapError', code: PIXEL_CAP_ERROR} as const);
}

/** True for an error made by pixelCapError(). */
export const isPixelCapError = (error: unknown): boolean =>
  error instanceof Error && (error as {code?: unknown}).code === PIXEL_CAP_ERROR;

/** AVIF and HEIC, by their bytes or by the type the browser reports. */
const isAvifOrHeic = (head: Uint8Array, blob: Blob) => isIsoMediaFile(head) || /^image\/(avif|heic|heif)\b/.test(blob.type);

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
  /** Draw the image again even when the store would accept the file as it is. */
  alwaysReencode?: boolean;
  decode?: (blob: Blob, hints: DecodeHints) => Promise<DecodedImage>;
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

/**
 * The file as a Blob of its real raster type, sniffed from its first bytes, or null when the
 * bytes are not PNG, JPEG, WebP, GIF or AVIF. Make object URLs only from such a Blob.
 */
export async function asRasterImage(blob: Blob): Promise<{blob: Blob; type: RasterImageType} | null> {
  const type = sniffImageType(new Uint8Array(await blob.slice(0, 64).arrayBuffer()));
  return type ? {blob: new Blob([blob], {type}), type} : null;
}

/**
 * The file as a Blob of its sniffed raster type, for a preview: null when its bytes are not PNG,
 * JPEG, WebP or GIF, or when its header does not declare a size within the pixel caps (showing
 * the file would decode it).
 */
export async function previewableImage(
  blob: Blob,
  {maxWidth, maxHeight, maxPixels} = DEFAULT_IMAGE_CHECK_LIMITS,
): Promise<{blob: Blob; type: RasterImageType} | null> {
  const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
  const type = isAvifOrHeic(head, blob) ? null : sniffImageType(head);
  const size = type ? readImageSize(head) : null;
  if (!type || !size || size.width > maxWidth || size.height > maxHeight || size.width * size.height > maxPixels) return null;
  return {blob: new Blob([blob], {type}), type};
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Not read.')));
    reader.onerror = () => reject(reader.error ?? new Error('Not read.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Loads an image file through an Image element (also SVG, which createImageBitmap refuses).
 * A raster file loads from an object URL of its sniffed type, an image to convert from a data:
 * URL. The natural size is known once the file has loaded, before the pixels are decoded, so
 * an image above the caps is refused without decoding it.
 */
async function decodeWithImageElement(blob: Blob, {type, fits}: DecodeHints): Promise<DecodedImage> {
  const objectUrl = type ? URL.createObjectURL(new Blob([blob], {type})) : null;
  const release = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
  try {
    const src = objectUrl ?? await readAsDataUrl(blob);
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The image did not load.'));
      image.src = src;
    });
    const width = image.naturalWidth || FALLBACK_SIDE;
    const height = image.naturalHeight || FALLBACK_SIDE;
    if (!fits({width, height})) throw pixelCapError();
    await image.decode();
    return {source: image, width, height, release};
  } catch (error) {
    release();
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

/** The canvas result as a Blob of its sniffed type, when the store accepts it. */
async function storable(blob: Blob | null, maxBytes: number): Promise<{blob: Blob; type: RasterImageType} | null> {
  if (!blob || blob.size === 0 || blob.size > maxBytes) return null;
  return asRasterImage(blob);
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
    alwaysReencode = false,
  } = options;
  const tooManyPixels = ({width, height}: {width: number; height: number}) =>
    width > maxWidth || height > maxHeight || width * height > maxPixels;
  try {
    if (blob.size === 0) return {ok: false, reason: 'empty'};
    if (blob.size > maxInputBytes) return {ok: false, reason: 'too-large'};
    const head = new Uint8Array(await blob.slice(0, HEAD_BYTES).arrayBuffer());
    if (isAvifOrHeic(head, blob)) return {ok: false, reason: 'avif-heic'};
    const type = sniffImageType(head);
    // Not a raster image by its bytes: only what the browser calls an image is converted.
    if (!type && !blob.type.startsWith('image/')) return {ok: false, reason: 'unsupported-type'};
    const declared = type ? readImageSize(head) : null;
    if (declared && tooManyPixels(declared)) return {ok: false, reason: 'too-many-pixels'};

    let decoded: DecodedImage;
    try {
      decoded = await (options.decode ?? decodeWithImageElement)(blob, {type, fits: (size) => !tooManyPixels(size)});
    } catch (error) {
      return {ok: false, reason: isPixelCapError(error) ? 'too-many-pixels' : 'unreadable'};
    }
    try {
      if (tooManyPixels(decoded)) return {ok: false, reason: 'too-many-pixels'};
      // A file the store accepts is kept exactly as it is (an animated GIF stays animated), with
      // its sniffed type in place of the one the browser reported.
      if (type && blob.size <= maxBytes && !alwaysReencode) return {ok: true, blob: new Blob([blob], {type}), type, reencoded: false};
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
        const webp = await storable(await toBlob(canvas, 'image/webp', 0.9), maxBytes);
        if (webp) return {ok: true, ...webp, reencoded: true};
        // JPEG has no transparency: paint white under the picture first.
        const opaque = createCanvas();
        opaque.width = canvas.width;
        opaque.height = canvas.height;
        const opaqueContext = opaque.getContext('2d');
        if (!opaqueContext) return {ok: false, reason: 'unreadable'};
        opaqueContext.fillStyle = '#ffffff';
        opaqueContext.fillRect(0, 0, opaque.width, opaque.height);
        opaqueContext.drawImage(decoded.source, 0, 0, opaque.width, opaque.height);
        const jpeg = await storable(await toBlob(opaque, 'image/jpeg', 0.85), maxBytes);
        if (jpeg) return {ok: true, ...jpeg, reencoded: true};
      }
      return {ok: false, reason: 'too-large'};
    } finally {
      decoded.release();
    }
  } catch {
    return {ok: false, reason: 'unreadable'};
  }
}
