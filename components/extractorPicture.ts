import {DEFAULT_IMAGE_CHECK_LIMITS} from '@/lib/images/imageCheck';
import {isIsoMediaFile, readImageSize, sniffImageType} from '@/lib/images/imageType';
import {previewableImage} from '@/lib/images/prepareImage';
import {DEVICE_IMAGE_REFUSAL_MESSAGES} from '@/lib/images/messages';
import {type Border, cropPlan, type Fit} from '@/lib/extract/borders';
import type {Picture} from '@/lib/extract/picture';

export const DETECTION_MAX_WIDTH = 2560;

export type PictureCheck = {ok: true; blob: Blob} | {ok: false; message: string};

export async function checkPictureFile(file: Blob): Promise<PictureCheck> {
  try {
    if (file.size === 0) return {ok: false, message: DEVICE_IMAGE_REFUSAL_MESSAGES.empty};
    const head = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());
    if (isIsoMediaFile(head) || /^image\/(avif|heic|heif)\b/.test(file.type)) return {ok: false, message: DEVICE_IMAGE_REFUSAL_MESSAGES['avif-heic']};
    const type = sniffImageType(head);
    if (!type) return {ok: false, message: DEVICE_IMAGE_REFUSAL_MESSAGES['unsupported-type']};
    const size = readImageSize(head);
    const {maxWidth, maxHeight, maxPixels} = DEFAULT_IMAGE_CHECK_LIMITS;
    if (size && (size.width > maxWidth || size.height > maxHeight || size.width * size.height > maxPixels)) {
      return {ok: false, message: DEVICE_IMAGE_REFUSAL_MESSAGES['too-many-pixels']};
    }
    const checked = await previewableImage(file);
    return checked ? {ok: true, blob: checked.blob} : {ok: false, message: DEVICE_IMAGE_REFUSAL_MESSAGES.unreadable};
  } catch {
    return {ok: false, message: DEVICE_IMAGE_REFUSAL_MESSAGES.unreadable};
  }
}

export interface LoadedPicture {
  readonly url: string;
  readonly image: HTMLImageElement;
  readonly width: number;
  readonly height: number;
}

export async function loadPicture(blob: Blob): Promise<LoadedPicture | null> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The picture did not load.'));
      image.src = url;
    });
    const {maxWidth, maxHeight, maxPixels} = DEFAULT_IMAGE_CHECK_LIMITS;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width > maxWidth || height > maxHeight || width * height > maxPixels) throw new Error('Too large.');
    await image.decode();
    return {url, image, width, height};
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

async function decodedSource(blob: Blob, loaded: LoadedPicture): Promise<{source: CanvasImageSource; release: () => void}> {
  if (typeof createImageBitmap !== 'function') return {source: loaded.image, release: () => undefined};
  try {
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width === loaded.width && bitmap.height === loaded.height) return {source: bitmap, release: () => bitmap.close()};
    bitmap.close();
  } catch {
    return {source: loaded.image, release: () => undefined};
  }
  return {source: loaded.image, release: () => undefined};
}

export async function picturePixels(blob: Blob, loaded: LoadedPicture): Promise<{picture: Picture; factor: number} | null> {
  const factor = Math.max(1, loaded.width / DETECTION_MAX_WIDTH);
  const width = Math.max(1, Math.round(loaded.width / factor));
  const height = Math.max(1, Math.round(loaded.height / factor));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  if (!context) return null;
  const {source, release} = await decodedSource(blob, loaded);
  try {
    context.drawImage(source, 0, 0, width, height);
    const {data} = context.getImageData(0, 0, width, height);
    return {picture: {width, height, data}, factor: loaded.width / width};
  } finally {
    release();
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, type, quality);
    } catch {
      resolve(null);
    }
  });
}

export async function cropItem(loaded: LoadedPicture, border: Border, fit: Fit): Promise<Blob | null> {
  const plan = cropPlan(border, fit);
  const canvas = document.createElement('canvas');
  canvas.width = plan.side;
  canvas.height = plan.side;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.imageSmoothingQuality = 'high';
  const {source, target} = plan;
  context.drawImage(loaded.image, source.x, source.y, source.width, source.height, target.x, target.y, target.width, target.height);
  const webp = await canvasBlob(canvas, 'image/webp', 0.9);
  if (webp && webp.type === 'image/webp') return webp;
  return canvasBlob(canvas, 'image/png');
}
