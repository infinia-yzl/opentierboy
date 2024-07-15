import imagesetConfig from "@/imageset.config.json";
import {ItemSet} from "@/models/ItemSet";
import ImageSetConfig from "@/models/ImageSet";
import {slugify} from "@/lib/utils";
import dynamic from "next/dynamic";

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

export default async function TierListPage({params, searchParams}: {
  params: { slug?: string[] },
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const [nameOrPackage, tagName] = params.slug || [];
  const itemSet = nameOrPackage && tagName ? await getItemSetData(nameOrPackage, tagName) : null;

  const title = itemSet ? `${itemSet.packageDisplayName} - ${itemSet.tagTitle}` : 'Custom Tier List';

  const initialState = typeof searchParams.state === 'string' ? searchParams.state : undefined;

  return (
    <main className="flex flex-col items-center justify-between">
      <TierListManager
        initialItemSet={itemSet ?? undefined}
        initialState={initialState}
        title={title}
      />
    </main>
  );
}
