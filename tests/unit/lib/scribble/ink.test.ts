import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import inkFixtures from '../../../fixtures/scribble/ink-v1.json';
import {encodeInk} from '@/lib/scribble/format';
import {inkOfAddress, inkOfNotes, NO_INK} from '@/lib/scribble/ink';
import type {Note} from '@/lib/scribble/notes';

const NOTES: Note[] = [{anchor: {kind: 'item', id: 'ana'}, strokes: [{colour: 'red', points: [{x: 0.25, y: 0.25}, {x: 0.75, y: 0.75}]}]}];
const VALUE = encodeInk(NOTES)!;
const CANONICAL = /^1\.[A-Za-z0-9+$-]+$/;
const TAILS = [
  ') [x](https://evil.example) @everyone\n# hi&foo=bar#frag',
  '.',
  ')',
  '&state=3.other',
  '#fragment',
  '<script>alert(1)</script>',
  '%0A%0D',
  'AAAA',
];

describe('inkOfAddress', () => {
  it('returns no ink when the address has no ink value', () => {
    expect(inkOfAddress(null)).toBe(NO_INK);
    expect(NO_INK).toEqual({raw: null, value: null, notes: [], problem: null});
  });

  it('returns the value as it is for sharing and writing when the app wrote it', () => {
    expect(inkOfAddress(VALUE)).toEqual({raw: VALUE, value: VALUE, notes: NOTES, problem: null});
  });

  it.each(TAILS)('returns the notes and the value without the tail when the text %j follows valid data', (tail) => {
    const ink = inkOfAddress(VALUE + tail);
    expect(ink).toEqual({raw: VALUE + tail, value: VALUE, notes: NOTES, problem: null});
  });

  it('returns the one value that encodeInk writes when another text decodes to the same notes', () => {
    const wideStep = `1.${LZString.compressToEncodedURIComponent('~iADana.r_gAIgAIvv')}`;
    expect(wideStep).not.toBe(VALUE);
    expect(inkOfAddress(wideStep)).toEqual({raw: wideStep, value: VALUE, notes: NOTES, problem: null});
  });

  it('returns no value for sharing and writing, and the reason, when the value cannot be read', () => {
    for (const raw of ['1.this-is-not-ink', '2.abc', 'x', `${VALUE.slice(0, 12)}") [x](https://evil.example)`]) {
      const ink = inkOfAddress(raw);
      expect(ink.raw).toBe(raw);
      expect(ink.value).toBeNull();
      expect(ink.notes).toEqual([]);
      expect(ink.problem).not.toBeNull();
    }
  });

  it('returns a value of digits, letters, +, - and $ after "1." when each golden value has a hostile tail', () => {
    for (const entry of inkFixtures as unknown as {id: string; ink: string}[]) {
      for (const tail of TAILS) {
        const {value} = inkOfAddress(entry.ink + tail);
        expect(value, entry.id).toBe(entry.ink);
        expect(value, entry.id).toMatch(CANONICAL);
      }
    }
  });
});

describe('inkOfNotes', () => {
  it('returns no ink when there is no note', () => {
    expect(inkOfNotes([])).toBe(NO_INK);
  });

  it('returns the notes with the value that encodeInk writes when there are notes', () => {
    expect(inkOfNotes(NOTES)).toEqual({raw: VALUE, value: VALUE, notes: NOTES, problem: null});
  });
});
