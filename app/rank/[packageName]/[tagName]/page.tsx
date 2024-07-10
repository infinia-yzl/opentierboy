import {Suspense} from 'react';
import ClientTierListManager from '@/components/ClientTierListManager';
import imagesetConfig from "@/imageset.config.json";
import {ItemSet} from "@/models/ItemSet";
import ImageSetConfig from "@/models/ImageSet";

const typedImagesetConfig = imagesetConfig as ImageSetConfig;

export async function generateStaticParams() {
  const params: { packageName: string; tagName: string; }[] = [];
  Object.entries(typedImagesetConfig.packages).forEach(([packageName, packageData]) => {
    params.push({packageName, tagName: 'all'});
    Object.keys(packageData.tags).forEach((tagName) => {
      params.push({packageName, tagName});
    });
  });
  return params;
}

async function getItemSetData(packageName: string, tagName: string): Promise<ItemSet> {
  const packageData = typedImagesetConfig.packages[packageName];
  const images = tagName === 'all'
    ? packageData.images.map(img => img.filename)
    : packageData.images.filter(image => image.tags.includes(tagName)).map(img => img.filename);

  return {
    packageName,
    packageDisplayName: packageData.displayName,
    tagName,
    tagTitle: tagName === 'all' ? 'All Items' : packageData.tags[tagName].title,
    images
  };
}

export default async function TierListPage({params}: { params: { packageName: string; tagName: string } }) {
  const itemSet = await getItemSetData(params.packageName, params.tagName);

  return (
    <div>
      <h1>{itemSet.packageDisplayName} - {itemSet.tagTitle}</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <ClientTierListManager initialItemSet={itemSet}/>
      </Suspense>
    </div>
  );
}
