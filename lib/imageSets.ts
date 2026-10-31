import imagesetConfig from "@/imageset.config.json";
import ImageSetConfig, {ImageSetPackage} from "@/models/ImageSet";
import type {RankPageNames} from "@/lib/rankPath";
import {createSEOFriendlyTagSlug, slugify} from "@/lib/utils";

const typedImageSetConfig = imagesetConfig as ImageSetConfig;

/**
 * The image sets that people can choose: the template picker, the landing page, the sitemap
 * and the prebuilt /rank pages list these. Legacy sets are left out. They still open by URL
 * (/rank/<set>/<tag>), and old links and link previews that use them keep working.
 */
export function visibleImageSets(): [packageName: string, packageData: ImageSetPackage][] {
  return Object.entries(typedImageSetConfig.packages).filter(([, packageData]) => !packageData.legacy);
}

/**
 * The names of every set's editor pages (legacy sets too: their pages still open), keyed by
 * the set slugs a /rank path can use (package name and display name slug) and the tag slugs.
 * Small enough to hand to a client component (rankPageTitle in lib/rankPath.ts).
 */
export function rankPageNames(): RankPageNames {
  const names: Record<string, {name: string; tags: Record<string, string>}> = {};
  for (const [packageName, packageData] of Object.entries(typedImageSetConfig.packages)) {
    const tags: Record<string, string> = {all: 'All Items'};
    for (const [tagName, tagData] of Object.entries(packageData.tags)) {
      tags[tagName] = tagData.title;
      tags[createSEOFriendlyTagSlug(tagName)] = tagData.title;
    }
    const entry = {name: packageData.displayName, tags};
    names[packageName] = entry;
    names[slugify(packageData.displayName)] = entry;
  }
  return names;
}
