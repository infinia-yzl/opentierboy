import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {freezeFrameLoadMachine} from '../machines/freeze-frame-load';
import {defineModel, offered} from '../support/machines';

export type FreezeFrameLoadSnapshot = SnapshotFrom<typeof freezeFrameLoadMachine>;
export type FreezeFrameLoadEvent = EventFrom<typeof freezeFrameLoadMachine>;

export type FreezeFrameBrowser = 'same' | 'new';

export interface FreezeFrameLoadView {
  readonly browser: FreezeFrameBrowser;
  readonly list: 'mixedBag' | 'changed' | 'blank' | null;
  readonly link: 'fileOwn' | 'newPictureId' | 'other';
  readonly dialog: 'editor' | 'home' | null;
  readonly captured: boolean;
  readonly otherSite: 'loads' | 'waits' | null;
}

const view = (partial: Partial<FreezeFrameLoadView> & Pick<FreezeFrameLoadView, 'browser'>): FreezeFrameLoadView => ({
  list: null, link: 'other', dialog: null, captured: false, otherSite: null, ...partial,
});

const FREEZE_FRAME_LOAD_VIEWS: Readonly<Record<string, FreezeFrameLoadView>> = {
  'sameBrowser.editor.listMade': view({browser: 'same', list: 'mixedBag', otherSite: 'loads'}),
  'sameBrowser.editor.captured': view({browser: 'same', captured: true}),
  'sameBrowser.editor.fileSaved': view({browser: 'same', list: 'mixedBag', link: 'fileOwn', otherSite: 'loads'}),
  'sameBrowser.editor.askingOverSameList': view({browser: 'same', link: 'fileOwn', dialog: 'editor'}),
  'sameBrowser.editor.listChanged': view({browser: 'same', list: 'changed', otherSite: 'loads'}),
  'sameBrowser.editor.askingOverChangedList': view({browser: 'same', dialog: 'editor'}),
  'sameBrowser.editor.fileList': view({browser: 'same', list: 'mixedBag', link: 'fileOwn', otherSite: 'loads'}),
  'sameBrowser.home.landing': view({browser: 'same'}),
  'sameBrowser.home.asking': view({browser: 'same', dialog: 'home'}),
  'sameBrowser.home.fileList': view({browser: 'same', list: 'mixedBag', link: 'fileOwn', otherSite: 'waits'}),
  'newBrowser.blankList': view({browser: 'new', list: 'blank'}),
  'newBrowser.asking': view({browser: 'new', dialog: 'editor'}),
  'newBrowser.fileList.otherSiteWaits': view({browser: 'new', list: 'mixedBag', link: 'newPictureId', otherSite: 'waits'}),
  'newBrowser.fileList.otherSiteLoads': view({browser: 'new', list: 'mixedBag', link: 'newPictureId', otherSite: 'loads'}),
};

export function statePath(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${statePath(child)}`;
}

export function freezeFrameLoadViewOf(snapshot: FreezeFrameLoadSnapshot): FreezeFrameLoadView {
  const found = FREEZE_FRAME_LOAD_VIEWS[statePath(snapshot.value)];
  if (!found) throw new RangeError(`No view for the freeze frame load state ${statePath(snapshot.value)}`);
  return found;
}

const constant = fc.constant({});

export const freezeFrameLoadModel = defineModel({
  id: 'freeze-frame-load',
  machine: freezeFrameLoadMachine,
  events: {
    CAPTURE_PREVIEW: {generate: constant, when: offered('CAPTURE_PREVIEW')},
    DOWNLOAD: {generate: constant, when: offered('DOWNLOAD')},
    OPEN_FILE_IN_EDITOR: {generate: constant, when: offered('OPEN_FILE_IN_EDITOR')},
    OPEN_FILE_ON_HOME: {generate: constant, when: offered('OPEN_FILE_ON_HOME')},
    CHANGE_TITLE: {generate: constant, when: offered('CHANGE_TITLE')},
    GO_HOME: {generate: constant, when: offered('GO_HOME')},
    OPEN_NEW_BROWSER: {generate: constant, when: offered('OPEN_NEW_BROWSER')},
    CANCEL: {generate: constant, when: offered('CANCEL')},
    OPEN_LIST: {generate: constant, when: offered('OPEN_LIST')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
    RELOAD: {generate: constant, when: offered('RELOAD')},
    LOAD_IMAGES: {generate: constant, when: offered('LOAD_IMAGES')},
  },
});
