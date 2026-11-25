'use client';

import {useSyncExternalStore} from 'react';
import {DEFAULT_INK_COLOUR, type InkColour} from '@/lib/scribble/colours';
import {pointsIn, removeLastNote as withoutLastNote, type Note} from '@/lib/scribble/notes';

export interface ScribbleView {
  readonly on: boolean;
  readonly colour: InkColour;
  readonly notes: readonly Note[];
  readonly spent: number;
}

const NO_NOTES: readonly Note[] = Object.freeze([]);
const INITIAL_VIEW: ScribbleView = Object.freeze({on: false, colour: DEFAULT_INK_COLOUR, notes: NO_NOTES, spent: 0});

function createScribbleStore() {
  let view = INITIAL_VIEW;
  let drawing = 0;
  const listeners = new Set<() => void>();
  const set = (next: Omit<ScribbleView, 'spent'>) => {
    view = Object.freeze({...next, spent: pointsIn(next.notes) + drawing});
    listeners.forEach(listener => listener());
  };
  return Object.freeze({
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: (): ScribbleView => view,
    setOn(on: boolean) {
      if (on !== view.on) set({...view, on});
    },
    toggle() {
      set({...view, on: !view.on});
    },
    setColour(colour: InkColour) {
      if (colour !== view.colour) set({...view, colour});
    },
    setDrawing(points: number) {
      if (points === drawing) return;
      drawing = points;
      set(view);
    },
    setNotes(notes: readonly Note[]) {
      drawing = 0;
      set({...view, notes});
    },
    removeLastNote() {
      if (view.notes.length > 0) set({...view, notes: withoutLastNote(view.notes)});
    },
    clear() {
      if (view.notes.length > 0) set({...view, notes: NO_NOTES});
    },
    reset() {
      drawing = 0;
      set(INITIAL_VIEW);
    },
  });
}

const store = createScribbleStore();
const serverSnapshot = (): ScribbleView => INITIAL_VIEW;

export function useScribble(): ScribbleView {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
}

export const getScribble = store.getSnapshot;
export const setScribble = store.setOn;
export const toggleScribble = store.toggle;
export const setInkColour = store.setColour;
export const setInkBeingDrawn = store.setDrawing;
export const setScribbleNotes = store.setNotes;
export const removeLastNote = store.removeLastNote;
export const clearScribbles = store.clear;
export const resetScribble = store.reset;
