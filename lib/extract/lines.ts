import type {WorkingPicture} from './picture';

export interface Mask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export type Direction = 'vertical' | 'horizontal';

export const EDGE_THRESHOLD = 7;
export const LINE_LENGTH = 16;

function emptyMask(width: number, height: number): Mask {
  return {width, height, data: new Uint8Array(width * height)};
}

function morph(mask: Mask, size: number, direction: Direction, keep: 'min' | 'max'): Mask {
  const {width, height, data} = mask;
  const out = emptyMask(width, height);
  const anchor = Math.floor(size / 2);
  const along = direction === 'vertical' ? height : width;
  const lines = direction === 'vertical' ? width : height;
  const at = (line: number, position: number) => (direction === 'vertical' ? position * width + line : line * width + position);
  for (let line = 0; line < lines; line++) {
    for (let position = 0; position < along; position++) {
      const from = Math.max(0, position - anchor);
      const to = Math.min(along - 1, position + size - 1 - anchor);
      let value = keep === 'min' ? 1 : 0;
      for (let other = from; other <= to; other++) {
        const pixel = data[at(line, other)];
        if (keep === 'min' && pixel === 0) {
          value = 0;
          break;
        }
        if (keep === 'max' && pixel !== 0) {
          value = 1;
          break;
        }
      }
      out.data[at(line, position)] = value;
    }
  }
  return out;
}

export const dilate = (mask: Mask, size: number, direction: Direction): Mask => morph(mask, size, direction, 'max');
export const erode = (mask: Mask, size: number, direction: Direction): Mask => morph(mask, size, direction, 'min');
export const close = (mask: Mask, size: number, direction: Direction): Mask => erode(dilate(mask, size, direction), size, direction);
export const open = (mask: Mask, size: number, direction: Direction): Mask => dilate(erode(mask, size, direction), size, direction);

export interface LineMasks {
  readonly vertical: Mask;
  readonly horizontal: Mask;
}

export function lineMasks(picture: WorkingPicture, threshold: number = EDGE_THRESHOLD, length: number = LINE_LENGTH): LineMasks {
  const {width, height, rgb} = picture;
  const vertical = emptyMask(width, height);
  const horizontal = emptyMask(width, height);
  const difference = (a: number, b: number) => Math.max(
    Math.abs(rgb[a * 3] - rgb[b * 3]),
    Math.abs(rgb[a * 3 + 1] - rgb[b * 3 + 1]),
    Math.abs(rgb[a * 3 + 2] - rgb[b * 3 + 2]),
  );
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (x > 0 && difference(index, index - 1) > threshold) vertical.data[index] = 1;
      if (y > 0 && difference(index, index - width) > threshold) horizontal.data[index] = 1;
    }
  }
  return {
    vertical: open(close(vertical, 3, 'vertical'), length, 'vertical'),
    horizontal: open(close(horizontal, 3, 'horizontal'), length, 'horizontal'),
  };
}

export interface Runs {
  readonly rows: Int32Array;
  readonly starts: Int32Array;
  readonly ends: Int32Array;
}

export function topEdges(mask: Mask): Mask {
  const out = emptyMask(mask.width, mask.height);
  for (let index = 0; index < mask.data.length; index++) {
    out.data[index] = mask.data[index] && (index < mask.width || !mask.data[index - mask.width]) ? 1 : 0;
  }
  return out;
}

export function horizontalRuns(mask: Mask): Runs {
  const rows: number[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  for (let y = 0; y < mask.height; y++) {
    let start = -1;
    for (let x = 0; x <= mask.width; x++) {
      const on = x < mask.width && mask.data[y * mask.width + x] !== 0;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        rows.push(y);
        starts.push(start);
        ends.push(x);
        start = -1;
      }
    }
  }
  return {rows: Int32Array.from(rows), starts: Int32Array.from(starts), ends: Int32Array.from(ends)};
}

export interface SideSums {
  readonly width: number;
  readonly height: number;
  readonly vertical: Int32Array;
  readonly horizontal: Int32Array;
  readonly verticalRaw: Int32Array;
}

export function columnSums(mask: Mask): Int32Array {
  const {width, height, data} = mask;
  const sums = new Int32Array((height + 1) * width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) sums[(y + 1) * width + x] = sums[y * width + x] + data[y * width + x];
  }
  return sums;
}

export function rowSums(mask: Mask): Int32Array {
  const {width, height, data} = mask;
  const stride = width + 1;
  const sums = new Int32Array(height * stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) sums[y * stride + x + 1] = sums[y * stride + x] + data[y * width + x];
  }
  return sums;
}

export function sideSums(masks: LineMasks): SideSums {
  const {width, height} = masks.vertical;
  return {
    width,
    height,
    vertical: columnSums(dilate(masks.vertical, 3, 'horizontal')),
    horizontal: rowSums(dilate(masks.horizontal, 3, 'vertical')),
    verticalRaw: columnSums(masks.vertical),
  };
}

export const verticalCover = (sums: SideSums, x: number, top: number, bottom: number, raw = false): number => {
  const column = raw ? sums.verticalRaw : sums.vertical;
  return column[bottom * sums.width + x] - column[top * sums.width + x];
};

export const horizontalCover = (sums: SideSums, y: number, left: number, right: number): number =>
  sums.horizontal[y * (sums.width + 1) + right] - sums.horizontal[y * (sums.width + 1) + left];
