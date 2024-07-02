'use client';

import React, {useState, useCallback} from 'react';
import DragDropTierList from './DragDropTierList';
import {Tier} from "@/app/page";
import {TierContext} from '@/contexts/TierContext';
import ItemCreator from "@/components/ItemCreator";
import {ItemProps} from "@/components/Item";
import TierTemplateSelector, {LabelPosition} from "@/components/TierTemplateSelector";
import EditableLabel from "@/components/EditableLabel";

interface TierListManagerProps {
  initialTiers: Tier[];
  children: React.ReactNode;
}

const TierListManager: React.FC<TierListManagerProps> = ({initialTiers, children}) => {
  const [name, setName] = useState('');
  const [tiers, setTiers] = useState(initialTiers);
  const [showLabels, setShowLabels] = useState(true);
  const [labelPosition, setLabelPosition] = useState<LabelPosition>(initialTiers[0].labelPosition ?? 'left');

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
      // Step 1: Create a map of all existing items with their tier IDs
      const allItemsMap = new Map(
        prevTiers.flatMap(tier =>
          tier.items.map(item => [item.id, {item, tierId: tier.id}])
        )
      );

      // Step 2: Create new tiers based on the template
      const updatedTiers: Tier[] = newTemplate.map(templateTier => ({
        ...templateTier,
        items: [] as ItemProps[],
        labelPosition
      }));

      // Step 3: Distribute existing items to new tiers
      allItemsMap.forEach(({item, tierId}) => {
        const targetTier = updatedTiers.find(tier => tier.id === tierId) ||
          updatedTiers.find(tier => tier.id === 'uncategorized');

        if (targetTier) {
          targetTier.items.push(item);
        } else {
          // If no matching tier and no uncategorized tier, create one
          const uncategorizedTier: Tier = {
            id: 'uncategorized',
            name: 'Uncategorized',
            items: [item],
            labelPosition: labelPosition
          };
          updatedTiers.push(uncategorizedTier);
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
      <div className="mb-4">
        <EditableLabel as="h2" text={name} onSave={setName} placeholder="Enter title"
                       contentClassName="scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0 text-center"/>
      </div>
      <div className="flex flex-auto space-x-2">
        <div className="flex space-x-2">
          <TierTemplateSelector/>
          {children}
        </div>
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
