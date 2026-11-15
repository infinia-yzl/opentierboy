import type {Metadata} from "next";
import imagesetConfig from "@/imageset.config.json";
import type ImageSetConfig from "@/models/ImageSet";
import {rankItemSet, rankItemSetTitle, rankPageTitle} from "@/lib/rankRoute";
import {createTierCortex} from "@/lib/TierCortex";

const typedImageSetConfig = imagesetConfig as ImageSetConfig;

export function rankMetadata(slug: string[] | undefined, state: string | undefined): Metadata {
  const [nameOrPackage, tagName] = slug || [];
  const itemSet = nameOrPackage && tagName ? rankItemSet(typedImageSetConfig, [nameOrPackage, tagName]) : null;

  const listTitle = state ? createTierCortex().decodeTierStateFromURL(state)?.title : undefined;
  const title = rankPageTitle(rankItemSetTitle(itemSet), listTitle);

  let ogImageUrl = '/api/og';
  if (state) {
    ogImageUrl += `?state=${encodeURIComponent(state)}`;
  }

  let baseUrl = 'https://opentierboy.com';

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
