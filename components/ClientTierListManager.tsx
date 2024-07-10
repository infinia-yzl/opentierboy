'use client';

import dynamic from 'next/dynamic';
import {ItemSet} from "@/models/ItemSet";
import {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";

const DynamicTierListManager = dynamic(() => import('./TierListManager'), {
  ssr: false,
});

interface ClientTierListManagerProps {
  initialItemSet: ItemSet;
  title?: string;
}

export default function ClientTierListManager({initialItemSet, title}: ClientTierListManagerProps) {
  // Convert ItemSet to initial tiers
  const initialTiers = DEFAULT_TIER_TEMPLATE;
  initialTiers[initialTiers.length - 1].items = initialItemSet.images.map((image, index) => ({
    id: `${initialItemSet.packageName}-${initialItemSet.tagName}-item-${index}`,
    content: image.split('.')[0],
    imageUrl: `/images/${initialItemSet.packageName}/${image}`,
    tags: [initialItemSet.tagName]
  }));

  return <DynamicTierListManager initialTiers={initialTiers} title={title}/>;
}
