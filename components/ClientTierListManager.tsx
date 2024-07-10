'use client';

import dynamic from 'next/dynamic';
import {ItemSet} from "@/models/ItemSet";

const DynamicTierListManager = dynamic(() => import('./TierListManager'), {
  ssr: false,
});

interface ClientTierListManagerProps {
  initialItemSet: ItemSet;
}

export default function ClientTierListManager({initialItemSet}: ClientTierListManagerProps) {
  // Convert ItemSet to initial tiers
  const initialTiers = [
    {
      id: 'default',
      name: 'Default Tier',
      items: initialItemSet.images.map((image, index) => ({
        id: `${initialItemSet.packageName}-${initialItemSet.tagName}-item-${index}`,
        content: image.split('.')[0],
        imageUrl: `/images/${initialItemSet.packageName}/${image}`,
        tags: [initialItemSet.tagName]
      })),
      labelPosition: 'left' as const
    }
  ];

  return <DynamicTierListManager initialTiers={initialTiers}/>;
}
