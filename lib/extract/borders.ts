import type {Box} from './picture';
import {readingOrder} from './detect';

export const BORDER_LIMITS = Object.freeze({
  maxBorders: 300,
  smallestSide: 24,
  sameBorder: 0.5,
});

export type Fit = 'whole' | 'square';

export interface Border extends Box {
  readonly id: number;
  readonly cut: number | null;
}

export interface Bounds {
  readonly width: number;
  readonly height: number;
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export interface Edges {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

export function orderBorders(borders: readonly Border[]): Border[] {
  return readingOrder(borders);
}

export function overlapShare(a: Box, b: Box): number {
  const across = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const down = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return (across * down) / Math.min(a.width * a.height, b.width * b.height);
}

export function fitInside(box: Box, bounds: Bounds): Box | null {
  const x = clamp(Math.round(box.x), 0, bounds.width);
  const y = clamp(Math.round(box.y), 0, bounds.height);
  const right = clamp(Math.round(box.x + box.width), 0, bounds.width);
  const bottom = clamp(Math.round(box.y + box.height), 0, bounds.height);
  const fitted = {x, y, width: right - x, height: bottom - y};
  return fitted.width >= BORDER_LIMITS.smallestSide && fitted.height >= BORDER_LIMITS.smallestSide ? fitted : null;
}

export interface AddResult {
  readonly borders: Border[];
  readonly added: number;
  readonly leftOut: number;
  readonly tooSmall: number;
}

export function addBorders(borders: readonly Border[], boxes: readonly Box[], bounds: Bounds): AddResult {
  const out = [...borders];
  let next = borders.reduce((largest, border) => Math.max(largest, border.id), 0) + 1;
  let added = 0;
  let leftOut = 0;
  let tooSmall = 0;
  for (const box of boxes) {
    const fitted = fitInside(box, bounds);
    if (!fitted) {
      tooSmall += 1;
      continue;
    }
    if (out.some((border) => overlapShare(border, fitted) > BORDER_LIMITS.sameBorder)) continue;
    if (out.length >= BORDER_LIMITS.maxBorders) {
      leftOut += 1;
      continue;
    }
    out.push({...fitted, id: next++, cut: null});
    added += 1;
  }
  return {borders: out, added, leftOut, tooSmall};
}

export function removeBorder(borders: readonly Border[], id: number): Border[] {
  return borders.filter((border) => border.id !== id);
}

export function edgesOf(box: Box): Edges {
  return {left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height};
}

function fromEdges(border: Border, edges: Edges): Border {
  return {...border, x: edges.left, y: edges.top, width: edges.right - edges.left, height: edges.bottom - edges.top};
}

export function moveBorder(border: Border, dx: number, dy: number, bounds: Bounds): Border {
  return {
    ...border,
    x: clamp(Math.round(border.x + dx), 0, bounds.width - border.width),
    y: clamp(Math.round(border.y + dy), 0, bounds.height - border.height),
  };
}

export interface ResizeResult {
  readonly border: Border;
  readonly change: Edges;
  readonly atSmallest: boolean;
}

export function resizeBorder(border: Border, handle: Handle, dx: number, dy: number, bounds: Bounds): ResizeResult {
  const smallest = BORDER_LIMITS.smallestSide;
  const before = edgesOf(border);
  let {left, top, right, bottom} = before;
  let atSmallest = false;
  if (handle.includes('w')) {
    const wanted = Math.round(left + dx);
    left = clamp(wanted, 0, right - smallest);
    atSmallest ||= wanted > right - smallest;
  }
  if (handle.includes('e')) {
    const wanted = Math.round(right + dx);
    right = clamp(wanted, left + smallest, bounds.width);
    atSmallest ||= wanted < left + smallest;
  }
  if (handle.includes('n')) {
    const wanted = Math.round(top + dy);
    top = clamp(wanted, 0, bottom - smallest);
    atSmallest ||= wanted > bottom - smallest;
  }
  if (handle.includes('s')) {
    const wanted = Math.round(bottom + dy);
    bottom = clamp(wanted, top + smallest, bounds.height);
    atSmallest ||= wanted < top + smallest;
  }
  const after = {left, top, right, bottom};
  return {
    border: fromEdges(border, after),
    change: {left: left - before.left, top: top - before.top, right: right - before.right, bottom: bottom - before.bottom},
    atSmallest,
  };
}

export function resizeEvery(borders: readonly Border[], change: Edges, bounds: Bounds): {borders: Border[]; atSmallest: boolean} {
  let atSmallest = false;
  const smallest = BORDER_LIMITS.smallestSide;
  const resized = borders.map((border) => {
    const edges = edgesOf(border);
    const left = clamp(edges.left + change.left, 0, bounds.width - smallest);
    const top = clamp(edges.top + change.top, 0, bounds.height - smallest);
    const right = clamp(edges.right + change.right, left + smallest, bounds.width);
    const bottom = clamp(edges.bottom + change.bottom, top + smallest, bounds.height);
    if (right - left === smallest || bottom - top === smallest) atSmallest = true;
    return fromEdges(border, {left, top, right, bottom});
  });
  return {borders: resized, atSmallest};
}

export interface Square extends Box {
  readonly room: number;
  readonly along: 'x' | 'y';
}

export function keptSquare(border: Border): Square {
  const side = Math.min(border.width, border.height);
  const along = border.width > border.height ? 'x' : 'y';
  const room = Math.max(border.width, border.height) - side;
  const offset = clamp(border.cut === null ? Math.round(room / 2) : border.cut, 0, room);
  return along === 'x'
    ? {x: border.x + offset, y: border.y, width: side, height: side, room, along}
    : {x: border.x, y: border.y + offset, width: side, height: side, room, along};
}

export function moveCut(border: Border, delta: number): Border {
  const square = keptSquare(border);
  const offset = square.along === 'x' ? square.x - border.x : square.y - border.y;
  return {...border, cut: clamp(Math.round(offset + delta), 0, square.room)};
}

export interface CropPlan {
  readonly source: Box;
  readonly side: number;
  readonly target: Box;
}

export function cropPlan(border: Border, fit: Fit, maxSide = 512): CropPlan {
  if (fit === 'square') {
    const source = keptSquare(border);
    const side = Math.max(1, Math.min(maxSide, source.width));
    return {source: {x: source.x, y: source.y, width: source.width, height: source.height}, side, target: {x: 0, y: 0, width: side, height: side}};
  }
  const longest = Math.max(border.width, border.height);
  const scale = Math.min(1, maxSide / longest);
  const side = Math.max(1, Math.round(longest * scale));
  const width = Math.max(1, Math.round(border.width * scale));
  const height = Math.max(1, Math.round(border.height * scale));
  return {
    source: {x: border.x, y: border.y, width: border.width, height: border.height},
    side,
    target: {x: Math.floor((side - width) / 2), y: Math.floor((side - height) / 2), width, height},
  };
}

export function contextBox(box: Box, bounds: Bounds, margin = 0.6): Box {
  const extraX = Math.round(box.width * margin);
  const extraY = Math.round(box.height * margin);
  const x = clamp(box.x - extraX, 0, bounds.width);
  const y = clamp(box.y - extraY, 0, bounds.height);
  const right = clamp(box.x + box.width + extraX, 0, bounds.width);
  const bottom = clamp(box.y + box.height + extraY, 0, bounds.height);
  return {x, y, width: right - x, height: bottom - y};
}
