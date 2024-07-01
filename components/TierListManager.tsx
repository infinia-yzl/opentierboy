'use client';

import React, {useState, useCallback} from 'react';
import DragDropTierList from './DragDropTierList';
import {Tier} from "@/app/page";
import {LabelVisibilityContext} from '@/contexts/LabelVisibilityContext';
import ItemCreator from "@/components/ItemCreator";
import {ItemProps} from "@/components/Item";

interface TierListManagerProps {
  initialTiers: Tier[];
  children: React.ReactNode;
}

const TierListManager: React.FC<TierListManagerProps> = ({initialTiers, children}) => {
  const [tiers, setTiers] = useState(initialTiers);
  const [showLabels, setShowLabels] = useState(true);

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

  const toggleLabels = useCallback(() => {
    setShowLabels(prev => !prev);
  }, []);

  return (
    <LabelVisibilityContext.Provider value={{showLabels, toggleLabels}}>
      {children}
      <DragDropTierList
        initialTiers={tiers}
        onTiersUpdate={handleTiersUpdate}
      />
      <ItemCreator onItemsCreate={handleItemsCreate}/>
    </LabelVisibilityContext.Provider>
  );
};

export default TierListManager;
