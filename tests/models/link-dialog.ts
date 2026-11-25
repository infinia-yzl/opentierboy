import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {linkDialogMachine} from '../machines/link-dialog';
import {defineModel, offered} from '../support/machines';

export type LinkDialogSnapshot = SnapshotFrom<typeof linkDialogMachine>;
export type LinkDialogEvent = EventFrom<typeof linkDialogMachine>;

export interface DialogImage {
  readonly url: string;
  readonly name: string;
  readonly site: string;
}

export const PICTURE: DialogImage = {url: 'https://i.imgur.com/green.png', name: 'Green', site: 'i.imgur.com'};
export const WEB_PAGE: DialogImage = {url: 'https://upload.wikimedia.org/broken.png', name: 'Broken', site: 'upload.wikimedia.org'};
export const LARGE_PICTURE: DialogImage = {url: 'https://static.wikia.nocookie.net/huge.png', name: 'Huge', site: 'static.wikia.nocookie.net'};
export const REFUSED_ADDRESS = 'http://i.imgur.com/green.png';

export type LinkDialogView =
  | {readonly dialog: 'closed'; readonly added: {readonly image: DialogImage; readonly picture: boolean} | null}
  | {readonly dialog: 'empty'}
  | {readonly dialog: 'refused'}
  | {readonly dialog: 'checking'; readonly image: DialogImage}
  | {readonly dialog: 'failed'; readonly message: RegExp};

const VIEWS: Readonly<Record<string, LinkDialogView>> = {
  closed: {dialog: 'closed', added: null},
  cancelledWhileChecking: {dialog: 'closed', added: null},
  'open.empty': {dialog: 'empty'},
  'open.refused': {dialog: 'refused'},
  'open.checkingPicture': {dialog: 'checking', image: PICTURE},
  'open.checkingWebPage': {dialog: 'checking', image: WEB_PAGE},
  'open.checkingLargePicture': {dialog: 'checking', image: LARGE_PICTURE},
  'open.notAPicture': {dialog: 'failed', message: /^The image did not load\..* You can add it anyway/},
  'open.tooLarge': {dialog: 'failed', message: /^The image is too large: .* You can add it anyway/},
  'added.picture': {dialog: 'closed', added: {image: PICTURE, picture: true}},
  'added.webPageTile': {dialog: 'closed', added: {image: WEB_PAGE, picture: false}},
  'added.largePictureTile': {dialog: 'closed', added: {image: LARGE_PICTURE, picture: false}},
};

function pathOf(value: unknown): string {
  if (typeof value === 'string') return value;
  const [key, child] = Object.entries(value as Record<string, unknown>)[0];
  return `${key}.${pathOf(child)}`;
}

export function linkDialogViewOf(snapshot: LinkDialogSnapshot): LinkDialogView {
  const view = VIEWS[pathOf(snapshot.value)];
  if (!view) throw new RangeError(`No view for the link dialog state ${pathOf(snapshot.value)}`);
  return view;
}

const constant = fc.constant({});

export const linkDialogModel = defineModel({
  id: 'link-dialog',
  machine: linkDialogMachine,
  events: {
    OPEN_DIALOG: {generate: constant, when: offered('OPEN_DIALOG')},
    CANCEL: {generate: constant, when: offered('CANCEL')},
    ENTER_REFUSED_ADDRESS: {generate: constant, when: offered('ENTER_REFUSED_ADDRESS')},
    ENTER_PICTURE_ADDRESS: {generate: constant, when: offered('ENTER_PICTURE_ADDRESS')},
    ENTER_WEB_PAGE_ADDRESS: {generate: constant, when: offered('ENTER_WEB_PAGE_ADDRESS')},
    ENTER_LARGE_PICTURE_ADDRESS: {generate: constant, when: offered('ENTER_LARGE_PICTURE_ADDRESS')},
    IMAGE_SITE_ANSWERS: {generate: constant, when: offered('IMAGE_SITE_ANSWERS')},
    ADD_ANYWAY: {generate: constant, when: offered('ADD_ANYWAY')},
  },
});
