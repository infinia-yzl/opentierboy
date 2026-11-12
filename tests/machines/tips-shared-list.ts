import * as fc from 'fast-check';
import {createMachine, types, type EventFrom, type SnapshotFrom} from 'xstate';
import {defineModel} from '../support/machines';
import {finishTip, hideTips, openPage, requestTip, type PageTips, type TipId} from './tips';

interface SharedListContext {
  /** The tips seen, as stored. */
  readonly seen: readonly TipId[];
}

type EditorState = 'noTip' | 'sharedListTip' | 'linkSaveToast' | 'tipsOff';

const TIP_OF_STATE: Partial<Record<EditorState, TipId>> = {sharedListTip: 'shared-list', linkSaveToast: 'link-save'};

const editorState = (value: unknown): EditorState | null =>
  typeof value === 'object' && value !== null ? (value as {editor: EditorState}).editor : null;

/** The tips of the editor page in `value` and `context`. No tip ever waits on this list. */
function pageTipsOf(value: unknown, context: SharedListContext): PageTips {
  const state = editorState(value);
  return {seen: context.seen, waiting: [], off: state === 'tipsOff', current: state ? TIP_OF_STATE[state] ?? null : null};
}

function toEditor(tips: PageTips) {
  const state: EditorState = tips.off ? 'tipsOff'
    : tips.current === 'shared-list' ? 'sharedListTip'
      : tips.current === 'link-save' ? 'linkSaveToast'
        : 'noTip';
  return {target: `#tipsSharedList.editor.${state}`, context: {seen: tips.seen}};
}

/**
 * The editor opens the friend's list. Only a link opened fresh, before this browser saw the
 * link-save tip, is someone else's list (EditorTips.tsx, openedFromLinkLoad). Its rows hold items,
 * so the first-drag tip is not useful.
 */
function openList(value: unknown, context: SharedListContext, {fresh}: {fresh: boolean}) {
  // On About after "Show the tips again", tips are on; in the editor they stay as they are.
  const tips = openPage({seen: context.seen, off: editorState(value) === 'tipsOff'});
  return toEditor(fresh && !tips.seen.includes('link-save') ? requestTip(tips, 'shared-list') : tips);
}

/**
 * The shared-list tip (components/EditorTips.tsx, SharedListTip): under the title when a link
 * opens fresh in a browser that never saw it or the link-save toast. It ends with Close, Hide
 * tips or the first change, and once seen it never returns until About's "Show the tips again".
 * Opening the same list from Recently viewed is a move inside OpenTierBoy: no tip. Every run
 * starts as a new browser that opens the friend's link.
 */
export const tipsSharedListMachine = createMachine({
  id: 'tipsSharedList',
  schemas: {
    context: types<SharedListContext>(),
    events: {
      OPEN_SHARED_LINK: types<{}>(),
      OPEN_FROM_RECENTLY_VIEWED: types<{}>(),
      CHANGE_TITLE: types<{}>(),
      CLOSE_TIP: types<{}>(),
      CLOSE_TOAST: types<{}>(),
      HIDE_TIPS: types<{}>(),
      SHOW_TIPS_AGAIN: types<{}>(),
    },
  },
  context: {seen: ['shared-list']},
  initial: 'editor',
  on: {
    // The friend's link, opened as from a chat app: a full page load of its address.
    OPEN_SHARED_LINK: ({value, context}) => openList(value, context, {fresh: true}),
    // The home page, then the list's entry in Recently viewed.
    OPEN_FROM_RECENTLY_VIEWED: ({value, context}) => openList(value, context, {fresh: false}),
  },
  states: {
    editor: {
      initial: 'sharedListTip',
      on: {
        // A change this browser makes (EditorTips.tsx, the effect on the list): the rows hold
        // items, so the first-drag tip is seen without having shown; the shared-list tip ends;
        // the link-save tip becomes useful.
        CHANGE_TITLE: ({value, context}) => {
          let tips = finishTip(pageTipsOf(value, context), 'first-drag');
          if (tips.current === 'shared-list') tips = finishTip(tips, 'shared-list');
          return toEditor(requestTip(tips, 'link-save'));
        },
        SHOW_TIPS_AGAIN: () => ({target: '#tipsSharedList.about', context: {seen: []}}),
      },
      states: {
        noTip: {},
        sharedListTip: {
          on: {
            CLOSE_TIP: ({value, context}) => toEditor(finishTip(pageTipsOf(value, context), 'shared-list')),
            HIDE_TIPS: ({value, context}) => toEditor(hideTips(pageTipsOf(value, context))),
          },
        },
        linkSaveToast: {
          on: {
            CLOSE_TOAST: ({value, context}) => toEditor(finishTip(pageTipsOf(value, context), 'link-save')),
            HIDE_TIPS: ({value, context}) => toEditor(hideTips(pageTipsOf(value, context))),
          },
        },
        tipsOff: {},
      },
    },
    about: {},
  },
});

export type TipsSharedListSnapshot = SnapshotFrom<typeof tipsSharedListMachine>;
export type TipsSharedListEvent = EventFrom<typeof tipsSharedListMachine>;
type Snapshot = TipsSharedListSnapshot;

/** The editor state of a snapshot, or null on About. */
export function sharedListEditorState(snapshot: Snapshot): EditorState | null {
  return editorState(snapshot.value);
}

const inEditor = ({snapshot}: {snapshot: Snapshot}) => sharedListEditorState(snapshot) !== null;
const toastShows = ({snapshot}: {snapshot: Snapshot}) => snapshot.matches({editor: 'linkSaveToast'});
/**
 * The toast ends by itself after 10 s of real time: this campaign cannot install the page clock,
 * which hides the shared-list tip (see tips.spec.ts). So while the toast shows, only what ends
 * it or leaves the page is sent, and the 10 s never pass inside a run.
 */
const editsWithoutToast = (args: {snapshot: Snapshot}) => inEditor(args) && !toastShows(args);
const constant = fc.constant({});

export const tipsSharedListModel = defineModel({
  id: 'tips-shared-list',
  description: 'The shared-list tip: it shows for a link opened fresh until the browser saw it or the link-save toast, ends with Close, Hide tips or the first change, and About turns it on again.',
  machine: tipsSharedListMachine,
  events: {
    OPEN_SHARED_LINK: constant,
    OPEN_FROM_RECENTLY_VIEWED: constant,
    CHANGE_TITLE: {generate: constant, when: editsWithoutToast},
    CLOSE_TIP: {generate: constant, when: ({snapshot}: {snapshot: Snapshot}) => snapshot.matches({editor: 'sharedListTip'})},
    CLOSE_TOAST: {generate: constant, when: toastShows},
    HIDE_TIPS: {generate: constant, when: ({snapshot}: {snapshot: Snapshot}) => snapshot.matches({editor: 'sharedListTip'}) || toastShows({snapshot})},
    SHOW_TIPS_AGAIN: {generate: constant, when: inEditor},
  },
  // Not every seed takes every transition. Seeds 2, 5, 6, 7, 8 and 10 of 1 to 12 do at 20 runs
  // of up to 8 commands; seed 10 sends the fewest events (36).
  walk: {property: {seed: 10, numRuns: 20, maxCommands: 8}},
});
