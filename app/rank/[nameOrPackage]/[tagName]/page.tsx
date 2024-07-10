import {Suspense} from 'react';
import ClientTierListManager from '@/components/ClientTierListManager';
import imagesetConfig from "@/imageset.config.json";
import {ItemSet} from "@/models/ItemSet";
import ImageSetConfig from "@/models/ImageSet";
import {slugify} from "@/lib/utils";

const typedImageSetConfig = imagesetConfig as ImageSetConfig;

export async function generateStaticParams() {
  const params: { nameOrPackage: string; tagName: string; }[] = [];
  Object.entries(typedImageSetConfig.packages).forEach(([packageName, packageData]) => {
    const displayNameSlug = slugify(packageData.displayName);
    // Generate params for both packageName and displayName
    [packageName, displayNameSlug].forEach(nameOrPackage => {
      params.push({nameOrPackage, tagName: 'all'});
      Object.keys(packageData.tags).forEach((tagName) => {
        params.push({nameOrPackage, tagName});
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

export default async function TierListPage({params}: { params: { nameOrPackage: string; tagName: string } }) {
  console.log(params.nameOrPackage)
  const itemSet = await getItemSetData(params.nameOrPackage, params.tagName);
  if (!itemSet) {
    return <div>Tier List not found</div>;
  }
  const title = `${itemSet.packageDisplayName} - ${itemSet.tagTitle}`;

  return (
    <main className="flex flex-col items-center justify-between">
      <Suspense fallback={<div>Loading...</div>}>
        <ClientTierListManager initialItemSet={itemSet} title={title}/>
      </Suspense>
    </main>
  );
}
