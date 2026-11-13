import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {sharedLinkMachine} from '../machines/shared-link';
import {always, defineModel, offered} from '../support/machines';
import {packageItemId} from '../support/links';
import {OTHER_SITE, TRUSTED_SITE, type LinkImage} from './link-images';

export {OTHER_SITE, TRUSTED_SITE};

/** The title of the shared list. */
export const MIXED_TITLE = 'Mixed picks';

/** Red, from a trusted site: its picture loads at once. */
export const RED: LinkImage = {label: 'Red', url: `https://${TRUSTED_SITE}/red.png`};
/** Blue, from a site the app does not know: a label tile until the visitor allows the site. */
export const BLUE: LinkImage = {label: 'Blue', url: `https://${OTHER_SITE}/blue.png`};
/** The label the shared link gives the device image. */
export const MY_CAT = 'My cat';
/** An item id that no image set knows, with its stored label: the placeholder image. */
export const GONE_HERO = {id: 'image-overwatch-gone-hero.webp', label: 'Gone hero'} as const;
/** The image-set items, which show their pictures in every state. */
export const PACKAGE_ITEMS = ['Mauga', 'Winston'] as const;

export type SharedLinkSnapshot = SnapshotFrom<typeof sharedLinkMachine>;
export type SharedLinkEvent = EventFrom<typeof sharedLinkMachine>;

type BrowserKey = 'maker' | 'newBrowser';
type ListKey = 'asShared' | 'edited';
type SiteKey = 'waiting' | 'allowedHere';

/** One row on screen: its name and the names of its items, in order. */
export interface RowView {
  readonly name: string;
  readonly items: readonly string[];
}

/** What one state of the shared link machine shows. */
export interface SharedLinkView {
  /** The list as shared, or after Blue was dragged to B. */
  readonly list: ListKey;
  readonly rows: readonly RowView[];
  /** True in the browser that made the list: My cat shows its picture, not the placeholder. */
  readonly deviceImageKept: boolean;
  /** True while the notice lists OTHER_SITE and Blue is a label tile. */
  readonly waiting: boolean;
}

/** The rows of each list of the machine, by its state in the `list` region. */
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

/** What the page shows in a state of the shared link machine. */
export function sharedLinkViewOf(snapshot: SharedLinkSnapshot): SharedLinkView {
  const {browser, list, site} = snapshot.value as {browser: BrowserKey; list: ListKey; site: SiteKey};
  return {list, rows: LIST_ROWS[list], deviceImageKept: browser === 'maker', waiting: site === 'waiting'};
}

/**
 * The v3 link JSON of a list of the machine (docs/reference/link-format.md): a 3-row list
 * whose rows keep their template ids, so no row writes its id. `deviceId` is the id the
 * device image store gave the maker's picture. The shared link is this JSON for 'asShared',
 * and every link the app writes after it holds each custom item exactly as written here.
 */
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
  // Either browser can open the shared link anywhere in the walk. Load is a button of the
  // notice, the drag needs Blue in Unranked, and Back is sent only after the edit (Back from
  // the shared link leaves it).
  events: {
    OPEN_IN_MAKER_BROWSER: {generate: constant, when: always},
    OPEN_IN_NEW_BROWSER: {generate: constant, when: always},
    LOAD_IMAGES: {generate: constant, when: offered('LOAD_IMAGES')},
    DRAG_BLUE_TO_ROW_B: {generate: constant, when: offered('DRAG_BLUE_TO_ROW_B')},
    BROWSER_BACK: {generate: constant, when: offered('BROWSER_BACK')},
  },
});
