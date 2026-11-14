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
type Answer = 'answering' | 'answered' | 'failed';
type SiteValue = 'waiting' | {allowedHere: Answer} | {alwaysAllowed: Answer};

export type LinkImagesSnapshot = SnapshotFrom<typeof linkImagesMachine>;
export type LinkImagesEvent = EventFrom<typeof linkImagesMachine>;

/** What one state of the link images machine shows. */
export interface LinkImagesView {
  /**
   * The images from OTHER_SITE that come with the list on screen: the site holds its answers
   * for them until IMAGE_SITE_ANSWERS or IMAGE_SITE_FAILS.
   */
  readonly heldImages: readonly LinkImage[];
  /** The images from OTHER_SITE the visitor added: the site answers them at once. */
  readonly addedImages: readonly LinkImage[];
  /** The images from TRUSTED_SITE in the list on screen: they load in every state. */
  readonly trustedImages: readonly LinkImage[];
  /** True while the notice "Images from other sites" lists OTHER_SITE and its images wait. */
  readonly waiting: boolean;
  /**
   * Once the site is allowed, how it answered for the held images on this page: not yet (the
   * page is busy), with the picture, or with something that is not a picture. Null while the
   * notice waits: the page asked the site nothing.
   */
  readonly answer: Answer | null;
}

/** The link images of each list of the machine, by its state in the `list` region. */
const LIST_IMAGES: Readonly<Record<ListKey, Pick<LinkImagesView, 'heldImages' | 'addedImages' | 'trustedImages'>>> = {
  first: {heldImages: [BLUE], addedImages: [], trustedImages: [RED]},
  greenAdded: {heldImages: [BLUE], addedImages: [GREEN], trustedImages: [RED]},
  other: {heldImages: [NAVY], addedImages: [], trustedImages: []},
};

/** The addresses whose answers the image site holds: the images that come with the lists. */
export const HELD_ADDRESSES: readonly string[] = [BLUE.url, NAVY.url];

/** What the page shows in a state of the link images machine. */
export function linkImagesViewOf(snapshot: LinkImagesSnapshot): LinkImagesView {
  const {list, site} = snapshot.value as {list: ListKey; site: SiteValue};
  const answer = site === 'waiting' ? null : 'allowedHere' in site ? site.allowedHere : site.alwaysAllowed;
  return {...LIST_IMAGES[list], waiting: site === 'waiting', answer};
}

/** True where the page waits for the image site's answer on purpose (modelSut's `busyIn`). */
export const awaitsImageSite = (snapshot: LinkImagesSnapshot) => linkImagesViewOf(snapshot).answer === 'answering';

const constant = fc.constant({});

export const linkImagesModel = defineModel({
  id: 'link-images',
  machine: linkImagesMachine,
  // Load and Always allow these sites are buttons of the notice, sent only while it shows. A
  // reload and opening the other list are sent everywhere: the page must keep what the machine
  // keeps. Green is added once, to the first list. The image site answers only where the page
  // waits for it.
  events: {
    LOAD_IMAGES: {generate: constant, when: offered('LOAD_IMAGES')},
    ALWAYS_ALLOW_SITES: {generate: constant, when: offered('ALWAYS_ALLOW_SITES')},
    ADD_IMAGE_FROM_LINK: {generate: constant, when: ({snapshot}: When) => snapshot.matches({list: 'first'} as never)},
    RELOAD: {generate: constant, when: always},
    OPEN_OTHER_LIST: {generate: constant, when: always},
    IMAGE_SITE_ANSWERS: {generate: constant, when: offered('IMAGE_SITE_ANSWERS')},
    IMAGE_SITE_FAILS: {generate: constant, when: offered('IMAGE_SITE_FAILS')},
  },
});
