import {MetadataRoute} from 'next'
import {visibleImageSets} from "@/lib/imageSets";
import {slugify} from "@/lib/utils";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://opentierboy.com'

  // Define your static routes
  const staticRoutes = [
    '',
    '/rank',
    '/about',
    '/blog',
    '/blog/overwatch-2-karq-tier-list-season-11',
    '/blog/the-finals-season-3-world-tour-loadout-rankings',
    '/privacy',
    '/terms',
  ].map(route => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    priority: 1,
  }))

  // Generate dynamic routes for the image sets (legacy sets are left out, lib/imageSets.ts)
  const dynamicRoutes = visibleImageSets().flatMap(([packageName, packageData]) => {
    const displayNameSlug = slugify(packageData.displayName);

    // Generate routes for both packageName and displayName
    return [packageName, displayNameSlug].flatMap(nameOrPackage => {
      const baseRoutes = [
        {
          url: `${baseUrl}/rank/${nameOrPackage}/all`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        },
        ...Object.keys(packageData.tags).map(tagName => ({
          url: `${baseUrl}/rank/${nameOrPackage}/${tagName}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.7,
        }))
      ];

      // If this is the displayNameSlug, add an additional route without the 'rank' prefix
      if (nameOrPackage === displayNameSlug) {
        baseRoutes.push({
          url: `${baseUrl}/${nameOrPackage}`,
          lastModified: new Date(),
          changeFrequency: 'weekly' as const,
          priority: 0.9,
        });
      }

      return baseRoutes;
    });
  });

  // Combine all routes
  return [...staticRoutes, ...dynamicRoutes]
}
