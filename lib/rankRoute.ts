import type ImageSetConfig from "@/models/ImageSet";
import type {ImageSetPackage} from "@/models/ImageSet";
import type {ItemSet} from "@/models/ItemSet";
import {createSEOFriendlyTagSlug, slugify} from "@/lib/utils";
import {MAX_TITLE_LENGTH, shorten} from "@/lib/text";

/**
 * Which image set and tag a /rank path names, and what HTTP answer the path gets. Pure
 * functions over the image-set config: the editor (components/RankEditor.tsx), its pages and the
 * proxy (proxy.ts) share them.
 *
 * Two routes draw the editor (owner task "pre-build the editor", 2026-11-14). Both sit under
 * app/rank/layout.tsx, which holds the editor itself, so the editor stays the same while the
 * visitor moves between them:
 *
 * - app/rank/[[...slug]]: the template pages and the blank /rank, without a list in the link.
 *   Built once (static), so the CDN serves them.
 * - app/rank/~list/[[...slug]]: every address with a list in its link (`?state=`). The proxy
 *   rewrites those addresses to it (SHARED_LIST_SEGMENT), and it renders on request: a shared
 *   link's title and link preview come from the list in it.
 *
 * The proxy decides the status before the page renders. The page streams (app/loading.tsx is a
 * Suspense boundary), and a streamed page always answers 200: a redirect or a "not found" from
 * the page itself reaches the browser only as a 200 page with a client-side redirect or a
 * `noindex` tag.
 */

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

/**
 * The internal path segment of the route for addresses with a list in their link
 * (app/rank/~list). The proxy rewrites /rank/<set>/<tag>?state=… to /rank/~list/<set>/<tag>?state=…;
 * the address in the browser stays as it was. No set slug can be `~list` (slugs are letters,
 * digits and hyphens).
 */
export const SHARED_LIST_SEGMENT = '~list';

/**
 * The segments after /rank of an address's path, decoded; null for a path with a malformed
 * escape (such as %E0%A4%A). The proxy and the editor read the path the browser asked for: the
 * editor's usePathname gives that path on the server too, also after the proxy's rewrite.
 */
export function rankSegments(pathname: string): string[] | null {
  try {
    return pathname.split('/').slice(2).filter(Boolean).map(decodeURIComponent);
  } catch {
    return null; // A malformed escape such as %E0%A4%A.
  }
}

/**
 * The template a /rank path names (`segments` after /rank, decoded): its set, its tag and the
 * files the template starts with. Null for /rank, a set without a tag, or an unknown set or tag.
 */
export function rankItemSet(config: ImageSetConfig, segments: readonly string[]): ItemSet | null {
  const [nameOrPackage, tagSlug] = segments;
  if (nameOrPackage === undefined || tagSlug === undefined) return null;
  const set = findRankSet(config, nameOrPackage);
  if (!set) return null;
  const {packageName, packageData} = set;

  // The tag the slug names: the exact tag or its URL form.
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

/** The title of an editor page: "<set> - <tag>" for a template, else "Custom Tier List". */
export function rankItemSetTitle(itemSet: ItemSet | null): string {
  return itemSet ? `${itemSet.packageDisplayName} - ${itemSet.tagTitle}` : 'Custom Tier List';
}

/**
 * The tab title of an editor page: the title in the list's link, or the page's own title
 * (rankItemSetTitle) when the link has none, does not decode or is not there. A long title is
 * shortened (A43); the editor itself shows the whole title. The server puts it in the page's
 * metadata (app/rank/rankMetadata.ts), and the editor sets it again after each change and each
 * Back or Forward (contexts/TierContext.tsx), which ask nothing of the server.
 */
export function rankPageTitle(pageTitle: string, listTitle: string | undefined): string {
  return shorten(listTitle || pageTitle, MAX_TITLE_LENGTH);
}
