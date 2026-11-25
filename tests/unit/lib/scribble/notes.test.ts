import {describe, expect, it} from 'vitest';
import type {Place, Surface} from '@/lib/scribble/anchors';
import {addStroke, JOIN_DISTANCE, noteBox, pointsIn, removeLastNote, type Note} from '@/lib/scribble/notes';

const place = (x: number, y: number, width: number, height: number, unit: number): Place => ({
  box: {x, y, width, height},
  origin: {x, y, unit},
  shown: true,
});

const SURFACE: Surface = {
  unit: 80,
  items: [{id: 'ana', ...place(100, 0, 80, 80, 80)}],
  rows: [place(0, 0, 600, 80, 80)],
  tray: place(0, 260, 600, 120, 80),
};

const MOVED: Surface = {...SURFACE, items: [{id: 'ana', ...place(0, 260, 40, 40, 40)}]};
const WITHOUT_ANA: Surface = {...SURFACE, items: []};

const onAna = [{x: 120, y: 20}, {x: 160, y: 60}];
const first = (surface: Surface = SURFACE) => addStroke([], surface, 'red', onAna);

describe('JOIN_DISTANCE', () => {
  it('returns half a tile when the constant is read', () => {
    expect(JOIN_DISTANCE).toBe(0.5);
  });
});

describe('addStroke', () => {
  it('returns a note on the item when the centre of the first stroke is on a tile', () => {
    expect(first()).toEqual([{anchor: {kind: 'item', id: 'ana'}, strokes: [{colour: 'red', points: [{x: 0.25, y: 0.25}, {x: 0.75, y: 0.75}]}]}]);
  });

  it('returns a note on the row when the centre of the stroke is on a row and on no tile', () => {
    expect(addStroke([], SURFACE, 'blue', [{x: 300, y: 40}])[0].anchor).toEqual({kind: 'row', index: 0});
  });

  it('returns a note on the tray when the centre of the stroke is on the Unranked tray', () => {
    expect(addStroke([], SURFACE, 'blue', [{x: 300, y: 300}])[0].anchor).toEqual({kind: 'tray'});
  });

  it('returns a note on the frame, in tile sizes from its corner, when the stroke is in free space', () => {
    expect(addStroke([], SURFACE, 'contrast', [{x: 640, y: 160}, {x: 720, y: 200}])).toEqual([
      {anchor: {kind: 'frame'}, strokes: [{colour: 'contrast', points: [{x: 8, y: 2}, {x: 9, y: 2.5}]}]},
    ]);
  });

  it('returns points on the grid of 1/32 tile when the pointer was between two grid lines', () => {
    expect(addStroke([], SURFACE, 'red', [{x: 121, y: 19}, {x: 159.4, y: 62.6}])[0].strokes[0].points).toEqual([{x: 0.25, y: 0.25}, {x: 0.75, y: 0.78125}]);
  });

  it('returns one note of two strokes when the second stroke is within half a tile of the first', () => {
    const notes = addStroke(first(), SURFACE, 'blue', [{x: 199, y: 20}, {x: 230, y: 30}]);
    expect(notes).toHaveLength(1);
    expect(notes[0].anchor).toEqual({kind: 'item', id: 'ana'});
    expect(notes[0].strokes.map((stroke) => stroke.colour)).toEqual(['red', 'blue']);
  });

  it('returns the joined stroke in the tile sizes of the note’s anchor when the stroke starts on a row', () => {
    const notes = addStroke(first(), SURFACE, 'blue', [{x: 200, y: 40}]);
    expect(notes[0].strokes[1].points).toEqual([{x: 1.25, y: 0.5}]);
  });

  it('returns two notes when the second stroke is more than half a tile from the first', () => {
    const notes = addStroke(first(), SURFACE, 'blue', [{x: 201, y: 20}, {x: 230, y: 30}]);
    expect(notes.map((note) => note.anchor)).toEqual([{kind: 'item', id: 'ana'}, {kind: 'row', index: 0}]);
  });

  it('returns the stroke in the nearest note when two notes are within half a tile', () => {
    const two = addStroke(first(), SURFACE, 'red', [{x: 260, y: 20}, {x: 300, y: 60}]);
    const notes = addStroke(two, SURFACE, 'blue', [{x: 225, y: 40}, {x: 230, y: 40}]);
    expect(notes.map((note) => note.strokes.length)).toEqual([1, 2]);
  });

  it('returns a new note when the only note in reach has an absent anchor', () => {
    const notes = addStroke(first(), WITHOUT_ANA, 'blue', onAna);
    expect(notes.map((note) => note.anchor)).toEqual([{kind: 'item', id: 'ana'}, {kind: 'row', index: 0}]);
  });

  it('returns the same notes when the stroke has no point', () => {
    const notes = first();
    expect(addStroke(notes, SURFACE, 'red', [])).toBe(notes);
  });
});

describe('noteBox', () => {
  it('returns the box at the tile’s new place and size when the tile of the note moved', () => {
    expect(noteBox(first()[0], MOVED.items[0].origin)).toEqual({x: 10, y: 270, width: 20, height: 20});
  });
});

describe('pointsIn', () => {
  it('returns 0 when there is no note', () => {
    expect(pointsIn([])).toBe(0);
  });

  it('returns the points of every stroke of every note when there are two notes', () => {
    const notes = addStroke(addStroke(first(), SURFACE, 'blue', [{x: 190, y: 20}]), SURFACE, 'red', [{x: 500, y: 300}, {x: 510, y: 300}, {x: 520, y: 300}]);
    expect(notes).toHaveLength(2);
    expect(pointsIn(notes)).toBe(6);
  });

  it('returns the points of a note with an absent anchor when its item is gone', () => {
    const hidden: Note = {anchor: {kind: 'item', id: 'gone'}, strokes: [{colour: 'red', points: [{x: 0, y: 0}, {x: 1, y: 1}]}]};
    expect(pointsIn([hidden])).toBe(2);
  });
});

describe('removeLastNote', () => {
  it('returns the notes without the newest one, with all its strokes, when there are two notes', () => {
    const two = addStroke(first(), SURFACE, 'blue', [{x: 500, y: 300}]);
    const three = addStroke(two, SURFACE, 'blue', [{x: 510, y: 310}]);
    expect(three[1].strokes).toHaveLength(2);
    expect(removeLastNote(three)).toEqual(first());
  });

  it('returns no note when there is none', () => {
    expect(removeLastNote([])).toEqual([]);
  });
});
