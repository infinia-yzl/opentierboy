import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import {decodeInk, encodeInk, INK_LIMITS, INK_VERSION, inkText, readInkText} from '@/lib/scribble/format';
import type {Note} from '@/lib/scribble/notes';
import {INK_SUPPLY} from '@/lib/scribble/supply';

const valueOf = (text: string) => `1.${LZString.compressToEncodedURIComponent(text)}`;

const NOTES: Note[] = [
  {anchor: {kind: 'item', id: 'ana'}, strokes: [{colour: 'red', points: [{x: 0.25, y: 0.25}, {x: 0.75, y: 0.75}]}]},
  {anchor: {kind: 'row', index: 2}, strokes: [{colour: 'blue', points: [{x: 1, y: 0}]}, {colour: 'contrast', points: [{x: 1, y: 0.5}, {x: -3, y: 0.5}]}]},
  {anchor: {kind: 'tray'}, strokes: [{colour: 'red', points: [{x: 0, y: 0}]}]},
  {anchor: {kind: 'frame'}, strokes: [{colour: 'blue', points: [{x: 9.5, y: 0.75}]}]},
];
const TEXT = '~iADana.rnnvv~rAC.b_gAggAA.cfv_f-AgAA~t.rff~f.b_gEwgAY';

describe('INK_LIMITS', () => {
  it('returns the ink supply as the most points, 100 rows and ids of 256 characters when the limits are read', () => {
    expect(INK_VERSION).toBe(1);
    expect(INK_LIMITS).toMatchObject({maxPoints: INK_SUPPLY, maxRows: 100, maxItemIdLength: 256, maxValueLength: 1_000_000, maxTextLength: 150_000});
  });
});

describe('inkText', () => {
  it('returns each note as its anchor and its strokes, each step from the point before, when given four notes', () => {
    expect(inkText(NOTES)).toBe(TEXT);
  });

  it('returns two digits for a step of at most 31 grid units and seven for a longer one when a stroke has both', () => {
    const note: Note = {anchor: {kind: 'frame'}, strokes: [{colour: 'red', points: [{x: 31 / 32, y: -31 / 32}, {x: 2, y: -31 / 32}]}]};
    expect(inkText([note])).toBe('~f.r-A_gAhgAA');
  });

  it('returns the place on the grid of 1/32 tile when a point lies between two grid lines', () => {
    const note: Note = {anchor: {kind: 'frame'}, strokes: [{colour: 'red', points: [{x: 0.26, y: 0.24}]}]};
    expect(inkText([note])).toBe('~f.rnn');
  });

  it('returns a place at the edge of the range when a point lies beyond 65,535 grid units, or is no number', () => {
    const note: Note = {anchor: {kind: 'frame'}, strokes: [{colour: 'red', points: [{x: 1e9, y: -1e9}, {x: NaN, y: Infinity}]}]};
    expect(readInkText(inkText([note]))).toEqual({ok: true, notes: [{anchor: {kind: 'frame'}, strokes: [{colour: 'red', points: [{x: 65535 / 32, y: -65535 / 32}, {x: 0, y: 0}]}]}]});
  });

  it('returns no text when a note has no strokes, a stroke has no points or an anchor is outside the limits', () => {
    const notes: Note[] = [
      {anchor: {kind: 'frame'}, strokes: []},
      {anchor: {kind: 'frame'}, strokes: [{colour: 'red', points: []}]},
      {anchor: {kind: 'row', index: 100}, strokes: [{colour: 'red', points: [{x: 0, y: 0}]}]},
      {anchor: {kind: 'item', id: 'k'.repeat(257)}, strokes: [{colour: 'red', points: [{x: 0, y: 0}]}]},
      {anchor: {kind: 'item', id: ''}, strokes: [{colour: 'red', points: [{x: 0, y: 0}]}]},
    ];
    expect(inkText(notes)).toBe('');
  });
});

describe('encodeInk', () => {
  it('returns null when there is no note', () => {
    expect(encodeInk([])).toBeNull();
  });

  it('returns "1." and the lz-string of the text when there are notes', () => {
    expect(encodeInk(NOTES)).toBe(valueOf(TEXT));
  });

  it('returns only characters that an address takes as they are when an item id has other characters', () => {
    const note: Note = {anchor: {kind: 'item', id: 'a b&c=d#e?f%/ü🙂'}, strokes: [{colour: 'red', points: [{x: 0, y: 0}]}]};
    expect(encodeInk([note])).toMatch(/^1\.[A-Za-z0-9+$-]+$/);
  });
});

describe('decodeInk', () => {
  it('returns the notes when text follows complete data, as lz-string reads to its end code and no further', () => {
    expect(decodeInk(`${encodeInk(NOTES)}) [x](https://evil.example)`)).toEqual({ok: true, notes: NOTES});
  });

  it('returns the same notes when a small step is written in the wide form', () => {
    expect(decodeInk(valueOf('~f.r_gAIgAI'))).toEqual(decodeInk(valueOf('~f.rnn')));
  });

  it('returns the notes when the value was written by encodeInk', () => {
    expect(decodeInk(encodeInk(NOTES))).toEqual({ok: true, notes: NOTES});
  });

  it('returns an id with the marks of the format as it is when an item id has them', () => {
    const notes: Note[] = [{anchor: {kind: 'item', id: '~f.r~t.b'}, strokes: [{colour: 'red', points: [{x: 1, y: 1}]}]}];
    expect(decodeInk(encodeInk(notes))).toEqual({ok: true, notes});
  });

  it('returns the notes when a pen was drawn to its end with one point per note, on items with the longest ids', () => {
    const letters = (seed: number) => Array.from({length: 256}, (_, index) => String.fromCharCode(0x100 + ((seed * 7919 + index * 104729) % 0xd000))).join('');
    const notes: Note[] = Array.from({length: INK_SUPPLY}, (_, index) => ({
      anchor: {kind: 'item', id: letters(index)},
      strokes: [{colour: 'red', points: [{x: index % 2 ? 2000 : -2000, y: index % 3 ? 2000 : -2000}]}],
    }));
    const value = encodeInk(notes)!;
    expect(inkText(notes).length).toBeLessThanOrEqual(INK_LIMITS.maxTextLength);
    expect(value.length).toBeLessThanOrEqual(INK_LIMITS.maxValueLength);
    expect(decodeInk(value)).toEqual({ok: true, notes});
  });
});

describe('decodeInk with values it refuses', () => {
  it.each([null, undefined, 3, {}, ['1.Q']])('returns reason format when the value is %j', (value) => {
    expect(decodeInk(value)).toEqual({ok: false, reason: 'format'});
  });

  it.each(['', '1', 'ink', '.abc', 'v1.abc', '-1.abc', '1 .abc', '1e0.abc', '+1.abc'])('returns reason format when the value "%s" has no version before a dot', (value) => {
    expect(decodeInk(value)).toEqual({ok: false, reason: 'format'});
  });

  it.each(['01.', '001.', '0.', '00.'])('returns reason format when the version is written as "%s", with a zero in front', (prefix) => {
    expect(decodeInk(prefix + LZString.compressToEncodedURIComponent(TEXT))).toEqual({ok: false, reason: 'format'});
  });

  it.each(['2.', '10.', '11.', '1000.', `${'9'.repeat(400)}.`])('returns reason version when the value starts with "%s"', (prefix) => {
    expect(decodeInk(prefix + LZString.compressToEncodedURIComponent(TEXT))).toEqual({ok: false, reason: 'version'});
  });

  it('returns reason too-long when the value has more characters than maxValueLength', () => {
    expect(decodeInk(`1.${'A'.repeat(INK_LIMITS.maxValueLength)}`)).toEqual({ok: false, reason: 'too-long'});
  });

  it.each(['1.', '1.Q', '1.!!!!', '1.AAAA', `1.${LZString.compressToEncodedURIComponent(TEXT).slice(0, 20)}`])('returns reason data when "%s" is not complete lz-string data', (value) => {
    expect(decodeInk(value)).toEqual({ok: false, reason: 'data'});
  });

  it('returns reason data when the text would be longer than maxTextLength, without decompressing it', () => {
    const bomb = valueOf('~f.r' + 'ff'.repeat(INK_LIMITS.maxTextLength / 2));
    expect(bomb.length).toBeLessThan(2_000);
    expect(decodeInk(bomb)).toEqual({ok: false, reason: 'data'});
  });

  it.each([
    ['text before the first note', 'f.rff'],
    ['a note without a stroke', '~f'],
    ['a note without a stroke before another note', '~f~t.rff'],
    ['a stroke without a point', '~f.r'],
    ['a colour outside the set', '~f.gff'],
    ['a stroke without a colour', '~f.'],
    ['half a step', '~f.rf'],
    ['a character outside the digits in a step', '~f.rf!'],
    ['the wide mark as the second digit', '~f.rf_'],
    ['a wide step cut short', '~f.r_gAAgA'],
    ['text after an item id that ends the value', '~iABa'],
    ['a line break', '~f.rff\n'],
  ])('returns reason format when the text has %s', (_name, text) => {
    expect(decodeInk(valueOf(text))).toEqual({ok: false, reason: 'format'});
  });

  it.each([
    ['an anchor letter outside f, t, r and i', '~x.rff'],
    ['no anchor', '~'],
    ['row 101 (index 100)', '~rBk.rff'],
    ['a row without its two digits', '~r.rff'],
    ['an item id of no length', '~iAA.rff'],
    ['an item id of 257 characters', `~iEB${'k'.repeat(257)}.rff`],
    ['an item id shorter than its length says', '~iAJana'],
    ['an item without its length', '~i'],
  ])('returns reason anchor when the text has %s', (_name, text) => {
    expect(decodeInk(valueOf(text))).toEqual({ok: false, reason: 'anchor'});
  });

  it('returns reason points when the notes have one point more than the ink supply', () => {
    const full = `~f.r${'gf'.repeat(INK_SUPPLY)}`;
    expect(decodeInk(valueOf(full))).toMatchObject({ok: true});
    expect(decodeInk(valueOf(`${full}gf`))).toEqual({ok: false, reason: 'points'});
    expect(decodeInk(valueOf(`${full}~t.bff`))).toEqual({ok: false, reason: 'points'});
  });

  it('returns reason points when steps add up to a place beyond 65,535 grid units', () => {
    expect(decodeInk(valueOf('~f.r_v__gAA'))).toMatchObject({ok: true});
    expect(decodeInk(valueOf('~f.r_v__gAAgf'))).toEqual({ok: false, reason: 'points'});
    expect(decodeInk(valueOf('~f.r_AAAgAA'))).toEqual({ok: false, reason: 'points'});
  });

  it('returns a result and throws nothing when the text is random characters of the format', () => {
    const alphabet = '~.frticbA_9kI';
    let seed = 99;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let run = 0; run < 2000; run++) {
      const text = Array.from({length: 1 + (next() % 24)}, () => alphabet[next() % alphabet.length]).join('');
      const read = decodeInk(valueOf(text));
      expect(typeof read.ok).toBe('boolean');
      if (read.ok) expect(JSON.stringify(read.notes)).not.toMatch(/null|NaN/);
    }
  });
});
