import {describe, expect, it} from 'vitest';
import type {Surface} from '@/lib/scribble/anchors';
import type {Note} from '@/lib/scribble/notes';
import {notesOverPictures, outsidePicturesClip, picturesClip} from '@/lib/scribble/pictures';

const A = {x: 10, y: 20, width: 30, height: 40};
const B = {x: 100.5, y: 20, width: 30, height: 40.25};

describe('picturesClip', () => {
  it('returns a shape without area when given no picture', () => {
    expect(picturesClip([])).toBe('inset(50%)');
  });

  it('returns the rectangle of the picture between two visits to the corner of the layer when given one picture', () => {
    expect(picturesClip([A])).toBe('polygon(0 0, 10px 20px, 40px 20px, 40px 60px, 10px 60px, 10px 20px, 0 0)');
  });

  it('returns each rectangle in turn with the corner of the layer between them when given two pictures', () => {
    expect(picturesClip([A, B])).toBe(
      'polygon(0 0, 10px 20px, 40px 20px, 40px 60px, 10px 60px, 10px 20px, 0 0, 100.5px 20px, 130.5px 20px, 130.5px 60.25px, 100.5px 60.25px, 100.5px 20px, 0 0)',
    );
  });
});

describe('outsidePicturesClip', () => {
  it('returns no clip when given no picture', () => {
    expect(outsidePicturesClip([])).toBe('none');
  });

  it('returns the whole layer with the rectangle of the picture as a hole when given one picture', () => {
    expect(outsidePicturesClip([A])).toBe(
      'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 10px 20px, 40px 20px, 40px 60px, 10px 60px, 10px 20px, 0 0)',
    );
  });

  it('returns one hole for each picture when given two pictures', () => {
    expect(outsidePicturesClip([A, B])).toBe(
      'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 10px 20px, 40px 20px, 40px 60px, 10px 60px, 10px 20px, 0 0, 100.5px 20px, 130.5px 20px, 130.5px 60.25px, 100.5px 60.25px, 100.5px 20px, 0 0)',
    );
  });
});

describe('notesOverPictures', () => {
  const surface: Surface = {
    unit: 100,
    items: [{id: 'a', box: {x: 0, y: 0, width: 100, height: 100}, origin: {x: 0, y: 0, unit: 100}, shown: true}],
    rows: [{box: {x: 0, y: 200, width: 600, height: 100}, origin: {x: 100, y: 200, unit: 100}, shown: true}],
    tray: null,
  };
  const picture = {x: 0, y: 0, width: 100, height: 100};
  const line = (anchor: Note['anchor'], from: number, to: number): Note => ({anchor, strokes: [{colour: 'red', points: [{x: from, y: 0.5}, {x: to, y: 0.5}]}]});

  it('returns the note when its box crosses a picture', () => {
    const note = line({kind: 'item', id: 'a'}, 0.2, 0.8);
    expect(notesOverPictures([note], surface, [picture], 0.05)).toEqual([note]);
  });

  it('returns no note when the box of the note is on a row, far from every picture', () => {
    expect(notesOverPictures([line({kind: 'row', index: 0}, 1, 3)], surface, [picture], 0.05)).toEqual([]);
  });

  it('returns the note when its box ends within the width of the ink beside a picture', () => {
    const note = line({kind: 'item', id: 'a'}, 1.04, 1.5);
    expect(notesOverPictures([note], surface, [picture], 0.05)).toEqual([note]);
  });

  it('returns no note when the box of the note ends more than the width of the ink beside a picture', () => {
    expect(notesOverPictures([line({kind: 'item', id: 'a'}, 1.06, 1.5)], surface, [picture], 0.05)).toEqual([]);
  });

  it('returns no note when the anchor of the note is gone from the surface', () => {
    expect(notesOverPictures([line({kind: 'item', id: 'b'}, 0.2, 0.8)], surface, [picture], 0.05)).toEqual([]);
  });
});
