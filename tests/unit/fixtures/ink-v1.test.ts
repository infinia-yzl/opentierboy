import {describe, expect, it} from 'vitest';
import inkFixtures from '../../fixtures/scribble/ink-v1.json';
import {decodeInk, encodeInk} from '@/lib/scribble/format';
import type {Note} from '@/lib/scribble/notes';

const entries = inkFixtures as unknown as {id: string; description: string; ink: string; notes: Note[]}[];

describe('tests/fixtures/scribble/ink-v1.json', () => {
  it('returns 6 entries or more, each with its own id, when the file is read', () => {
    expect(entries.length).toBeGreaterThanOrEqual(6);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });

  it.each(entries.map((entry) => [entry.id, entry] as const))('returns the notes of %s when its ink value is decoded', (_id, entry) => {
    expect(decodeInk(entry.ink)).toEqual({ok: true, notes: entry.notes});
  });

  it('returns the notes of each entry when the address turned each + of its ink value into a space', () => {
    expect(entries.filter((entry) => entry.ink.includes('+')).length).toBeGreaterThanOrEqual(1);
    for (const entry of entries) expect(decodeInk(entry.ink.replace(/\+/g, ' '))).toEqual({ok: true, notes: entry.notes});
  });

  it.each(entries.map((entry) => [entry.id, entry] as const))('returns the ink value of %s when its notes are encoded', (_id, entry) => {
    expect(encodeInk(entry.notes)).toBe(entry.ink);
  });
});
