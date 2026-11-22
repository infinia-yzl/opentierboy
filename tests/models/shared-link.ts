import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {sharedLinkMachine} from '../machines/shared-link';
import {always, defineModel, offered} from '../support/machines';
import {packageItemId} from '../support/links';
import {OTHER_SITE, TRUSTED_SITE, type LinkImage} from './link-images';

export {OTHER_SITE, TRUSTED_SITE};

export const MIXED_TITLE = 'Mixed picks';

export const RED: LinkImage = {label: 'Red', url: `https://${TRUSTED_SITE}/red.png`};
export const BLUE: LinkImage = {label: 'Blue', url: `https://${OTHER_SITE}/blue.png`};
export const MY_CAT = 'My cat';
export const GONE_HERO = {id: 'image-overwatch-gone-hero.webp', label: 'Gone hero'} as const;
export const PACKAGE_ITEMS = ['Mauga', 'Winston'] as const;

export type SharedLinkSnapshot = SnapshotFrom<typeof sharedLinkMachine>;
export type SharedLinkEvent = EventFrom<typeof sharedLinkMachine>;

type BrowserKey = 'maker' | 'newBrowser';
type ListKey = 'asShared' | 'edited';
type SiteKey = 'waiting' | 'allowedHere';

export interface RowView {
  readonly name: string;
  readonly items: readonly string[];
}

export interface SharedLinkView {
  readonly list: ListKey;
  readonly rows: readonly RowView[];
  readonly deviceImageKept: boolean;
  readonly waiting: boolean;
}

const LIST_ROWS: Readonly<Record<ListKey, readonly RowView[]>> = {
  asShared: [
    {name: 'S', items: ['Mauga', RED.label]},
    {name: 'A', items: [MY_CAT]},
    {name: 'B', items: [GONE_HERO.label]},
    {name: 'Unranked', items: [BLUE.label, 'Winston']},
  ],
  edited: [
    {name: 'S', items: ['Mauga', RED.label]},
    {name: 'A', items: [MY_CAT]},
    {name: 'B', items: [GONE_HERO.label, BLUE.label]},
    {name: 'Unranked', items: ['Winston']},
  ],
};

export function sharedLinkViewOf(snapshot: SharedLinkSnapshot): SharedLinkView {
  const {browser, list, site} = snapshot.value as {browser: BrowserKey; list: ListKey; site: SiteKey};
  return {list, rows: LIST_ROWS[list], deviceImageKept: browser === 'maker', waiting: site === 'waiting'};
}

export function sharedLinkJson(list: ListKey, deviceId: string) {
  const mauga = packageItemId('image-overwatch', 'Mauga');
  const winston = packageItemId('image-overwatch', 'Winston');
  const red = {u: RED.url, c: RED.label};
  const blue = {u: BLUE.url, c: BLUE.label};
  const gone = {i: GONE_HERO.id, c: GONE_HERO.label};
  const myCat = {d: deviceId, c: MY_CAT};
  return {
    t: MIXED_TITLE,
    tp: 3,
    r: list === 'asShared'
      ? [['S', [mauga, red]], ['A', [myCat]], ['B', [gone]], ['', [blue, winston]]]
      : [['S', [mauga, red]], ['A', [myCat]], ['B', [gone, blue]], ['', [winston]]],
  };
}

const constant = fc.constant({});

export const sharedLinkModel = defineModel({
  id: 'shared-link',
  machine: sharedLinkMachine,
  events: {
    OPEN_IN_MAKER_BROWSER: {generate: constant, when: always},
    OPEN_IN_NEW_BROWSER: {generate: constant, when: always},
    LOAD_IMAGES: {generate: constant, when: offered('LOAD_IMAGES')},
    DRAG_BLUE_TO_ROW_B: {generate: constant, when: offered('DRAG_BLUE_TO_ROW_B')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
  },
});
