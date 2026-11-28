import type {Point} from '@/lib/scribble/points';

export type Anchor =
  | {readonly kind: 'item'; readonly id: string}
  | {readonly kind: 'row'; readonly index: number}
  | {readonly kind: 'tray'}
  | {readonly kind: 'frame'};

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Origin {
  readonly x: number;
  readonly y: number;
  readonly unit: number;
}

export interface Place {
  readonly box: Box;
  readonly origin: Origin;
  readonly shown: boolean;
}

export interface Surface {
  readonly unit: number;
  readonly items: readonly (Place & {readonly id: string})[];
  readonly rows: readonly Place[];
  readonly tray: Place | null;
  readonly pictures?: readonly Box[];
}

export const FALLBACK_UNIT = 64;
export const MAX_ANCHOR_ID_LENGTH = 256;
export const MAX_ANCHOR_ROWS = 100;

const canAnchorItem = (id: string) => id.length >= 1 && id.length <= MAX_ANCHOR_ID_LENGTH;

export const EMPTY_SURFACE: Surface = Object.freeze({unit: FALLBACK_UNIT, items: [], rows: [], tray: null});

export function boxHolds(box: Box, point: Point): boolean {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}

export function boxOf(points: readonly Point[]): Box {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y};
}

export function boxCentre(box: Box): Point {
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

export function boxGap(a: Box, b: Box): number {
  const gapX = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width));
  const gapY = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height));
  return Math.hypot(gapX, gapY);
}

export function anchorAt(surface: Surface, point: Point): Anchor {
  const item = surface.items.find((place) => place.shown && canAnchorItem(place.id) && boxHolds(place.box, point));
  if (item) return {kind: 'item', id: item.id};
  const index = surface.rows.findIndex((place) => place.shown && boxHolds(place.box, point));
  if (index >= 0 && index < MAX_ANCHOR_ROWS) return {kind: 'row', index};
  if (surface.tray && surface.tray.shown && boxHolds(surface.tray.box, point)) return {kind: 'tray'};
  return {kind: 'frame'};
}

function placeOf(surface: Surface, anchor: Exclude<Anchor, {kind: 'frame'}>): Place | null | undefined {
  if (anchor.kind === 'item') return surface.items.find((place) => place.id === anchor.id);
  if (anchor.kind === 'row') return surface.rows[anchor.index];
  return surface.tray;
}

export function originOf(surface: Surface, anchor: Anchor): Origin | null {
  if (anchor.kind === 'frame') return {x: 0, y: 0, unit: surface.unit};
  const place = placeOf(surface, anchor);
  return place && place.shown && place.origin.unit > 0 ? place.origin : null;
}

export function toAnchor(origin: Origin, point: Point): Point {
  return {x: (point.x - origin.x) / origin.unit, y: (point.y - origin.y) / origin.unit};
}

export function fromAnchor(origin: Origin, point: Point): Point {
  return {x: origin.x + point.x * origin.unit, y: origin.y + point.y * origin.unit};
}
