'use client';

import React, {useState, useCallback} from 'react';
import DragDropTierList from './DragDropTierList';
import {Tier} from "@/app/page";
import {TierContext} from '@/contexts/TierContext';
import ItemCreator from "@/components/ItemCreator";
import {ItemProps} from "@/components/Item";
import TierTemplateSelector, {LabelPosition} from "@/components/TierTemplateSelector";

interface TierListManagerProps {
  initialTiers: Tier[];
  children: React.ReactNode;
}

const TierListManager: React.FC<TierListManagerProps> = ({initialTiers, children}) => {
  const [tiers, setTiers] = useState(initialTiers);
  const [showLabels, setShowLabels] = useState(true);
  const [labelPosition, setLabelPosition] = useState<LabelPosition>(initialTiers[0].labelPosition || 'left');

  const handleTiersUpdate = useCallback((updatedTiers: Tier[]) => {
    setTiers(updatedTiers);
  }, []);

  const handleItemsCreate = useCallback((newItems: ItemProps[]) => {
    setTiers((prevTiers) => {
      const updatedTiers = [...prevTiers];
      const lastTier = updatedTiers[updatedTiers.length - 1];

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

  const handleLabelPositionChange = useCallback((newPosition: LabelPosition) => {
    setLabelPosition(newPosition);
    setTiers(prevTiers => prevTiers.map(tier => ({...tier, labelPosition: newPosition})));
  }, []);

  const handleTemplateChange = useCallback((newTemplate: Tier[]) => {
    setTiers(prevTiers => {
      const allItems = prevTiers.flatMap(tier => tier.items);
      const updatedTiers = newTemplate.map(tier => ({...tier, items: [] as ItemProps[], labelPosition}));

      // Distribute existing items among new tiers
      allItems.forEach(item => {
        const matchingTier = updatedTiers.find(t => t.id === item.id);
        if (matchingTier) {
          matchingTier.items.push(item);
        } else {
          updatedTiers[updatedTiers.length - 1].items.push(item);
        }
      });

      return updatedTiers;
    });
  }, [labelPosition]);

  const contextValue = {
    tiers,
    labelPosition,
    showLabels,
    setLabelPosition: handleLabelPositionChange,
    toggleLabels,
    onTemplateChange: handleTemplateChange
  };

  return (
    <TierContext.Provider value={contextValue}>
      <div className="flex flex-auto space-x-2">
        <TierTemplateSelector/>
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
    </TierContext.Provider>
  );
};

export default TierListManager;
