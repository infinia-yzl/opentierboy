/**
 * Image addresses in dropped or pasted text (#107): a link dragged from another page, an image
 * dragged from another page, or a copied image address pasted into the editor.
 *
 * The text is untrusted input. Only so much of it is read (MAX_DROPPED_TEXT_LENGTH), at most
 * MAX_LINKS_PER_ADD addresses are taken from one drop or paste, and every address goes through
 * checkLinkImageUrl, the check of Add images › "From a link". The caller then follows the
 * trusted-site rules: an image from a site the visitor has not allowed is never loaded here.
 *
 * Pure code: no browser or Node APIs. The browser reads the drop's HTML (the `<img>` addresses)
 * and hands the strings in.
 */
import {checkLinkImageUrl, type LinkImageAccepted, type LinkImageRefusal} from './linkImage';

/** The most image addresses one drop or paste adds. The rest are left out, and the visitor is told. */
export const MAX_LINKS_PER_ADD = 20;

/** The most characters read from one piece of dropped or pasted text (a text, a URI list or HTML). */
export const MAX_DROPPED_TEXT_LENGTH = 100_000;

/** What a drag or a paste carries, as text. */
export interface DroppedText {
  /** The `src` of each `<img>` in the drop's HTML, in order (read by the browser). */
  imageSources?: readonly string[];
  /** The `text/uri-list` data: one address per line, `#` lines are comments. */
  uriList?: string;
  /** The `text/plain` data. */
  plain?: string;
}

/** An address that checkLinkImageUrl refused, as the visitor gave it (shortened for messages). */
export interface RefusedAddress {
  address: string;
  reason: LinkImageRefusal;
}

export interface FoundLinkImages {
  /** The accepted addresses, normalised, each once, in the order given. */
  accepted: LinkImageAccepted[];
  /** The refused addresses, in the order given. */
  refused: RefusedAddress[];
  /** How many addresses were over MAX_LINKS_PER_ADD and left out. */
  leftOut: number;
}

/** Longest address shown in a message; longer ones end with "…". */
const SHOWN_ADDRESS_LENGTH = 80;

/**
 * True for a word that is meant as a web address: it has a scheme followed by `//`
 * (`https://`, `http://`, `ftp://`), or it is a `data:` address. Other words are plain text and
 * are left alone, so pasting a sentence never gives a message.
 */
const LOOKS_LIKE_ADDRESS = /^(?:[a-z][a-z0-9+.-]*:\/\/|data:)/i;

/** The text, cut to MAX_DROPPED_TEXT_LENGTH. A word cut in two at the end is dropped. */
function capped(text: string): string {
  if (text.length <= MAX_DROPPED_TEXT_LENGTH) return text;
  const cut = text.slice(0, MAX_DROPPED_TEXT_LENGTH);
  const lastSpace = cut.search(/\s\S*$/);
  return lastSpace === -1 ? '' : cut.slice(0, lastSpace);
}

/** A word without the brackets, quotes or punctuation that often surround an address in text. */
function unwrap(word: string): string {
  let text = word.replace(/^[<("'[]+/, '');
  for (;;) {
    const last = text.slice(-1);
    if (/[>"'\],;.!?]/.test(last) && last !== '') {
      text = text.slice(0, -1);
    } else if (last === ')' && (text.match(/\(/g) ?? []).length < (text.match(/\)/g) ?? []).length) {
      // "(see https://x.org/a.png)": the last ")" closes the text, not the address.
      text = text.slice(0, -1);
    } else {
      return text;
    }
  }
}

/** The addresses in plain text: words that look like web addresses, in order. */
export function addressesInText(text: string): string[] {
  if (typeof text !== 'string') return [];
  return capped(text).split(/\s+/).map(unwrap).filter((word) => LOOKS_LIKE_ADDRESS.test(word));
}

/** The addresses of a `text/uri-list`: one per line, without comment lines and empty lines. */
export function addressesInUriList(uriList: string): string[] {
  if (typeof uriList !== 'string') return [];
  return capped(uriList).split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * The addresses a drop carries, from the best source it has: the images in its HTML (an image
 * dragged from a page, also inside a link), else its URI list (a dragged link), else its text.
 */
export function addressesFromDrop(data: DroppedText): string[] {
  const fromImages = (data.imageSources ?? [])
    .filter((source): source is string => typeof source === 'string')
    .map((source) => source.trim())
    .filter((source) => LOOKS_LIKE_ADDRESS.test(source));
  if (fromImages.length > 0) return fromImages;
  const fromUriList = addressesInUriList(data.uriList ?? '');
  if (fromUriList.length > 0) return fromUriList;
  return addressesInText(data.plain ?? '');
}

/** An address as messages show it: at most SHOWN_ADDRESS_LENGTH characters. */
export function shownAddress(address: string): string {
  const characters = Array.from(address);
  return characters.length > SHOWN_ADDRESS_LENGTH ? `${characters.slice(0, SHOWN_ADDRESS_LENGTH - 1).join('')}…` : address;
}

/**
 * Checks addresses with checkLinkImageUrl. Each address counts once (the same image twice is
 * added once). Only the first MAX_LINKS_PER_ADD different addresses are checked; the rest are
 * counted in `leftOut`.
 */
export function checkAddresses(addresses: readonly string[]): FoundLinkImages {
  const distinct = Array.from(new Set(addresses.map((address) => address.trim()).filter((address) => address !== '')));
  const taken = distinct.slice(0, MAX_LINKS_PER_ADD);
  const accepted: LinkImageAccepted[] = [];
  const refused: RefusedAddress[] = [];
  const seen = new Set<string>();
  for (const address of taken) {
    const check = checkLinkImageUrl(address);
    if (!check.ok) {
      refused.push({address: shownAddress(address), reason: check.reason});
    } else if (!seen.has(check.url)) {
      seen.add(check.url);
      accepted.push(check);
    }
  }
  return {accepted, refused, leftOut: distinct.length - taken.length};
}

/** The link images of a drop: addressesFromDrop, then checkAddresses. */
export function linkImagesFromDrop(data: DroppedText): FoundLinkImages {
  return checkAddresses(addressesFromDrop(data));
}

/** The link images of pasted text: addressesInText, then checkAddresses. */
export function linkImagesFromPaste(text: string): FoundLinkImages {
  return checkAddresses(addressesInText(text));
}

/** True when nothing in the text looked like an address: the drop or paste is not about images. */
export function foundNothing(found: FoundLinkImages): boolean {
  return found.accepted.length === 0 && found.refused.length === 0 && found.leftOut === 0;
}
