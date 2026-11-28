export interface Picture {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScoredBox extends Box {
  readonly score: number;
}

export const WORKING_WIDTH = 1280;

export interface WorkingPicture {
  readonly width: number;
  readonly height: number;
  readonly rgb: Uint8Array;
  readonly scale: number;
}

export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const rest = value - floor;
  if (rest > 0.5) return floor + 1;
  if (rest < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function checkPicture(picture: Picture): void {
  const {width, height, data} = picture;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('A picture needs a whole width and height of at least 1.');
  }
  if (data.length !== width * height * 4) throw new RangeError('A picture needs 4 bytes (RGBA) for each pixel.');
}

interface AreaWeight {
  readonly target: number;
  readonly source: number;
  readonly weight: number;
}

function areaWeights(sourceSize: number, targetSize: number, scale: number): AreaWeight[] {
  const weights: AreaWeight[] = [];
  for (let target = 0; target < targetSize; target++) {
    const from = target * scale;
    const to = from + scale;
    const cell = Math.min(scale, sourceSize - from);
    const last = Math.min(Math.floor(to), sourceSize - 1);
    const first = Math.min(Math.ceil(from), last);
    if (first - from > 1e-3) weights.push({target, source: first - 1, weight: Math.fround((first - from) / cell)});
    for (let source = first; source < last; source++) weights.push({target, source, weight: Math.fround(1 / cell)});
    if (to - last > 1e-3) weights.push({target, source: last, weight: Math.fround(Math.min(Math.min(to - last, 1), cell) / cell)});
  }
  return weights;
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

function shrinkByWholeFactor(picture: Picture, factor: number, width: number, height: number): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  const area = factor * factor;
  const inverse = Math.fround(1 / area);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++) {
          const row = (y * factor + dy) * picture.width;
          for (let dx = 0; dx < factor; dx++) sum += picture.data[(row + x * factor + dx) * 4 + channel];
        }
        rgb[(y * width + x) * 3 + channel] = factor === 2 ? (sum + 2) >> 2 : clampByte(roundHalfEven(Math.fround(sum * inverse)));
      }
    }
  }
  return rgb;
}

function shrinkByArea(picture: Picture, width: number, height: number): Uint8Array {
  const scaleX = 1 / (width / picture.width);
  const scaleY = 1 / (height / picture.height);
  const columns = areaWeights(picture.width, width, scaleX);
  const rows = areaWeights(picture.height, height, scaleY);
  const rgb = new Uint8Array(width * height * 3);
  const buffer = new Float32Array(width * 3);
  const sum = new Float32Array(width * 3);
  let current = -1;
  const write = (target: number) => {
    for (let index = 0; index < width * 3; index++) rgb[target * width * 3 + index] = clampByte(roundHalfEven(sum[index]));
  };
  for (const {target, source, weight} of rows) {
    buffer.fill(0);
    const row = source * picture.width;
    for (const column of columns) {
      const from = (row + column.source) * 4;
      const to = column.target * 3;
      buffer[to] = buffer[to] + Math.fround(picture.data[from] * column.weight);
      buffer[to + 1] = buffer[to + 1] + Math.fround(picture.data[from + 1] * column.weight);
      buffer[to + 2] = buffer[to + 2] + Math.fround(picture.data[from + 2] * column.weight);
    }
    if (target !== current) {
      if (current >= 0) write(current);
      for (let index = 0; index < width * 3; index++) sum[index] = Math.fround(weight * buffer[index]);
      current = target;
    } else {
      for (let index = 0; index < width * 3; index++) sum[index] = sum[index] + Math.fround(weight * buffer[index]);
    }
  }
  if (current >= 0) write(current);
  return rgb;
}

function enlargeLinear(picture: Picture, width: number, height: number): Uint8Array {
  const inverseX = width / picture.width;
  const inverseY = height / picture.height;
  const coordinate = (target: number, inverse: number, size: number) => {
    const source = Math.floor(target / inverse);
    const raw = target + 1 - (source + 1) * inverse;
    const fraction = raw <= 0 ? 0 : raw - Math.floor(raw);
    return {from: Math.min(source, size - 1), to: Math.min(source + 1, size - 1), fraction};
  };
  const xs = Array.from({length: width}, (_, x) => coordinate(x, inverseX, picture.width));
  const ys = Array.from({length: height}, (_, y) => coordinate(y, inverseY, picture.height));
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const {from: top, to: bottom, fraction: fy} = ys[y];
    for (let x = 0; x < width; x++) {
      const {from: left, to: right, fraction: fx} = xs[x];
      for (let channel = 0; channel < 3; channel++) {
        const at = (row: number, column: number) => picture.data[(row * picture.width + column) * 4 + channel];
        const upper = at(top, left) * (1 - fx) + at(top, right) * fx;
        const lower = at(bottom, left) * (1 - fx) + at(bottom, right) * fx;
        rgb[(y * width + x) * 3 + channel] = clampByte(roundHalfEven(upper * (1 - fy) + lower * fy));
      }
    }
  }
  return rgb;
}

export function workingPicture(picture: Picture, workingWidth: number = WORKING_WIDTH): WorkingPicture {
  checkPicture(picture);
  const scale = workingWidth / picture.width;
  const width = workingWidth;
  const height = Math.max(1, roundHalfEven(picture.height * scale));
  const factorX = picture.width / width;
  const factorY = picture.height / height;
  const wholeX = Math.round(factorX);
  const wholeY = Math.round(factorY);
  let rgb: Uint8Array;
  if (factorX >= 1 && factorY >= 1) {
    rgb = Math.abs(factorX - wholeX) < Number.EPSILON && Math.abs(factorY - wholeY) < Number.EPSILON && wholeX === wholeY
      ? shrinkByWholeFactor(picture, wholeX, width, height)
      : shrinkByArea(picture, width, height);
  } else {
    rgb = enlargeLinear(picture, width, height);
  }
  return {width, height, rgb, scale};
}

export function greyValues(picture: WorkingPicture): Uint8Array {
  const grey = new Uint8Array(picture.width * picture.height);
  for (let index = 0; index < grey.length; index++) {
    const red = picture.rgb[index * 3];
    const green = picture.rgb[index * 3 + 1];
    const blue = picture.rgb[index * 3 + 2];
    grey[index] = (red * 4899 + green * 9617 + blue * 1868 + 8192) >> 14;
  }
  return grey;
}
