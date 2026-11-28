import type {Box, Picture} from '@/lib/extract/picture';

export interface DrawnPicture extends Picture {
  readonly data: Uint8ClampedArray;
}

export type Colour = readonly [number, number, number];

export function blankPicture(width: number, height: number, colour: Colour = [40, 44, 52]): DrawnPicture {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    data[index * 4] = colour[0];
    data[index * 4 + 1] = colour[1];
    data[index * 4 + 2] = colour[2];
    data[index * 4 + 3] = 255;
  }
  return {width, height, data};
}

export function paint(picture: DrawnPicture, x: number, y: number, colour: Colour): void {
  if (x < 0 || y < 0 || x >= picture.width || y >= picture.height) return;
  const index = (y * picture.width + x) * 4;
  picture.data[index] = colour[0];
  picture.data[index + 1] = colour[1];
  picture.data[index + 2] = colour[2];
}

export function fillBox(picture: DrawnPicture, box: Box, colour: Colour): void {
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) paint(picture, x, y, colour);
  }
}

export function drawTile(picture: DrawnPicture, box: Box, seed = 0): void {
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      const u = (x - box.x) / box.width;
      const v = (y - box.y) / box.height;
      const shade = Math.round(60 + 150 * ((u + v + seed * 0.13) % 1));
      paint(picture, x, y, [shade, Math.round(shade * 0.8), 255 - shade]);
    }
  }
  for (let x = box.x; x < box.x + box.width; x++) {
    paint(picture, x, box.y, [230, 230, 230]);
    paint(picture, x, box.y + box.height - 1, [230, 230, 230]);
  }
  for (let y = box.y; y < box.y + box.height; y++) {
    paint(picture, box.x, y, [230, 230, 230]);
    paint(picture, box.x + box.width - 1, y, [230, 230, 230]);
  }
}

export interface GridLayout {
  readonly columns: number;
  readonly rows: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly gap: number;
}

export function gridBoxes({columns, rows, left, top, width, height, gap}: GridLayout): Box[] {
  const boxes: Box[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      boxes.push({x: left + column * (width + gap), y: top + row * (height + gap), width, height});
    }
  }
  return boxes;
}

export function gridPicture(pictureWidth: number, pictureHeight: number, layout: GridLayout): {picture: DrawnPicture; boxes: Box[]} {
  const picture = blankPicture(pictureWidth, pictureHeight);
  const boxes = gridBoxes(layout);
  boxes.forEach((box, index) => drawTile(picture, box, index));
  return {picture, boxes};
}

export function nearBox(found: Box, expected: Box, tolerance = 2): boolean {
  return Math.abs(found.x - expected.x) <= tolerance && Math.abs(found.y - expected.y) <= tolerance
    && Math.abs(found.width - expected.width) <= tolerance && Math.abs(found.height - expected.height) <= tolerance;
}
