'use client';

import React, {useState, useCallback} from 'react';
import DragDropTierList from './DragDropTierList';
import {Tier} from "@/app/page";
import {LabelVisibilityContext} from '@/contexts/LabelVisibilityContext';
import ItemCreator from "@/components/ItemCreator";
import {ItemProps} from "@/components/Item";
import TierTemplateSelector from "@/components/TierTemplateSelector";

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

  const handleUndoItemsCreate = useCallback((itemIds: string[]) => {
    setTiers((prevTiers) => {
      return prevTiers.map(tier => ({
        ...tier,
        items: tier.items.filter(item => !itemIds.includes(item.id))
      }));
    });
  }, []);

  const toggleLabels = useCallback(() => {
    setShowLabels(prev => !prev);
  }, []);

  const handleTemplateChange = (newTemplate: Tier[]) => {
    setTiers(prevTiers => {
      const allItems = prevTiers.flatMap(tier => tier.items);
      const newTiers = newTemplate.map(tier => ({...tier, items: [] as ItemProps[]}));

      prevTiers.forEach(oldTier => {
        oldTier.items.forEach(item => {
          const newTierIndex = newTiers.findIndex(t => t.id === oldTier.id);
          if (newTierIndex !== -1) {
            newTiers[newTierIndex].items.push(item);
          }
        });
      });

      const categorizedItemIds = newTiers.flatMap(tier => tier.items.map(item => item.id));
      const uncategorizedItems = allItems.filter(item => !categorizedItemIds.includes(item.id));

      newTiers.push({id: 'uncategorized', name: '', items: uncategorizedItems});
      return newTiers;
    });
  };

  return (
    <LabelVisibilityContext.Provider value={{showLabels, toggleLabels}}>
      <div className="flex flex-auto space-x-2">
        <TierTemplateSelector onTemplateChange={handleTemplateChange}/>
        {children}
      </div>
      <DragDropTierList
        initialTiers={tiers}
        onTiersUpdate={handleTiersUpdate}
      />
      <ItemCreator
        onItemsCreate={handleItemsCreate}
        onUndoItemsCreate={handleUndoItemsCreate}
      />
    </LabelVisibilityContext.Provider>
  );
};

export default TierListManager;
