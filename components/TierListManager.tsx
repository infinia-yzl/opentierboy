"use client";

import React, {useState, useCallback} from 'react';
import DragDropTierList from './DragDropTierList';
import ItemCreator from './ItemCreator';
import {ItemProps} from "@/components/Item";

interface Tier {
  id: string;
  name: string;
  items: ItemProps[];
  labelPosition?: 'top' | 'left' | 'right';
}

interface TierListManagerProps {
  initialTiers: Tier[];
}

const TierListManager: React.FC<TierListManagerProps> = ({initialTiers}) => {
  const [tiers, setTiers] = useState(initialTiers);

  const handleTiersUpdate = useCallback((updatedTiers: Tier[]) => {
    setTiers(updatedTiers);
  }, []);

  const handleItemsCreate = useCallback((newItems: ItemProps[]) => {
    setTiers((prevTiers) => {
      const updatedTiers = [...prevTiers];
      const lastTier = updatedTiers[updatedTiers.length - 1];

      // Filter out any new items that already exist in any tier
      const uniqueNewItems = newItems.filter(newItem =>
        !updatedTiers.some(tier =>
          tier.items.some(item => item.id === newItem.id || item.content === newItem.content)
        )
      );

      lastTier.items = [...lastTier.items, ...uniqueNewItems];
      return updatedTiers;
    });
  }, []);

  return (
    <div>
      <DragDropTierList initialTiers={tiers} onTiersUpdate={handleTiersUpdate}/>
      <ItemCreator onItemsCreate={handleItemsCreate}/>
    </div>
  );
};

export default TierListManager;
