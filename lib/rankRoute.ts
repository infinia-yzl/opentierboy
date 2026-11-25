import type ImageSetConfig from "@/models/ImageSet";
import type {ImageSetPackage} from "@/models/ImageSet";
import type {ItemSet} from "@/models/ItemSet";
import {createSEOFriendlyTagSlug, slugify} from "@/lib/utils";
import {MAX_TITLE_LENGTH, shorten} from "@/lib/text";


export interface RankSet {
  packageName: string;
  packageData: ImageSetPackage;
}

/** The image set a path segment names: its package name or the slug of its display name. */
export function findRankSet(config: ImageSetConfig, nameOrPackage: string): RankSet | null {
  // Own properties only: a segment such as `constructor` must not find Object.prototype's.
  if (Object.prototype.hasOwnProperty.call(config.packages, nameOrPackage)) {
    return {packageName: nameOrPackage, packageData: config.packages[nameOrPackage]};
  }
  const entry = Object.entries(config.packages).find(([, data]) => slugify(data.displayName) === nameOrPackage);
  return entry ? {packageName: entry[0], packageData: entry[1]} : null;
}

/** The tag a path segment names (`all`, the tag itself, or its URL form), or null. */
export function findRankTag(packageData: ImageSetPackage, tagSlug: string): string | null {
  if (tagSlug === 'all') return 'all';
  return Object.keys(packageData.tags).find(tag => tag === tagSlug || createSEOFriendlyTagSlug(tag) === tagSlug) ?? null;
}

export type RankRoute =
  /** The editor opens. `legacy`: the path names a legacy set (search engines should drop it). */
  | {kind: 'page'; legacy: boolean}
  /** The path moved for good (308): an old tag path with underscores or capitals. */
  | {kind: 'redirect'; pathname: string}
  /** No such template (404). */
  | {kind: 'notFound'};

/**
 * The answer for /rank/<set>/<tag> (`segments` are the path segments after /rank, decoded).
 *
 * - `/rank`, and any path with a list in its link (`?state=`), opens the editor: shared links
 *   keep working even when their set or tag is unknown (product rule 3).
 * - A tag in an old form (underscores, capitals) moves to its URL form, with the same query
 *   (as the page did before, with a temporary redirect that reached browsers as a 200 page).
 * - Without a list, a path whose set or tag is unknown is not found. Before, it opened an empty
 *   "Custom Tier List" with 200.
 */
export function rankRoute(config: ImageSetConfig, segments: readonly string[], hasState: boolean): RankRoute {
  const [nameOrPackage, tagSlug] = segments;
  if (nameOrPackage === undefined) return {kind: 'page', legacy: false};

  if (tagSlug !== undefined) {
    const normalized = createSEOFriendlyTagSlug(tagSlug);
    if (normalized !== tagSlug) {
      return {kind: 'redirect', pathname: `/rank/${encodeURIComponent(nameOrPackage)}/${encodeURIComponent(normalized)}`};
    }
  }

  const set = findRankSet(config, nameOrPackage);
  const legacy = set?.packageData.legacy === true;
  if (hasState) return {kind: 'page', legacy};
  if (!set || tagSlug === undefined || findRankTag(set.packageData, tagSlug) === null) return {kind: 'notFound'};
  return {kind: 'page', legacy};
}

export const SHARED_LIST_SEGMENT = '~list';

export function rankSegments(pathname: string): string[] | null {
  try {
    return pathname.split('/').slice(2).filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
}

export function rankItemSet(config: ImageSetConfig, segments: readonly string[]): ItemSet | null {
  const [nameOrPackage, tagSlug] = segments;
  if (nameOrPackage === undefined || tagSlug === undefined) return null;
  const set = findRankSet(config, nameOrPackage);
  if (!set) return null;
  const {packageName, packageData} = set;

  const originalTag = findRankTag(packageData, tagSlug);
  if (!originalTag) return null;

  const images = originalTag === 'all'
    ? packageData.images.map((img) => img.filename)
    : packageData.images.filter(image => image.tags.includes(originalTag)).map(img => img.filename);

  return {
    packageName,
    packageDisplayName: packageData.displayName,
    tagName: originalTag,
    tagTitle: originalTag === 'all' ? 'All Items' : packageData.tags[originalTag].title,
    images,
  };
}

export function rankItemSetTitle(itemSet: ItemSet | null): string {
  return itemSet ? `${itemSet.packageDisplayName} - ${itemSet.tagTitle}` : 'Custom Tier List';
}

export function rankPageTitle(pageTitle: string, listTitle: string | undefined): string {
  return shorten(listTitle || pageTitle, MAX_TITLE_LENGTH);
}
