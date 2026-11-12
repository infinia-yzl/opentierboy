import * as fc from 'fast-check';
import {createMachine, types, type EventFrom, type SnapshotFrom} from 'xstate';
import {defineModel} from '../support/machines';

/**
 * The one-time tips (lib/tips/tips.ts, components/EditorTips.tsx), by the ids that local storage
 * keeps under `otb-tips`.
 */
export const TIP_IDS = ['first-drag', 'link-save', 'shared-list', 'device-images'] as const;
export type TipId = typeof TIP_IDS[number];

/** What `otb-tips` holds: the tips seen, in the order of TIP_IDS, and whether tips are off. */
export interface StoredTips {
  readonly seen: readonly TipId[];
  readonly off: boolean;
}

/** The tips of one editor page: what is stored, the tip on screen, and the tips waiting for it. */
export interface PageTips extends StoredTips {
  readonly current: TipId | null;
  readonly waiting: readonly TipId[];
}

/** The tips seen with `tip` added, in the order of TIP_IDS (the page keeps the order they ended in). */
const withSeen = (seen: readonly TipId[], tip: TipId): TipId[] => TIP_IDS.filter(id => id === tip || seen.includes(id));

/** The tip shows. The first-drag tip is seen only when it ends; every other tip is seen as it shows. */
function show(tips: PageTips, tip: TipId, waiting: readonly TipId[]): PageTips {
  return {...tips, current: tip, waiting, seen: tip === 'first-drag' ? tips.seen : withSeen(tips.seen, tip)};
}

/**
 * The tip became useful: it shows when no tip shows, else it waits for the one on screen.
 * Nothing changes when tips are off, the tip was seen, or it already shows or waits.
 */
export function requestTip(tips: PageTips, tip: TipId): PageTips {
  if (tips.off || tips.seen.includes(tip) || tips.current === tip || tips.waiting.includes(tip)) return tips;
  return tips.current === null ? show(tips, tip, tips.waiting) : {...tips, waiting: [...tips.waiting, tip]};
}

/** The tip ended (closed, timed out, or its own end): it is seen, and the first waiting tip shows. */
export function finishTip(tips: PageTips, tip: TipId): PageTips {
  const seen = withSeen(tips.seen, tip);
  const waiting = tips.waiting.filter(other => other !== tip);
  if (tips.current !== tip) return {...tips, seen, waiting};
  const [next, ...rest] = waiting;
  return next === undefined ? {...tips, seen, waiting, current: null} : show({...tips, seen}, next, rest);
}

/** "Hide tips": tips off, none shows or waits. */
export const hideTips = (tips: PageTips): PageTips => ({...tips, off: true, current: null, waiting: []});

/** A page opens: it reads the stored tips, and no tip shows or waits yet. */
export const openPage = (stored: StoredTips): PageTips => ({seen: stored.seen, off: stored.off, current: null, waiting: []});

/** The list on screen, as far as the tips see it. */
interface ListFacts {
  /** A ranked row holds an item. */
  readonly ranked: boolean;
  /** The number of items in Unranked. */
  readonly unranked: number;
}

/** The template of every run: OVERWATCH's 13 tanks, all in Unranked. */
export const TEMPLATE_ITEMS = 13;
const TEMPLATE: ListFacts = {ranked: false, unranked: TEMPLATE_ITEMS};
/** "/rank" without a link: no rows hold items and Unranked is empty. */
const EMPTY_LIST: ListFacts = {ranked: false, unranked: 0};

interface TipsContext extends ListFacts {
  /** The tips seen, as stored. */
  readonly seen: readonly TipId[];
  /** The tips that wait for the one on screen, in the order they show. */
  readonly waiting: readonly TipId[];
}

type EditorState = 'noTip' | 'firstDragTip' | 'linkSaveToast' | 'deviceImagesToast' | 'tipsOff';
type TipsValue = 'about' | {editor: EditorState};

const STATE_OF_TIP: Partial<Record<TipId, EditorState>> = {
  'first-drag': 'firstDragTip',
  'link-save': 'linkSaveToast',
  'device-images': 'deviceImagesToast',
};
const TIP_OF_STATE: Partial<Record<EditorState, TipId>> = {
  firstDragTip: 'first-drag',
  linkSaveToast: 'link-save',
  deviceImagesToast: 'device-images',
};

const editorState = (value: unknown): EditorState | null =>
  typeof value === 'object' && value !== null ? (value as {editor: EditorState}).editor : null;

/** The tips of the editor page in `value` and `context`. */
function pageTipsOf(value: unknown, context: TipsContext): PageTips {
  const state = editorState(value);
  return {seen: context.seen, waiting: context.waiting, off: state === 'tipsOff', current: state ? TIP_OF_STATE[state] ?? null : null};
}

/** The transition to the editor with these tips and this list. */
function toEditor(tips: PageTips, list: ListFacts) {
  const state = tips.off ? 'tipsOff' : tips.current ? STATE_OF_TIP[tips.current] : 'noTip';
  return {
    target: `#tips.editor.${state}`,
    context: {seen: tips.seen, waiting: tips.waiting, ranked: list.ranked, unranked: list.unranked},
  };
}

/** The first-drag tip is useful while Unranked holds images and no row does. */
const firstDragUseful = (list: ListFacts) => list.unranked > 0 && !list.ranked;

/** The editor opens `list` with the page itself: the first-drag tip shows when it is useful. */
function openEditor(value: unknown, context: TipsContext, list: ListFacts) {
  // On About after "Show the tips again", tips are on; in the editor they stay as they are.
  const tips = openPage({seen: context.seen, off: editorState(value) === 'tipsOff'});
  return toEditor(firstDragUseful(list) ? requestTip(tips, 'first-drag') : tips, list);
}

/**
 * A change this browser makes to the list (EditorTips.tsx, the effect on the list): a ranked
 * item ends the first-drag tip (seen, whether it showed or not), the link-save tip becomes
 * useful, and so does the device-images tip when the change adds a device image. Then the
 * first-drag tip shows or waits if the list now needs a first drag.
 */
function changeList(value: unknown, context: TipsContext, change: {ranks: boolean; addsDeviceImage: boolean}) {
  const list: ListFacts = {
    ranked: context.ranked || change.ranks,
    unranked: context.unranked - (change.ranks ? 1 : 0) + (change.addsDeviceImage ? 1 : 0),
  };
  let tips = pageTipsOf(value, context);
  if (list.ranked) tips = finishTip(tips, 'first-drag');
  tips = requestTip(tips, 'link-save');
  if (change.addsDeviceImage) tips = requestTip(tips, 'device-images');
  if (firstDragUseful(list)) tips = requestTip(tips, 'first-drag');
  return toEditor(tips, list);
}

/** The tip on screen ends: closed, timed out, or its own end. */
const endTip = ({value, context}: {value: unknown; context: TipsContext}) => {
  const tips = pageTipsOf(value, context);
  return tips.current ? toEditor(finishTip(tips, tips.current), context) : undefined;
};

const hide = ({value, context}: {value: unknown; context: TipsContext}) => toEditor(hideTips(pageTipsOf(value, context)), context);

/**
 * The tips of one browser, without the shared-list tip (tests/machines/tips-shared-list.ts): the
 * first-drag tip in the Unranked tray, the link-save and device-images toasts, Hide tips, and
 * About's "Show the tips again". At most one tip shows; a tip that becomes useful while another
 * shows waits and shows when that one ends. Every run starts as a new browser on a template.
 */
export const tipsMachine = createMachine({
  id: 'tips',
  description: 'The first-drag tip and the link-save and device-images toasts of one browser: one at a time, the others wait, an ended tip is seen, Hide tips turns them off and About turns them on again.',
  schemas: {
    context: types<TipsContext>(),
    events: {
      OPEN_TEMPLATE: types<{}>(),
      OPEN_EMPTY_LIST: types<{}>(),
      DROP_IN_ROW: types<{}>(),
      CHANGE_TITLE: types<{}>(),
      ADD_DEVICE_IMAGE: types<{}>(),
      CLOSE_TIP: types<{}>(),
      CLOSE_TOAST: types<{}>(),
      TOAST_TIMES_OUT: types<{}>(),
      HIDE_TIPS: types<{}>(),
      SHOW_TIPS_AGAIN: types<{}>(),
    },
  },
  context: {seen: [], waiting: [], ...TEMPLATE},
  initial: 'editor',
  on: {
    // Full page loads, as when the visitor opens the address: the page's tips start again.
    OPEN_TEMPLATE: ({value, context}) => openEditor(value, context, TEMPLATE),
    OPEN_EMPTY_LIST: ({value, context}) => openEditor(value, context, EMPTY_LIST),
  },
  states: {
    editor: {
      initial: 'firstDragTip',
      on: {
        // The first item in Unranked, dropped at the end of row S.
        DROP_IN_ROW: ({value, context}) => context.unranked > 0 ? changeList(value, context, {ranks: true, addsDeviceImage: false}) : undefined,
        CHANGE_TITLE: ({value, context}) => changeList(value, context, {ranks: false, addsDeviceImage: false}),
        // One picture from the device, added to Unranked.
        ADD_DEVICE_IMAGE: ({value, context}) => changeList(value, context, {ranks: false, addsDeviceImage: true}),
        // About forgets the tips seen and turns them on (components/ShowTipsAgain.tsx).
        SHOW_TIPS_AGAIN: () => ({target: '#tips.about', context: {seen: [], waiting: []}}),
      },
      states: {
        noTip: {},
        firstDragTip: {on: {CLOSE_TIP: endTip, HIDE_TIPS: hide}},
        linkSaveToast: {on: {CLOSE_TOAST: endTip, TOAST_TIMES_OUT: endTip, HIDE_TIPS: hide}},
        deviceImagesToast: {on: {CLOSE_TOAST: endTip, TOAST_TIMES_OUT: endTip, HIDE_TIPS: hide}},
        tipsOff: {},
      },
    },
    about: {},
  },
});

export type TipsSnapshot = SnapshotFrom<typeof tipsMachine>;
export type TipsEvent = EventFrom<typeof tipsMachine>;
type Snapshot = TipsSnapshot;

/** The editor state of a snapshot, or null on About. */
export function tipsEditorState(snapshot: Snapshot): EditorState | null {
  return editorState(snapshot.value as TipsValue);
}

const inEditor = ({snapshot}: {snapshot: Snapshot}) => tipsEditorState(snapshot) !== null;
const toastShows = ({snapshot}: {snapshot: Snapshot}) => snapshot.matches({editor: 'linkSaveToast'}) || snapshot.matches({editor: 'deviceImagesToast'});
/**
 * A toast ends by itself 10 s after it shows (EditorTips.tsx, TIP_TOAST_MS), in real time too: the
 * page clock runs. So while a toast shows, the campaign sends only what ends it or leaves the
 * page, and the 10 s never pass inside a run.
 */
const editsWithoutToast = (args: {snapshot: Snapshot}) => inEditor(args) && !toastShows(args);
const tipShows = ({snapshot}: {snapshot: Snapshot}) => {
  const state = tipsEditorState(snapshot);
  return state !== null && state !== 'noTip' && state !== 'tipsOff';
};
const constant = fc.constant({});

export const tipsModel = defineModel({
  id: 'tips',
  machine: tipsMachine,
  events: {
    OPEN_TEMPLATE: {generate: constant, weight: 0.5},
    OPEN_EMPTY_LIST: {generate: constant, weight: 0.5},
    DROP_IN_ROW: {generate: constant, when: (args: {snapshot: Snapshot}) => editsWithoutToast(args) && args.snapshot.context.unranked > 0},
    CHANGE_TITLE: {generate: constant, when: editsWithoutToast},
    ADD_DEVICE_IMAGE: {generate: constant, when: editsWithoutToast, weight: 2},
    CLOSE_TIP: {generate: constant, when: ({snapshot}: {snapshot: Snapshot}) => snapshot.matches({editor: 'firstDragTip'})},
    CLOSE_TOAST: {generate: constant, when: toastShows, weight: 3},
    TOAST_TIMES_OUT: {generate: constant, when: toastShows, weight: 3},
    HIDE_TIPS: {generate: constant, when: tipShows, weight: 2},
    SHOW_TIPS_AGAIN: {generate: constant, when: inEditor, weight: 0.5},
  },
  // Each device image adds an item to Unranked, so the graph never ends: the reachable-state
  // check stops exploring once Unranked holds more than the template's 13 items. (propertyTest
  // ignores stopWhen; maxCommands bounds the walk.)
  stopWhen: (snapshot: Snapshot) => snapshot.context.unranked > TEMPLATE_ITEMS,
  // Few seeds take every transition: the device-images toast is three steps deep and needs a
  // fourth to end it. Of seeds 1 to 60 at 20 runs of up to 10 commands, only seed 21 does
  // (52 events); a change to the machine or the weights needs a new seed.
  walk: {property: {seed: 21, numRuns: 20, maxCommands: 10}},
});
