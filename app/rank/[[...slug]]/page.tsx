import imagesetConfig from "@/imageset.config.json";
import {ItemSet} from "@/models/ItemSet";
import ImageSetConfig from "@/models/ImageSet";
import dynamic from "next/dynamic";
import {Metadata, ResolvingMetadata} from "next";
import {createSEOFriendlyTagSlug, slugify} from "@/lib/utils";
import {redirect} from "next/navigation";
import TierCortex from "@/lib/TierCortex";

const typedImageSetConfig = imagesetConfig as ImageSetConfig;
const TierListManager = dynamic(
  () => import('@/components/TierListManager'),
  {ssr: false}
);

export async function generateStaticParams() {
  const params: { slug: string[] }[] = [];
  Object.entries(typedImageSetConfig.packages).forEach(([packageName, packageData]) => {
    const displayNameSlug = slugify(packageData.displayName);
    // Generate params for both packageName and displayName
    [packageName, displayNameSlug].forEach(nameOrPackage => {
      params.push({slug: [nameOrPackage, 'all']});
      Object.keys(packageData.tags).forEach((tagName) => {
        const seoFriendlyTag = createSEOFriendlyTagSlug(tagName);
        params.push({slug: [nameOrPackage, seoFriendlyTag]});
      });
    });
  });
  return params;
}

async function getItemSetData(nameOrPackage: string, tagSlug: string): Promise<ItemSet | null> {
  let packageName: string | undefined;
  let packageData: ImageSetConfig["packages"]["data"] | undefined;

  // Check if nameOrPackage is a packageName
  if (typedImageSetConfig.packages[nameOrPackage]) {
    packageName = nameOrPackage;
    packageData = typedImageSetConfig.packages[nameOrPackage];
  } else {
    // If not, search for a matching display name
    const entry = Object.entries(typedImageSetConfig.packages).find(([_, data]) =>
      slugify(data.displayName) === nameOrPackage
    );
    if (entry) {
      [packageName, packageData] = entry;
    }
  }

  if (!packageName || !packageData) return null;

  // Find the original tag that matches either the exact slug or the normalized version
  const originalTag = tagSlug === 'all'
    ? 'all'
    : Object.keys(packageData.tags).find(tag =>
      tag === tagSlug || createSEOFriendlyTagSlug(tag) === tagSlug
    );

  if (!originalTag) return null;

  const images = originalTag === 'all'
    ? packageData.images.map((img) => img.filename)
    : packageData.images.filter(image => image.tags.includes(originalTag)).map(img => img.filename);

  return {
    packageName,
    packageDisplayName: packageData.displayName,
    tagName: originalTag,
    tagTitle: originalTag === 'all' ? 'All Items' : packageData.tags[originalTag].title,
    images
  };
}


type Props = {
  params: { slug?: string[] }
  searchParams: { [key: string]: string | string[] | undefined }
}

export async function generateMetadata(
  {params, searchParams}: Props,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const [nameOrPackage, tagName] = params.slug || [];
  const itemSet = nameOrPackage && tagName ? await getItemSetData(nameOrPackage, tagName) : null;

  let title = itemSet ? `${itemSet.packageDisplayName} - ${itemSet.tagTitle}` : 'Custom Tier List';
  const initialState = typeof searchParams.state === 'string' ? searchParams.state : undefined;

  // Decode the state and extract the title if available
  if (initialState) {
    const tierCortex = new TierCortex();
    const decodedState = tierCortex.decodeTierStateFromURL(initialState);
    if (decodedState && decodedState.title) {
      title = decodedState.title;
    }
  }

  // Generate the OG image URL
  let ogImageUrl = '/api/og';
  if (initialState) {
    ogImageUrl += `?state=${encodeURIComponent(initialState)}`;
  }

  let baseUrl = 'https://opentierboy.com';

  // If VERCEL_PROJECT_PRODUCTION_URL is defined and valid, prepend it to the ogImageUrl
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    try {
      baseUrl = new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`).toString().replace(/\/$/, '');
      ogImageUrl = `${baseUrl}${ogImageUrl}`;
    } catch (error) {
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

  const canonicalPath = params.slug ? `/${params.slug.join('/')}` : '';
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
  }
}

export default async function TierListPage({
  params,
  searchParams
}: {
  params: { slug?: string[] },
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const [nameOrPackage, tagSlug] = params.slug || [];

  // If no slug is provided, render an empty tier list
  if (!nameOrPackage) {
    return (
      <div className="flex flex-col items-center justify-center">
        <TierListManager
          initialItemSet={undefined}
          initialState={undefined}
          title="Custom Tier List"
        />
      </div>
    );
  }

  // Only normalize and redirect if both nameOrPackage and tagSlug are present
  if (nameOrPackage && tagSlug) {
    const normalizedTagSlug = createSEOFriendlyTagSlug(tagSlug);
    if (normalizedTagSlug !== tagSlug) {
      const searchParamsString = new URLSearchParams(searchParams as Record<string, string>).toString();
      const redirectUrl = `/rank/${nameOrPackage}/${normalizedTagSlug}${searchParamsString ? `?${searchParamsString}` : ''}`;
      redirect(redirectUrl);
    }
  }

  const itemSet = await getItemSetData(nameOrPackage, tagSlug);

  const title = itemSet
    ? `${itemSet.packageDisplayName} - ${itemSet.tagTitle}`
    : 'Custom Tier List';
  const initialState = typeof searchParams.state === 'string' ? searchParams.state : undefined;

  return (
    <div className="flex flex-col items-center justify-center">
      <TierListManager
        initialItemSet={itemSet ?? undefined}
        initialState={initialState}
        title={title}
      />
    </div>
  );
}
