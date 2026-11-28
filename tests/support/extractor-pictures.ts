import {PNG} from 'pngjs';
import type {Box} from '@/lib/extract/picture';
import {blankPicture, type DrawnPicture, type GridLayout, gridPicture} from '../unit/support/drawn-pictures';

export interface PictureFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

export const EXTRACTOR_GRID: GridLayout = Object.freeze({columns: 4, rows: 2, left: 80, top: 60, width: 120, height: 150, gap: 24});

function encode(picture: DrawnPicture): Buffer {
  const png = new PNG({width: picture.width, height: picture.height});
  png.data.set(picture.data);
  return PNG.sync.write(png);
}

export function gridPng(layout: GridLayout = EXTRACTOR_GRID, width = 1280, height = 480): Buffer {
  return encode(gridPicture(width, height, layout).picture);
}

export function picturePng(name: string, buffer: Buffer): PictureFile {
  return {name, mimeType: 'image/png', buffer};
}

export const PLAIN_PICTURE: PictureFile = picturePng('plain.png', encode(blankPicture(1280, 480)));

const ROW_LAYOUT: GridLayout = Object.freeze({columns: 3, rows: 1, left: 200, top: 150, width: 140, height: 140, gap: 40});

export const ROW_OF_THREE: {readonly file: PictureFile; readonly boxes: readonly Box[]; readonly size: {width: number; height: number}} = (() => {
  const {picture, boxes} = gridPicture(1280, 480, ROW_LAYOUT);
  return {file: picturePng('row.png', encode(picture)), boxes, size: {width: 1280, height: 480}};
})();

export const CROWDED_GRID: GridLayout = Object.freeze({columns: 31, rows: 17, left: 10, top: 10, width: 34, height: 34, gap: 6});

export const CROWDED_PICTURE: PictureFile = picturePng('crowded.png', gridPng(CROWDED_GRID, 1280, 720));
