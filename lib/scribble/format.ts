import LZString from 'lz-string';
import {decompressFromEncodedURIComponentCapped} from '@/lib/state/lz';
import {MAX_ANCHOR_ID_LENGTH, MAX_ANCHOR_ROWS, type Anchor} from '@/lib/scribble/anchors';
import type {InkColour} from '@/lib/scribble/colours';
import type {Note, Stroke} from '@/lib/scribble/notes';
import {INK_GRID, type Point} from '@/lib/scribble/points';
import {INK_SUPPLY} from '@/lib/scribble/supply';

export const INK_VERSION = 1;

export const INK_LIMITS = Object.freeze({
  maxValueLength: 1_000_000,
  maxTextLength: 150_000,
  maxPoints: INK_SUPPLY,
  maxRows: MAX_ANCHOR_ROWS,
  maxItemIdLength: MAX_ANCHOR_ID_LENGTH,
  maxCoordinate: 65_535,
});

export type InkProblem = 'too-long' | 'version' | 'data' | 'format' | 'anchor' | 'points';

export type InkRead =
  | {readonly ok: true; readonly notes: readonly Note[]}
  | {readonly ok: false; readonly reason: InkProblem};

const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DIGIT_VALUES: ReadonlyMap<string, number> = new Map(Array.from(DIGITS, (digit, value) => [digit, value]));
const NARROW = 31;
const WIDE_MARK = 63;
const WIDE_OFFSET = 131_072;
const NOTE_MARK = '~';
const STROKE_MARK = '.';
const VERSION_PREFIX = /^([1-9]\d*)\./;

const COLOUR_CODES: Readonly<Record<InkColour, string>> = Object.freeze({red: 'r', blue: 'b', contrast: 'c'});
const CODE_COLOURS: ReadonlyMap<string, InkColour> = new Map(
  (Object.keys(COLOUR_CODES) as InkColour[]).map((colour) => [COLOUR_CODES[colour], colour]),
);

function digits(value: number, count: number): string {
  let text = '';
  for (let place = count - 1; place >= 0; place--) text += DIGITS[Math.floor(value / 64 ** place) % 64];
  return text;
}

function gridValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const {maxCoordinate} = INK_LIMITS;
  return Math.max(-maxCoordinate, Math.min(maxCoordinate, Math.round(value * INK_GRID) + 0));
}

function anchorText(anchor: Anchor): string {
  if (anchor.kind === 'frame') return 'f';
  if (anchor.kind === 'tray') return 't';
  if (anchor.kind === 'row') return `r${digits(anchor.index, 2)}`;
  return `i${digits(anchor.id.length, 2)}${anchor.id}`;
}

function canStore(anchor: Anchor): boolean {
  if (anchor.kind === 'row') return Number.isInteger(anchor.index) && anchor.index >= 0 && anchor.index < INK_LIMITS.maxRows;
  if (anchor.kind === 'item') return anchor.id.length >= 1 && anchor.id.length <= INK_LIMITS.maxItemIdLength;
  return true;
}

function noteText(note: Note): string {
  let x = 0;
  let y = 0;
  const strokes = note.strokes.filter((stroke) => stroke.points.length > 0).map((stroke) => {
    const pairs = stroke.points.map((point) => {
      const nextX = gridValue(point.x);
      const nextY = gridValue(point.y);
      const dx = nextX - x;
      const dy = nextY - y;
      x = nextX;
      y = nextY;
      return Math.abs(dx) <= NARROW && Math.abs(dy) <= NARROW
        ? DIGITS[dx + NARROW] + DIGITS[dy + NARROW]
        : DIGITS[WIDE_MARK] + digits(dx + WIDE_OFFSET, 3) + digits(dy + WIDE_OFFSET, 3);
    });
    return STROKE_MARK + COLOUR_CODES[stroke.colour] + pairs.join('');
  });
  return strokes.length === 0 ? '' : NOTE_MARK + anchorText(note.anchor) + strokes.join('');
}

export function inkText(notes: readonly Note[]): string {
  return notes.filter((note) => canStore(note.anchor)).map(noteText).join('');
}

export function encodeInk(notes: readonly Note[]): string | null {
  const text = inkText(notes);
  return text === '' ? null : `${INK_VERSION}.${LZString.compressToEncodedURIComponent(text)}`;
}

const refuse = (reason: InkProblem): InkRead => ({ok: false, reason});

export function readInkText(text: string): InkRead {
  const {maxPoints, maxRows, maxItemIdLength, maxCoordinate} = INK_LIMITS;
  const notes: Note[] = [];
  let at = 0;
  let total = 0;
  const digitsAt = (count: number): number | null => {
    let value = 0;
    for (let place = 0; place < count; place++) {
      const digit = DIGIT_VALUES.get(text[at + place]);
      if (digit === undefined) return null;
      value = value * 64 + digit;
    }
    at += count;
    return value;
  };
  while (at < text.length) {
    if (text[at++] !== NOTE_MARK) return refuse('format');
    const kind = text[at++];
    let anchor: Anchor;
    if (kind === 'f') anchor = {kind: 'frame'};
    else if (kind === 't') anchor = {kind: 'tray'};
    else if (kind === 'r') {
      const index = digitsAt(2);
      if (index === null || index >= maxRows) return refuse('anchor');
      anchor = {kind: 'row', index};
    } else if (kind === 'i') {
      const length = digitsAt(2);
      if (length === null || length < 1 || length > maxItemIdLength || at + length > text.length) return refuse('anchor');
      anchor = {kind: 'item', id: text.slice(at, at + length)};
      at += length;
    } else return refuse('anchor');
    const strokes: Stroke[] = [];
    let x = 0;
    let y = 0;
    while (text[at] === STROKE_MARK) {
      const colour = CODE_COLOURS.get(text[at + 1]);
      if (!colour) return refuse('format');
      at += 2;
      const points: Point[] = [];
      while (at < text.length && text[at] !== STROKE_MARK && text[at] !== NOTE_MARK) {
        const first = digitsAt(1);
        if (first === null) return refuse('format');
        let dx: number;
        let dy: number;
        if (first === WIDE_MARK) {
          const wideX = digitsAt(3);
          const wideY = digitsAt(3);
          if (wideX === null || wideY === null) return refuse('format');
          dx = wideX - WIDE_OFFSET;
          dy = wideY - WIDE_OFFSET;
        } else {
          const second = digitsAt(1);
          if (second === null || second === WIDE_MARK) return refuse('format');
          dx = first - NARROW;
          dy = second - NARROW;
        }
        x += dx;
        y += dy;
        if (Math.abs(x) > maxCoordinate || Math.abs(y) > maxCoordinate) return refuse('points');
        if (++total > maxPoints) return refuse('points');
        points.push({x: x / INK_GRID, y: y / INK_GRID});
      }
      if (points.length === 0) return refuse('format');
      strokes.push({colour, points});
    }
    if (strokes.length === 0) return refuse('format');
    notes.push({anchor, strokes});
  }
  return {ok: true, notes};
}

export function decodeInk(value: unknown): InkRead {
  if (typeof value !== 'string') return refuse('format');
  if (value.length > INK_LIMITS.maxValueLength) return refuse('too-long');
  const prefix = VERSION_PREFIX.exec(value);
  if (!prefix) return refuse('format');
  if (prefix[1] !== String(INK_VERSION)) return refuse('version');
  const text = decompressFromEncodedURIComponentCapped(value.slice(prefix[0].length).replace(/ /g, '+'), INK_LIMITS.maxTextLength);
  return text === null ? refuse('data') : readInkText(text);
}
