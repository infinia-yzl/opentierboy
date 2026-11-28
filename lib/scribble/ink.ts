import {decodeInk, encodeInk, type InkProblem} from '@/lib/scribble/format';
import type {Note} from '@/lib/scribble/notes';

export interface Ink {
  readonly raw: string | null;
  readonly value: string | null;
  readonly notes: readonly Note[];
  readonly problem: InkProblem | null;
}

const NO_NOTES: readonly Note[] = Object.freeze([]);

export const NO_INK: Ink = Object.freeze({raw: null, value: null, notes: NO_NOTES, problem: null});

export function inkOfNotes(notes: readonly Note[]): Ink {
  const value = encodeInk(notes);
  return value === null ? NO_INK : Object.freeze({raw: value, value, notes, problem: null});
}

export function inkOfAddress(raw: string | null): Ink {
  if (raw === null) return NO_INK;
  const decoded = decodeInk(raw);
  if (!decoded.ok) return Object.freeze({raw, value: null, notes: NO_NOTES, problem: decoded.reason});
  return Object.freeze({raw, value: encodeInk(decoded.notes), notes: decoded.notes, problem: null});
}
