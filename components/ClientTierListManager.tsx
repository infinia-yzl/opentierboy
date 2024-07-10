'use client';

import {useState, useEffect} from 'react';
import {useSearchParams} from 'next/navigation';
import {ItemSet} from "@/models/ItemSet";
import Tier, {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";
import {decodeTierStateFromURL, loadTierStateFromLocalStorage} from '@/lib/tierStateUtils';
import ImageSetConfig from "@/models/ImageSet";
import imagesetConfig from "@/imageset.config.json";
import dynamic from "next/dynamic";

const TierListManager = dynamic(() => import('./TierListManager'), {ssr: false});

const typedImageSetConfig = imagesetConfig as ImageSetConfig;

interface ClientTierListManagerProps {
  initialItemSet?: ItemSet;
  initialState?: string;
  title?: string;
}

export default function ClientTierListManager({initialItemSet, initialState, title}: ClientTierListManagerProps) {
  const searchParams = useSearchParams();

  const [tiers, setTiers] = useState<Tier[]>(() => {
    if (initialState) {
      console.log('initialState', initialState)
      const decodedState = decodeTierStateFromURL(initialState);
      console.log('decodedState', decodedState)
      if (decodedState) return decodedState;
    }

    if (initialItemSet) {
      const initialTiers = [...DEFAULT_TIER_TEMPLATE];
      const packageData = typedImageSetConfig.packages[initialItemSet.packageName];
      initialTiers[initialTiers.length - 1].items = initialItemSet.images.map((image, index) => {
        const imageData = packageData.images.find(img => img.filename === image);
        return {
          id: `${initialItemSet.packageName}-${initialItemSet.tagName}-item-${index}`,
          content: imageData?.label || image.split('.')[0],
          imageUrl: `/images/${initialItemSet.packageName}/${image}`,
          tags: imageData?.tags || [initialItemSet.tagName],
          source: 'package'
        };
      });
      return initialTiers;
    }

    return loadTierStateFromLocalStorage() || DEFAULT_TIER_TEMPLATE;
  });

  useEffect(() => {
    const state = searchParams.get('state');
    if (state) {
      const decodedState = decodeTierStateFromURL(state);
      if (decodedState) setTiers(decodedState);
    }
  }, [searchParams]);

  return <TierListManager tiers={tiers} onTiersUpdate={setTiers} title={title}/>;
}
