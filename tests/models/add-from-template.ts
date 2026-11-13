import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {addFromTemplateMachine} from '../machines/add-from-template';
import {always, defineModel, offered} from '../support/machines';

/** The OVERWATCH sets the walk adds: their tags, their titles in the picker, and an image of each. */
export const TEMPLATE_SETS = {
  tank: {tag: 'tank', title: 'Tank', example: 'Mauga'},
  support: {tag: 'sup', title: 'Support', example: 'Mercy'},
} as const;
export const TEMPLATE_SET_KEYS = ['tank', 'support'] as const;
export type TemplateSetKey = typeof TEMPLATE_SET_KEYS[number];

/** The page of the template picker, by the heading of its group of options, or null when it is closed. */
export type PickerPage = 'Packages' | 'OVERWATCH' | null;

/** What one state of the add-from-template machine shows. */
export interface AddFromTemplateView {
  /** The sets whose images Unranked holds, each image once. */
  readonly sets: readonly TemplateSetKey[];
  readonly picker: PickerPage;
  /** The toast "Items Added" with its Undo shows. */
  readonly toast: boolean;
}

export type AddFromTemplateSnapshot = SnapshotFrom<typeof addFromTemplateMachine>;
export type AddFromTemplateEvent = EventFrom<typeof addFromTemplateMachine>;

const SETS_BY_CONTENTS: Readonly<Record<string, readonly TemplateSetKey[]>> = {
  empty: [],
  tank: ['tank'],
  support: ['support'],
  both: ['tank', 'support'],
};

/** Each state below a contents state, by its path, and what the picker and the toast show. */
const OVERLAYS: Readonly<Record<string, Pick<AddFromTemplateView, 'picker' | 'toast'>>> = {
  closed: {picker: null, toast: false},
  'picker.packages': {picker: 'Packages', toast: false},
  'picker.overwatch': {picker: 'OVERWATCH', toast: false},
  picker: {picker: 'OVERWATCH', toast: false},
  tankAdded: {picker: null, toast: true},
  supportAdded: {picker: null, toast: true},
  nothingAdded: {picker: null, toast: true},
};

/** The dotted path of a state value, such as 'empty.picker.overwatch'. */
function statePath(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${statePath(child)}`;
}

/** What the page shows in a state of the add-from-template machine. */
export function addFromTemplateViewOf(snapshot: AddFromTemplateSnapshot): AddFromTemplateView {
  const path = statePath(snapshot.value);
  const [contents, ...rest] = path.split('.');
  const sets = SETS_BY_CONTENTS[contents];
  const overlay = OVERLAYS[rest.join('.')];
  if (!sets || !overlay) throw new RangeError(`No view for the add-from-template state ${path}`);
  return {sets, ...overlay};
}

const constant = fc.constant({});

export const addFromTemplateModel = defineModel({
  id: 'add-from-template',
  machine: addFromTemplateMachine,
  // Every control is sent where the page offers it. Escape is sent everywhere: with the picker
  // closed, the page must ignore it.
  events: {
    OPEN_FROM_MENU: {generate: constant, when: offered('OPEN_FROM_MENU')},
    OPEN_FROM_DROP_AREA: {generate: constant, when: offered('OPEN_FROM_DROP_AREA')},
    OPEN_OVERWATCH: {generate: constant, when: offered('OPEN_OVERWATCH')},
    CHOOSE_TANK: {generate: constant, when: offered('CHOOSE_TANK')},
    CHOOSE_SUPPORT: {generate: constant, when: offered('CHOOSE_SUPPORT')},
    PRESS_ESCAPE: {generate: constant, when: always},
    UNDO: {generate: constant, when: offered('UNDO')},
    TOAST_TIMES_OUT: {generate: constant, when: offered('TOAST_TIMES_OUT')},
  },
});
