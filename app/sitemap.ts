import {MetadataRoute} from 'next'
import imagesetConfig from "@/imageset.config.json";
import {slugify} from "@/lib/utils";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://opentierboy.com'

  // Define your static routes
  const staticRoutes = [
    '',
    '/rank',
    // '/about',
    // '/privacy-policy',
    // '/terms-of-service',
  ].map(route => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    priority: 1,
  }))

  // Generate dynamic routes based on imagesetConfig
  const dynamicRoutes = Object.entries(imagesetConfig.packages).flatMap(([packageName, packageData]) => {
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
