import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {linkImagesMachine} from '../machines/link-images';
import {always, defineModel, offered, type When} from '../support/machines';

export const TRUSTED_SITE = 'i.imgur.com';

export const OTHER_SITE = 'images.example.org';

export interface LinkImage {
  readonly label: string;
  readonly url: string;
}

const image = (site: string, label: string): LinkImage => ({label, url: `https://${site}/${label.toLowerCase()}.png`});

export const RED = image(TRUSTED_SITE, 'Red');
export const BLUE = image(OTHER_SITE, 'Blue');
export const GREEN = image(OTHER_SITE, 'Green');
export const NAVY = image(OTHER_SITE, 'Navy');

type ListKey = 'first' | 'greenAdded' | 'other';
type Answer = 'answering' | 'answered' | 'failed';
type SiteValue = 'waiting' | {allowedHere: Answer} | {alwaysAllowed: Answer};

export type LinkImagesSnapshot = SnapshotFrom<typeof linkImagesMachine>;
export type LinkImagesEvent = EventFrom<typeof linkImagesMachine>;

export interface LinkImagesView {
  readonly heldImages: readonly LinkImage[];
  readonly addedImages: readonly LinkImage[];
  readonly trustedImages: readonly LinkImage[];
  readonly waiting: boolean;
  readonly answer: Answer | null;
}

const LIST_IMAGES: Readonly<Record<ListKey, Pick<LinkImagesView, 'heldImages' | 'addedImages' | 'trustedImages'>>> = {
  first: {heldImages: [BLUE], addedImages: [], trustedImages: [RED]},
  greenAdded: {heldImages: [BLUE], addedImages: [GREEN], trustedImages: [RED]},
  other: {heldImages: [NAVY], addedImages: [], trustedImages: []},
};

export const HELD_ADDRESSES: readonly string[] = [BLUE.url, NAVY.url];

export function linkImagesViewOf(snapshot: LinkImagesSnapshot): LinkImagesView {
  const {list, site} = snapshot.value as {list: ListKey; site: SiteValue};
  const answer = site === 'waiting' ? null : 'allowedHere' in site ? site.allowedHere : site.alwaysAllowed;
  return {...LIST_IMAGES[list], waiting: site === 'waiting', answer};
}

const constant = fc.constant({});
const answering = ({snapshot}: When) => linkImagesViewOf(snapshot as LinkImagesSnapshot).answer === 'answering';

export const linkImagesModel = defineModel({
  id: 'link-images',
  machine: linkImagesMachine,
  events: {
    LOAD_IMAGES: {generate: constant, when: offered('LOAD_IMAGES')},
    ALWAYS_ALLOW_SITES: {generate: constant, when: offered('ALWAYS_ALLOW_SITES')},
    ADD_IMAGE_FROM_LINK: {generate: constant, when: (args: When) => args.snapshot.matches({list: 'first'} as never) && !answering(args)},
    RELOAD: {generate: constant, when: always},
    OPEN_OTHER_LIST: {generate: constant, when: always},
    IMAGE_SITE_ANSWERS: {generate: constant, when: offered('IMAGE_SITE_ANSWERS')},
    IMAGE_SITE_FAILS: {generate: constant, when: offered('IMAGE_SITE_FAILS')},
  },
});
