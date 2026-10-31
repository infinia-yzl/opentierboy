import type {ImageSetPackage} from "@/models/ImageSet";
import {createSEOFriendlyTagSlug, slugify} from "@/lib/utils";

/**
 * The template buttons of the landing page's image-set cards (HomeFinal board): each names a
 * template, links to its editor page, shows a picture of one of its items and about how many
 * items it starts with. Everything comes from the image-set config (imageset.config.json, which
 * scripts/prepareImages.js writes from the installed image-set packages), so an image-set update
 * changes the counts and pictures on its next build. Nothing here is written by hand.
 */

/** The count a template button shows, and the words for its accessible name. */
export interface RoundedItemCount {
  /** What the button shows: "70+" for 77 items, the exact number below 10. */
  text: string;
  /** The count in words, for the accessible name: "about 70 items", "9 items", "1 item". */
  label: string;
}

/**
 * Rounds an item count for a template button: down to the nearest 10, with "+" (77 → "70+",
 * 29 → "20+", 13 → "10+"); below 10, the exact number. A set update that adds a few items
 * rarely changes what the button says, and the button never promises more items than the
 * template has.
 */
export function roundedItemCount(count: number): RoundedItemCount {
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`An item count is a whole number from 0, not ${count}`);
  if (count < 10) return {text: String(count), label: `${count} ${count === 1 ? 'item' : 'items'}`};
  const rounded = Math.floor(count / 10) * 10;
  return {text: `${rounded}+`, label: `about ${rounded} items`};
}

/** The images a template starts with: every image for "all", else the images with the tag. */
export function templateImages(packageData: Pick<ImageSetPackage, 'images'>, tag: string): ImageSetPackage['images'] {
  return tag === 'all' ? packageData.images : packageData.images.filter((image) => image.tags.includes(tag));
}

/** The title of a template: "All Items" for "all", else the tag's title (or the tag itself). */
export function templateTitle(packageData: Pick<ImageSetPackage, 'tags'>, tag: string): string {
  return tag === 'all' ? 'All Items' : packageData.tags[tag]?.title || tag;
}

export interface TemplateButton {
  tag: string;
  title: string;
  /** The template's editor page, /rank/<set slug>/<tag slug>. */
  href: string;
  /** How many items the template starts with. */
  count: number;
  /** The rounded count the button shows. */
  countText: string;
  /** The button's accessible name: "<title>, about <N> items" (or the exact count below 10). */
  ariaLabel: string;
  /** One of the template's items, as a picture: its image under public/images/ and its label. */
  preview: {src: string; alt: string} | null;
}

/**
 * The template button of one tag of an image set. The picture is the item `previewId` names
 * (`<packageName>-<filename>`) when the template still holds it, else the template's first
 * item: a set update that renames or drops that item never breaks the card. A template
 * without items has no picture.
 */
export function templateButton(
  packageName: string,
  packageData: Pick<ImageSetPackage, 'displayName' | 'images' | 'tags'>,
  tag: string,
  previewId?: string,
): TemplateButton {
  const images = templateImages(packageData, tag);
  const title = templateTitle(packageData, tag);
  const count = roundedItemCount(images.length);
  const image = images.find((candidate) => `${packageName}-${candidate.filename}` === previewId) ?? images[0];
  return {
    tag,
    title,
    href: `/rank/${slugify(packageData.displayName)}/${createSEOFriendlyTagSlug(tag)}`,
    count: images.length,
    countText: count.text,
    ariaLabel: `${title}, ${count.label}`,
    preview: image
      ? {src: `/images/${packageName}/${image.filename}`, alt: image.label || image.filename.split('.')[0]}
      : null,
  };
}
