'use client';

import React, {useCallback, useRef, useState} from 'react';
import DragDropTierList from './DragDropTierList';
import {TierContext} from '@/contexts/TierContext';
import TierTemplateSelector from "@/components/TierTemplateSelector";
import EditableLabel from "@/components/EditableLabel";
import ItemManager from "@/components/ItemManager";
import Tier, {LabelPosition} from "@/models/Tier";
import Item from "@/models/Item";

interface TierListManagerProps {
  initialTiers: Tier[];
}

const TierListManager: React.FC<TierListManagerProps> = ({initialTiers}) => {
  const [name, setName] = useState('');
  const [tiers, setTiers] = useState(initialTiers);
  const [showLabels, setShowLabels] = useState(true);
  const [labelPosition, setLabelPosition] = useState<LabelPosition>(initialTiers[0].labelPosition ?? 'left');
  const previousTiersRef = useRef<Tier[]>(initialTiers);

  const handleTiersUpdate = useCallback((updatedTiers: Tier[]) => {
    previousTiersRef.current = tiers;
    setTiers(updatedTiers);
  }, [tiers]);

  const handleItemsCreate = useCallback((newItems: Item[]) => {
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
        items: [] as Item[],
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
            name: '',
            items: [item],
            labelPosition: labelPosition
          };
          updatedTiers.push(uncategorizedTier);
        }
      });

      return updatedTiers;
    });
  }, [labelPosition]);

  const resetItems = useCallback(() => {
    previousTiersRef.current = tiers;
    setTiers(prevTiers => {
      const allItems = prevTiers.flatMap(tier => tier.items).sort((a, b) => a.content.localeCompare(b.content));
      const resetTiers = prevTiers.map(tier => ({...tier, items: [] as Item[]}));
      let uncategorizedTier = resetTiers[resetTiers.length - 1];
      if (!uncategorizedTier) {
        uncategorizedTier = {
          id: 'uncategorized',
          name: '',
          items: [],
          labelPosition: labelPosition
        };
        resetTiers.push(uncategorizedTier);
      }
      uncategorizedTier.items = allItems;
      return resetTiers;
    });
  }, [labelPosition, tiers]);

  const deleteAllItems = useCallback(() => {
    previousTiersRef.current = tiers;
    setTiers(prevTiers => prevTiers.map(tier => ({...tier, items: []})));
  }, [tiers]);

  const undoReset = useCallback(() => {
    setTiers(previousTiersRef.current);
  }, []);

  const undoDelete = useCallback(() => {
    setTiers(previousTiersRef.current);
  }, []);

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
      <div className="flex flex-col items-center hide-in-zen">
        <div className="flex space-x-2" id="settings">
          <TierTemplateSelector/>
          <ItemManager
            onItemsCreate={handleItemsCreate}
            onUndoItemsCreate={handleUndoItemsCreate}
            resetItems={resetItems}
            deleteAllItems={deleteAllItems}
            undoReset={undoReset}
            undoDelete={undoDelete}
          />
        </div>
        <div className="p-2">
          <p className="tooltip-mouse text-sm text-muted-foreground">
            Right-click on any item to delete.
          </p>
          <p className="tooltip-touch text-sm text-muted-foreground">
            Long-press on any item to delete.
          </p>
        </div>
      </div>
      <DragDropTierList
        initialTiers={tiers}
        onTiersUpdate={handleTiersUpdate}
      />
    </TierContext.Provider>
  );
};

export default TierListManager;
