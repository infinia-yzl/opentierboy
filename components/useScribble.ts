'use client';

import {useCallback, useMemo, useSyncExternalStore} from 'react';
import {usePathname, useSearchParams} from 'next/navigation';
import {listAddressWritten} from '@/components/useListSteps';
import {inkInSearch, inkParam, searchWithInk} from '@/lib/scribble/address';
import {DEFAULT_INK_COLOUR, type InkColour} from '@/lib/scribble/colours';
import {decodeInk, encodeInk, type InkProblem} from '@/lib/scribble/format';
import {pointsIn, removeLastNote as withoutLastNote, type Note} from '@/lib/scribble/notes';

export interface Ink {
  readonly value: string | null;
  readonly notes: readonly Note[];
  readonly problem: InkProblem | null;
}

interface Pen {
  readonly on: boolean;
  readonly colour: InkColour;
  readonly drawing: number;
  readonly unsaved: readonly Note[] | null;
}

export interface ScribbleView {
  readonly on: boolean;
  readonly colour: InkColour;
  readonly notes: readonly Note[];
  readonly spent: number;
  readonly ink: string | null;
  readonly addressInk: string | null;
  readonly problem: InkProblem | null;
}

const NO_NOTES: readonly Note[] = Object.freeze([]);
const NO_INK: Ink = Object.freeze({value: null, notes: NO_NOTES, problem: null});
const INITIAL_PEN: Pen = Object.freeze({on: false, colour: DEFAULT_INK_COLOUR, drawing: 0, unsaved: null});
const KEPT_INKS = 16;

const pathInWindow = () => decodeURI(window.location.pathname);
const addressInWindow = () => window.location.pathname + window.location.search;

function createScribbleStore() {
  let pen = INITIAL_PEN;
  let run: string | null = null;
  let listening = false;
  const inks = new Map<string, Ink>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const setPen = (next: Pen) => {
    pen = Object.freeze(next);
    notify();
  };
  const keep = (value: string, ink: Ink): Ink => {
    inks.delete(value);
    inks.set(value, ink);
    if (inks.size > KEPT_INKS) inks.delete(inks.keys().next().value as string);
    return ink;
  };
  const read = (value: string | null): Ink => {
    if (value === null) return NO_INK;
    const known = inks.get(value);
    if (known) return keep(value, known);
    const decoded = decodeInk(value);
    return keep(value, Object.freeze(decoded.ok ? {value, notes: decoded.notes, problem: null} : {value, notes: NO_NOTES, problem: decoded.reason}));
  };
  const inkNow = () => read(inkInSearch(window.location.search));
  const notesNow = () => pen.unsaved ?? inkNow().notes;
  const onPopState = () => {
    run = null;
    if (pen.unsaved) setPen({...pen, unsaved: null});
    else notify();
  };
  const writeAddress = (href: string, value: string | null): boolean => {
    const continues = run !== null && run === addressInWindow();
    try {
      if (continues) window.history.replaceState(null, '', href);
      else window.history.pushState(null, '', href);
    } catch {
      return false;
    }
    if (inkInSearch(window.location.search) !== value) return false;
    run = href;
    listAddressWritten(continues ? 'replace' : 'push');
    return true;
  };
  const write = (notes: readonly Note[]) => {
    const value = encodeInk(notes);
    if (value !== null) keep(value, Object.freeze({value, notes, problem: null}));
    const saved = value === inkInSearch(window.location.search)
      || writeAddress(window.location.pathname + searchWithInk(window.location.search, value), value);
    setPen({...pen, drawing: 0, unsaved: saved ? null : notes});
  };
  const save = () => {
    if (pen.unsaved) write(pen.unsaved);
  };
  return Object.freeze({
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      if (!listening) {
        listening = true;
        window.addEventListener('popstate', onPopState);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && listening) {
          listening = false;
          window.removeEventListener('popstate', onPopState);
        }
      };
    },
    getPen: (): Pen => pen,
    read,
    notesNow,
    write,
    setOn(on: boolean) {
      if (on === pen.on) return;
      if (!on) save();
      setPen({...pen, on});
    },
    toggle() {
      if (pen.on) save();
      setPen({...pen, on: !pen.on});
    },
    setColour(colour: InkColour) {
      if (colour !== pen.colour) setPen({...pen, colour});
    },
    setDrawing(drawing: number) {
      if (drawing !== pen.drawing) setPen({...pen, drawing});
    },
    removeLastNote() {
      const notes = notesNow();
      if (notes.length > 0) write(withoutLastNote(notes));
    },
    clear() {
      if (notesNow().length > 0) write(NO_NOTES);
    },
    listAddress(href: string, pathname: string, mode: 'push' | 'replace'): string {
      const here = pathInWindow() === pathname;
      const ink = here ? inkNow() : NO_INK;
      const value = here && pen.unsaved ? encodeInk(pen.unsaved) : ink.problem === null ? ink.value : null;
      const next = value === null ? href : `${href}&ink=${value}`;
      run = mode === 'replace' && here && run !== null && run === addressInWindow() ? next : null;
      if (pen.unsaved) setPen({...pen, unsaved: null});
      return next;
    },
    reset() {
      run = null;
      setPen(INITIAL_PEN);
    },
  });
}

const store = createScribbleStore();
const serverPen = (): Pen => INITIAL_PEN;
const serverInk = (): string | null => null;

export function useScribble(): ScribbleView {
  const pathname = usePathname();
  const routerInk = inkParam(useSearchParams().get('ink'));
  const inkValueNow = useCallback(
    () => (pathInWindow() === pathname ? inkInSearch(window.location.search) : routerInk),
    [pathname, routerInk],
  );
  const value = useSyncExternalStore(store.subscribe, inkValueNow, serverInk);
  const pen = useSyncExternalStore(store.subscribe, store.getPen, serverPen);
  return useMemo(() => {
    const ink = store.read(value);
    const notes = pen.unsaved ?? ink.notes;
    return {
      on: pen.on,
      colour: pen.colour,
      notes,
      spent: pointsIn(notes) + pen.drawing,
      ink: ink.problem === null ? ink.value : null,
      addressInk: ink.value,
      problem: ink.problem,
    };
  }, [value, pen]);
}

export const getPen = store.getPen;
export const getInkNotes = store.notesNow;
export const setScribble = store.setOn;
export const toggleScribble = store.toggle;
export const setInkColour = store.setColour;
export const setInkBeingDrawn = store.setDrawing;
export const writeScribbleNotes = store.write;
export const removeLastNote = store.removeLastNote;
export const clearScribbles = store.clear;
export const listAddressWithInk = store.listAddress;
export const resetScribble = store.reset;
