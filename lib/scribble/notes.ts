import {anchorAt, boxCentre, boxGap, boxOf, fromAnchor, originOf, toAnchor, type Anchor, type Box, type Origin, type Surface} from '@/lib/scribble/anchors';
import type {InkColour} from '@/lib/scribble/colours';
import type {Point} from '@/lib/scribble/points';

export interface Stroke {
  readonly colour: InkColour;
  readonly points: readonly Point[];
}

export interface Note {
  readonly anchor: Anchor;
  readonly strokes: readonly Stroke[];
}

export const JOIN_DISTANCE = 0.5;

export function pointsIn(notes: readonly Note[]): number {
  return notes.reduce((sum, note) => sum + note.strokes.reduce((count, stroke) => count + stroke.points.length, 0), 0);
}

export function noteBox(note: Note, origin: Origin): Box {
  return boxOf(note.strokes.flatMap((stroke) => stroke.points.map((point) => fromAnchor(origin, point))));
}

function noteToJoin(notes: readonly Note[], surface: Surface, box: Box): number {
  const reach = JOIN_DISTANCE * surface.unit;
  return notes.reduce<{index: number; gap: number}>((best, note, index) => {
    const origin = originOf(surface, note.anchor);
    if (!origin) return best;
    const gap = boxGap(noteBox(note, origin), box);
    return gap <= reach && gap < best.gap ? {index, gap} : best;
  }, {index: -1, gap: Infinity}).index;
}

export function addStroke(notes: readonly Note[], surface: Surface, colour: InkColour, points: readonly Point[]): readonly Note[] {
  if (points.length === 0) return notes;
  const box = boxOf(points);
  const joined = noteToJoin(notes, surface, box);
  const anchor = joined >= 0 ? notes[joined].anchor : anchorAt(surface, boxCentre(box));
  const origin = originOf(surface, anchor);
  if (!origin) return notes;
  const stroke: Stroke = {colour, points: points.map((point) => toAnchor(origin, point))};
  if (joined < 0) return [...notes, {anchor, strokes: [stroke]}];
  return notes.map((note, index) => index === joined ? {anchor: note.anchor, strokes: [...note.strokes, stroke]} : note);
}

export function removeLastNote(notes: readonly Note[]): readonly Note[] {
  return notes.slice(0, -1);
}
