import {describe, expect, it} from 'vitest';
import {anchorAt, boxCentre, boxGap, boxHolds, boxOf, fromAnchor, MAX_ANCHOR_ID_LENGTH, MAX_ANCHOR_ROWS, originOf, toAnchor, type Place, type Surface} from '@/lib/scribble/anchors';

const place = (x: number, y: number, width: number, height: number, unit: number, shown = true): Place => ({
  box: {x, y, width, height},
  origin: {x, y, unit},
  shown,
});

const SURFACE: Surface = {
  unit: 80,
  items: [
    {id: 'ana', ...place(100, 0, 80, 80, 80)},
    {id: 'mei', ...place(180, 0, 80, 80, 80)},
    {id: 'zen', ...place(0, 300, 40, 40, 40)},
    {id: 'far', ...place(40, 300, 40, 40, 40, false)},
  ],
  rows: [
    {box: {x: 0, y: 0, width: 600, height: 80}, origin: {x: 100, y: 0, unit: 80}, shown: true},
    {box: {x: 0, y: 80, width: 600, height: 80}, origin: {x: 100, y: 80, unit: 80}, shown: true},
  ],
  tray: place(0, 260, 600, 120, 40),
};

describe('boxOf', () => {
  it('returns the smallest box around the points when given three points', () => {
    expect(boxOf([{x: 2, y: 5}, {x: -1, y: 7}, {x: 4, y: 6}])).toEqual({x: -1, y: 5, width: 5, height: 2});
  });
});

describe('boxCentre', () => {
  it('returns the middle of the box when given a box', () => {
    expect(boxCentre({x: 10, y: 20, width: 30, height: 40})).toEqual({x: 25, y: 40});
  });
});

describe('boxHolds', () => {
  it('returns true when the point is on the edge of the box', () => {
    expect(boxHolds({x: 0, y: 0, width: 10, height: 10}, {x: 10, y: 5})).toBe(true);
  });

  it('returns false when the point is outside the box', () => {
    expect(boxHolds({x: 0, y: 0, width: 10, height: 10}, {x: 11, y: 5})).toBe(false);
  });
});

describe('boxGap', () => {
  it('returns 0 when the boxes overlap', () => {
    expect(boxGap({x: 0, y: 0, width: 10, height: 10}, {x: 5, y: 5, width: 10, height: 10})).toBe(0);
  });

  it('returns the distance between the sides when one box is beside the other', () => {
    expect(boxGap({x: 0, y: 0, width: 10, height: 10}, {x: 25, y: 2, width: 10, height: 4})).toBe(15);
  });

  it('returns the distance between the corners when the boxes are apart on both axes', () => {
    expect(boxGap({x: 0, y: 0, width: 10, height: 10}, {x: 13, y: 14, width: 5, height: 5})).toBe(5);
  });
});

describe('anchorAt', () => {
  it('returns the item when the point is on a tile', () => {
    expect(anchorAt(SURFACE, {x: 200, y: 40})).toEqual({kind: 'item', id: 'mei'});
  });

  it('returns the place of the row when the point is on a row and on no tile', () => {
    expect(anchorAt(SURFACE, {x: 400, y: 120})).toEqual({kind: 'row', index: 1});
  });

  it('returns the tray when the point is on the Unranked tray and on no tile', () => {
    expect(anchorAt(SURFACE, {x: 500, y: 270})).toEqual({kind: 'tray'});
  });

  it('returns the tray when the point is on a tile that a scrolling box hides', () => {
    expect(anchorAt(SURFACE, {x: 60, y: 320})).toEqual({kind: 'tray'});
  });

  it('returns the item when its id has MAX_ANCHOR_ID_LENGTH characters, and the row when it has one more', () => {
    const withId = (id: string): Surface => ({...SURFACE, items: [{id, ...place(100, 0, 80, 80, 80)}]});
    const longest = 'k'.repeat(MAX_ANCHOR_ID_LENGTH);
    expect(anchorAt(withId(longest), {x: 120, y: 40})).toEqual({kind: 'item', id: longest});
    expect(anchorAt(withId(`${longest}k`), {x: 120, y: 40})).toEqual({kind: 'row', index: 0});
    expect(anchorAt(withId(''), {x: 120, y: 40})).toEqual({kind: 'row', index: 0});
  });

  it('returns the frame when the point is on a row after the first MAX_ANCHOR_ROWS rows', () => {
    const rows = Array.from({length: MAX_ANCHOR_ROWS + 1}, (_, index) => place(0, index * 10, 600, 10, 10));
    const tall: Surface = {unit: 10, items: [], rows, tray: null};
    expect(anchorAt(tall, {x: 5, y: (MAX_ANCHOR_ROWS - 1) * 10 + 5})).toEqual({kind: 'row', index: MAX_ANCHOR_ROWS - 1});
    expect(anchorAt(tall, {x: 5, y: MAX_ANCHOR_ROWS * 10 + 5})).toEqual({kind: 'frame'});
  });

  it('returns the frame when the point is on no tile, row or tray', () => {
    expect(anchorAt(SURFACE, {x: 700, y: 200})).toEqual({kind: 'frame'});
  });
});

describe('originOf', () => {
  it('returns the corner and the size of the tile when the anchor is an item', () => {
    expect(originOf(SURFACE, {kind: 'item', id: 'zen'})).toEqual({x: 0, y: 300, unit: 40});
  });

  it('returns the start of the item area when the anchor is a row', () => {
    expect(originOf(SURFACE, {kind: 'row', index: 1})).toEqual({x: 100, y: 80, unit: 80});
  });

  it('returns the corner of the tray when the anchor is the tray', () => {
    expect(originOf(SURFACE, {kind: 'tray'})).toEqual({x: 0, y: 260, unit: 40});
  });

  it('returns the corner of the frame and its tile size when the anchor is the frame', () => {
    expect(originOf(SURFACE, {kind: 'frame'})).toEqual({x: 0, y: 0, unit: 80});
  });

  it('returns null when the item of the anchor is absent', () => {
    expect(originOf(SURFACE, {kind: 'item', id: 'gone'})).toBeNull();
  });

  it('returns null when the row of the anchor is absent', () => {
    expect(originOf(SURFACE, {kind: 'row', index: 2})).toBeNull();
  });

  it('returns null when a scrolling box hides the tile of the anchor', () => {
    expect(originOf(SURFACE, {kind: 'item', id: 'far'})).toBeNull();
  });

  it('returns null when the surface has no tray', () => {
    expect(originOf({...SURFACE, tray: null}, {kind: 'tray'})).toBeNull();
  });
});

describe('toAnchor', () => {
  it('returns the point in tile sizes from the origin when given a point of the surface', () => {
    expect(toAnchor({x: 100, y: 80, unit: 80}, {x: 140, y: 200})).toEqual({x: 0.5, y: 1.5});
  });
});

describe('fromAnchor', () => {
  it('returns the same place on the tile when the tile moved and changed its size', () => {
    const stored = toAnchor({x: 100, y: 0, unit: 80}, {x: 140, y: 60});
    expect(fromAnchor({x: 0, y: 300, unit: 40}, stored)).toEqual({x: 20, y: 330});
  });
});
