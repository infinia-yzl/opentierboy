import type {Metadata} from "next";
import imagesetConfig from "@/imageset.config.json";
import type ImageSetConfig from "@/models/ImageSet";
import {rankItemSet, rankItemSetTitle, rankPageTitle} from "@/lib/rankRoute";
import {createTierCortex} from "@/lib/TierCortex";

const typedImageSetConfig = imagesetConfig as ImageSetConfig;

/**
 * The metadata of an editor page: the template pages and /rank (built once, without a list), and
 * the addresses with a list in their link (rendered on request, with the list's title and its
 * link preview). `slug` is the path after /rank; `state` the link's `state` parameter, if any.
 */
export function rankMetadata(slug: string[] | undefined, state: string | undefined): Metadata {
  const [nameOrPackage, tagName] = slug || [];
  const itemSet = nameOrPackage && tagName ? rankItemSet(typedImageSetConfig, [nameOrPackage, tagName]) : null;

  // The title of the list in the link, if any. The title repeats in <title>, og:title,
  // twitter:title and the JSON-LD, so a long one is shortened (A43, rankPageTitle). The editor
  // sets the same tab title in the browser after each change (contexts/TierContext.tsx).
  const listTitle = state ? createTierCortex().decodeTierStateFromURL(state)?.title : undefined;
  const title = rankPageTitle(rankItemSetTitle(itemSet), listTitle);

  // Generate the OG image URL
  let ogImageUrl = '/api/og';
  if (state) {
    ogImageUrl += `?state=${encodeURIComponent(state)}`;
  }

  let baseUrl = 'https://opentierboy.com';

  // If VERCEL_PROJECT_PRODUCTION_URL is defined and valid, prepend it to the ogImageUrl
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    try {
      baseUrl = new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`).toString().replace(/\/$/, '');
      ogImageUrl = `${baseUrl}${ogImageUrl}`;
    } catch {
      console.warn('Invalid VERCEL_PROJECT_PRODUCTION_URL, using relative path for OG image');
    }
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description: `Create and share tier lists for ${itemSet?.packageDisplayName || 'various topics'}`,
    image: ogImageUrl,
  };

  const canonicalPath = slug ? `/${slug.join('/')}` : '';
  const canonicalUrl = `${baseUrl}${canonicalPath}`;

  return {
    title,
    openGraph: {
      title,
      images: [ogImageUrl],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      images: [ogImageUrl],
    },
    other: {
      'application-name': 'OpenTierBoy',
    },
    alternates: {
      canonical: canonicalUrl,
      types: {
        'application/ld+json': JSON.stringify(structuredData),
      },
    },
  };
}
