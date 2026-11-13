import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {linkImagesMachine} from '../machines/link-images';
import {always, defineModel, offered, type When} from '../support/machines';

/** A trusted site (trusted-image-sites.json): its images load without asking. */
export const TRUSTED_SITE = 'i.imgur.com';

/** A site the app does not know: its images wait for the visitor's consent. */
export const OTHER_SITE = 'images.example.org';

/** A link image ({u, c} item): its label and its address. */
export interface LinkImage {
  readonly label: string;
  readonly url: string;
}

const image = (site: string, label: string): LinkImage => ({label, url: `https://${site}/${label.toLowerCase()}.png`});

export const RED = image(TRUSTED_SITE, 'Red');
export const BLUE = image(OTHER_SITE, 'Blue');
/** The image the visitor adds to the first list with "From a link". */
export const GREEN = image(OTHER_SITE, 'Green');
export const NAVY = image(OTHER_SITE, 'Navy');

type ListKey = 'first' | 'greenAdded' | 'other';
type SiteKey = 'waiting' | 'allowedHere' | 'alwaysAllowed';

export type LinkImagesSnapshot = SnapshotFrom<typeof linkImagesMachine>;
export type LinkImagesEvent = EventFrom<typeof linkImagesMachine>;

/** What one state of the link images machine shows. */
export interface LinkImagesView {
  /** The images from OTHER_SITE in the list on screen. */
  readonly otherSiteImages: readonly LinkImage[];
  /** The images from TRUSTED_SITE in the list on screen: they load in every state. */
  readonly trustedImages: readonly LinkImage[];
  /** True while the notice "Images from other sites" lists OTHER_SITE and its images wait. */
  readonly waiting: boolean;
}

/** The link images of each list of the machine, by its state in the `list` region. */
const LIST_IMAGES: Readonly<Record<ListKey, Pick<LinkImagesView, 'otherSiteImages' | 'trustedImages'>>> = {
  first: {otherSiteImages: [BLUE], trustedImages: [RED]},
  greenAdded: {otherSiteImages: [BLUE, GREEN], trustedImages: [RED]},
  other: {otherSiteImages: [NAVY], trustedImages: []},
};

/** What the page shows in a state of the link images machine. */
export function linkImagesViewOf(snapshot: LinkImagesSnapshot): LinkImagesView {
  const {list, site} = snapshot.value as {list: ListKey; site: SiteKey};
  return {...LIST_IMAGES[list], waiting: site === 'waiting'};
}

const constant = fc.constant({});

export const linkImagesModel = defineModel({
  id: 'link-images',
  machine: linkImagesMachine,
  // Load and Always allow these sites are buttons of the notice, sent only while it shows. A
  // reload and opening the other list are sent everywhere: the page must keep what the machine
  // keeps. Green is added once, to the first list.
  events: {
    LOAD_IMAGES: {generate: constant, when: offered('LOAD_IMAGES')},
    ALWAYS_ALLOW_SITES: {generate: constant, when: offered('ALWAYS_ALLOW_SITES')},
    ADD_IMAGE_FROM_LINK: {generate: constant, when: ({snapshot}: When) => snapshot.matches({list: 'first'} as never)},
    RELOAD: {generate: constant, when: always},
    OPEN_OTHER_LIST: {generate: constant, when: always},
  },
});
