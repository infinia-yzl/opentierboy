'use client';

import {useCallback, useEffect, useMemo, useSyncExternalStore} from 'react';
import {usePathname, useSearchParams} from 'next/navigation';
import {listAddressWritten} from '@/components/useListSteps';
import {inkInSearch, inkParam, searchWithInk} from '@/lib/scribble/address';
import {DEFAULT_INK_COLOUR, type InkColour} from '@/lib/scribble/colours';
import type {InkProblem} from '@/lib/scribble/format';
import {inkOfAddress, inkOfNotes, NO_INK, type Ink} from '@/lib/scribble/ink';
import {pointsIn, removeLastNote as withoutLastNote, type Note} from '@/lib/scribble/notes';
import {INK_WRITE_LIMIT, INK_WRITE_LIMIT_STORAGE_KEY, inkWriteDecision, inkWriteLimitFrom, type InkWriteLimit} from '@/lib/scribble/writeLimit';

interface Unsaved {
  readonly ink: Ink;
  readonly at: string;
}

interface Pen {
  readonly on: boolean;
  readonly colour: InkColour;
  readonly drawing: number;
  readonly unsaved: Unsaved | null;
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
const INITIAL_PEN: Pen = Object.freeze({on: false, colour: DEFAULT_INK_COLOUR, drawing: 0, unsaved: null});
const KEPT_INKS = 16;

const pathInWindow = () => decodeURI(window.location.pathname);
const addressInWindow = () => window.location.pathname + window.location.search;

function storedInkWriteLimit(): InkWriteLimit {
  try {
    return inkWriteLimitFrom(window.localStorage.getItem(INK_WRITE_LIMIT_STORAGE_KEY));
  } catch {
    return INK_WRITE_LIMIT;
  }
}

function tellRouterTheAddress() {
  try {
    window.history.replaceState(null, '', window.location.href);
  } catch {
    return;
  }
}

function createScribbleStore(now: () => number = () => performance.now(), limitNow: () => InkWriteLimit = storedInkWriteLimit) {
  let pen = INITIAL_PEN;
  let run: string | null = null;
  let listening = false;
  let writtenAt: readonly number[] = [];
  const inks = new Map<string, Ink>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  const setPen = (next: Pen) => {
    pen = Object.freeze(next);
    notify();
  };
  const keep = (raw: string, ink: Ink): Ink => {
    inks.delete(raw);
    inks.set(raw, ink);
    if (inks.size > KEPT_INKS) inks.delete(inks.keys().next().value as string);
    return ink;
  };
  const read = (raw: string | null): Ink => (raw === null ? NO_INK : keep(raw, inks.get(raw) ?? inkOfAddress(raw)));
  const unsavedAt = (address: string): Ink | null => (pen.unsaved && pen.unsaved.at === address ? pen.unsaved.ink : null);
  const inkNow = (): Ink => unsavedAt(addressInWindow()) ?? read(inkInSearch(window.location.search));
  const onPopState = () => {
    run = null;
    if (pen.unsaved) setPen({...pen, unsaved: null});
    else notify();
  };
  const mayWrite = (): boolean => inkWriteDecision(writtenAt, now(), limitNow()) === 'write';
  const landed = (href: string, value: string | null, continues: boolean): boolean => {
    try {
      if (continues) window.history.replaceState(null, '', href);
      else window.history.pushState(null, '', href);
    } catch {
      return false;
    }
    return inkInSearch(window.location.search) === value;
  };
  const writeAddress = (href: string, value: string | null): boolean => {
    const continues = run !== null && run === addressInWindow();
    writtenAt = [...writtenAt, now()].slice(-INK_WRITE_LIMIT.writes);
    if (!landed(href, value, continues)) {
      tellRouterTheAddress();
      return false;
    }
    run = href;
    listAddressWritten(continues ? 'replace' : 'push');
    return true;
  };
  const write = (notes: readonly Note[], forced: boolean) => {
    const ink = inkOfNotes(notes);
    if (ink.raw !== null) keep(ink.raw, ink);
    const at = addressInWindow();
    const saved = ink.value === read(inkInSearch(window.location.search)).value
      || ((forced || mayWrite()) && writeAddress(window.location.pathname + searchWithInk(window.location.search, ink.value), ink.value));
    setPen({...pen, drawing: 0, unsaved: saved ? null : {ink, at}});
  };
  const save = () => {
    const unsaved = unsavedAt(addressInWindow());
    if (unsaved) write(unsaved.notes, true);
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') save();
  };
  return Object.freeze({
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      if (!listening) {
        listening = true;
        window.addEventListener('popstate', onPopState);
        window.addEventListener('pagehide', save);
        document.addEventListener('visibilitychange', onVisibilityChange);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && listening) {
          listening = false;
          window.removeEventListener('popstate', onPopState);
          window.removeEventListener('pagehide', save);
          document.removeEventListener('visibilitychange', onVisibilityChange);
        }
      };
    },
    getPen: (): Pen => pen,
    read,
    unsavedAt,
    notesNow: (): readonly Note[] => inkNow().notes,
    write: (notes: readonly Note[]) => write(notes, false),
    save,
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
      const {notes} = inkNow();
      if (notes.length > 0) write(withoutLastNote(notes), false);
    },
    clear() {
      if (inkNow().notes.length > 0) write(NO_NOTES, false);
    },
    listAddress(href: string, pathname: string, mode: 'push' | 'replace'): string {
      const here = pathInWindow() === pathname;
      const {value} = here ? inkNow() : NO_INK;
      const next = value === null ? href : `${href}&ink=${value}`;
      run = mode === 'replace' && here && run !== null && run === addressInWindow() ? next : null;
      return next;
    },
    dropUnsavedOfOtherAddress() {
      if (pen.unsaved && pen.unsaved.at !== addressInWindow()) setPen({...pen, unsaved: null});
    },
    reset() {
      run = null;
      setPen(INITIAL_PEN);
    },
  });
}

const store = createScribbleStore();
const serverPen = (): Pen => INITIAL_PEN;
const serverText = (): string | null => null;

export function useScribble(): ScribbleView {
  const pathname = usePathname();
  const routerInk = inkParam(useSearchParams().get('ink'));
  const rawNow = useCallback(
    () => (pathInWindow() === pathname ? inkInSearch(window.location.search) : routerInk),
    [pathname, routerInk],
  );
  const hereNow = useCallback(() => (pathInWindow() === pathname ? addressInWindow() : null), [pathname]);
  const raw = useSyncExternalStore(store.subscribe, rawNow, serverText);
  const here = useSyncExternalStore(store.subscribe, hereNow, serverText);
  const pen = useSyncExternalStore(store.subscribe, store.getPen, serverPen);
  useEffect(() => {
    if (here !== null) store.dropUnsavedOfOtherAddress();
  }, [here]);
  return useMemo(() => {
    const inAddress = store.read(raw);
    const unsaved = here !== null && pen.unsaved && pen.unsaved.at === here ? pen.unsaved.ink : null;
    const ink = unsaved ?? inAddress;
    return {
      on: pen.on,
      colour: pen.colour,
      notes: ink.notes,
      spent: pointsIn(ink.notes) + pen.drawing,
      ink: ink.value,
      addressInk: inAddress.raw,
      problem: unsaved ? null : inAddress.problem,
    };
  }, [raw, here, pen]);
}

export const getPen = store.getPen;
export const getInkNotes = store.notesNow;
export const setScribble = store.setOn;
export const toggleScribble = store.toggle;
export const setInkColour = store.setColour;
export const setInkBeingDrawn = store.setDrawing;
export const writeScribbleNotes = store.write;
export const saveScribbleNotes = store.save;
export const removeLastNote = store.removeLastNote;
export const clearScribbles = store.clear;
export const listAddressWithInk = store.listAddress;
export const resetScribble = store.reset;
