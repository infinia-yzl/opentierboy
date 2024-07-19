import imagesetConfig from "@/imageset.config.json";
import {ItemSet} from "@/models/ItemSet";
import ImageSetConfig from "@/models/ImageSet";
import {slugify} from "@/lib/utils";
import dynamic from "next/dynamic";
import {Metadata, ResolvingMetadata} from "next";

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
        params.push({slug: [nameOrPackage, tagName]});
      });
    });
  });
  return params;
}

async function getItemSetData(nameOrPackage: string, tagName: string): Promise<ItemSet | null> {
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

  const images = tagName === 'all'
    ? packageData.images.map((img) => img.filename)
    : packageData.images.filter(image => image.tags.includes(tagName)).map(img => img.filename);

  return {
    packageName,
    packageDisplayName: packageData.displayName,
    tagName,
    tagTitle: tagName === 'all' ? 'All Items' : packageData.tags[tagName].title,
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

  const title = itemSet ? `${itemSet.packageDisplayName} - ${itemSet.tagTitle}` : 'Custom Tier List';
  const initialState = typeof searchParams.state === 'string' ? searchParams.state : undefined;

  // Generate the OG image URL
  let ogImageUrl = '/api/og';
  if (initialState) {
    ogImageUrl += `?state=${encodeURIComponent(initialState)}`;
  }

  // If NEXT_PUBLIC_BASE_URL is defined and valid, prepend it to the ogImageUrl
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    try {
      const baseUrl = new URL(process.env.NEXT_PUBLIC_BASE_URL).toString().replace(/\/$/, '');
      ogImageUrl = `${baseUrl}${ogImageUrl}`;
    } catch (error) {
      console.warn('Invalid NEXT_PUBLIC_BASE_URL, using relative path for OG image');
    }
  }

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
  }
}

export default async function TierListPage({params, searchParams}: {
  params: { slug?: string[] },
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const [nameOrPackage, tagName] = params.slug || [];
  const itemSet = nameOrPackage && tagName ? await getItemSetData(nameOrPackage, tagName) : null;

  const title = itemSet ? `${itemSet.packageDisplayName} - ${itemSet.tagTitle}` : 'Custom Tier List';

  const initialState = typeof searchParams.state === 'string' ? searchParams.state : undefined;

  return (
    <div className="flex flex-col items-center justify-between">
      <TierListManager
        initialItemSet={itemSet ?? undefined}
        initialState={initialState}
        title={title}
      />
    </div>
  );
}
