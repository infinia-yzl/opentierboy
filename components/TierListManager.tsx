'use client';

import React, {useCallback, useEffect, useRef, useState} from 'react';
import DragDropTierList from './DragDropTierList';
import {TierContext} from '@/contexts/TierContext';
import TierTemplateSelector from "@/components/TierTemplateSelector";
import EditableLabel from "@/components/EditableLabel";
import ItemManager from "@/components/ItemManager";
import Tier, {LabelPosition} from "@/models/Tier";
import Item from "@/models/Item";
import ShareButton from "@/components/ShareButton";
import {encodeTierStateForURL, saveTierStateToLocalStorage} from "@/lib/tierStateUtils";
import {usePathname, useRouter, useSearchParams} from "next/navigation";

interface TierListManagerProps {
  tiers: Tier[];
  onTiersUpdate: (updatedTiers: Tier[]) => void;
  title?: string;
}

const TierListManager: React.FC<TierListManagerProps> = ({tiers, onTiersUpdate, title}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [name, setName] = useState(title ?? '');
  const [showLabels, setShowLabels] = useState(true);
  const [labelPosition, setLabelPosition] = useState<LabelPosition>(tiers[0].labelPosition ?? 'left');
  const previousTiersRef = useRef<Tier[]>(tiers);

  useEffect(() => {
    saveTierStateToLocalStorage(tiers);
  }, [tiers]);

  const handleTiersUpdate = useCallback((updatedTiers: Tier[]) => {
    previousTiersRef.current = updatedTiers;
    onTiersUpdate(updatedTiers);

    const encodedState = encodeTierStateForURL(updatedTiers);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('state', encodedState);
    router.replace(`${pathname}?${newParams.toString()}`, {scroll: false});

    saveTierStateToLocalStorage(updatedTiers);
  }, [onTiersUpdate, router, pathname, searchParams]);

  const handleItemsCreate = useCallback((newItems: Item[]) => {
    const updatedTiers = [...tiers];
    const lastTier = updatedTiers[updatedTiers.length - 1];

    const uniqueNewItems = newItems.filter(newItem =>
      !updatedTiers.some(tier =>
        tier.items.some(item => item.id === newItem.id || item.content === newItem.content)
      )
    ).map(item => ({...item, source: 'user'}));

    lastTier.items = [...lastTier.items, ...uniqueNewItems];

    handleTiersUpdate(updatedTiers);
  }, [tiers, handleTiersUpdate]);

  const handleUndoItemsCreate = useCallback((itemIds: string[]) => {
    const updatedTiers = tiers.map(tier => ({
      ...tier,
      items: tier.items.filter(item => !itemIds.includes(item.id))
    }));
    handleTiersUpdate(updatedTiers);
  }, [tiers, handleTiersUpdate]);

  const toggleLabels = useCallback(() => {
    setShowLabels(prev => !prev);
  }, []);

  const handleLabelPositionChange = useCallback((newPosition: LabelPosition) => {
    setLabelPosition(newPosition);
    const updatedTiers = tiers.map(tier => ({...tier, labelPosition: newPosition}));
    handleTiersUpdate(updatedTiers);
  }, [tiers, handleTiersUpdate]);

  const handleTemplateChange = useCallback((newTemplate: Tier[]) => {
    // Create a map of all existing items with their tier IDs
    const allItemsMap = new Map(
      tiers.flatMap(tier =>
        tier.items.map(item => [item.id, {item, tierId: tier.id}])
      )
    );

    // Create new tiers based on the template
    const newTiers: Tier[] = newTemplate.map(templateTier => ({
      ...templateTier,
      items: [] as Item[],
      labelPosition
    }));

    // Distribute existing items to new tiers
    allItemsMap.forEach(({item, tierId}) => {
      const targetTier = newTiers.find(tier => tier.id === tierId) ||
        newTiers.find(tier => tier.id === 'uncategorized');

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
        newTiers.push(uncategorizedTier);
      }
    });

    handleTiersUpdate(newTiers);
  }, [tiers, labelPosition, handleTiersUpdate]);

  const resetItems = useCallback(() => {
    previousTiersRef.current = tiers;

    const allItems = tiers.flatMap(tier => tier.items)
      .sort((a, b) => a.content.localeCompare(b.content));

    const resetTiers = tiers.map(tier => ({...tier, items: [] as Item[]}));

    let uncategorizedTier = resetTiers[resetTiers.length - 1];
    if (!uncategorizedTier || uncategorizedTier.id !== 'uncategorized') {
      uncategorizedTier = {
        id: 'uncategorized',
        name: '',
        items: [],
        labelPosition: labelPosition
      };
      resetTiers.push(uncategorizedTier);
    }

    uncategorizedTier.items = allItems;

    handleTiersUpdate(resetTiers);
  }, [tiers, labelPosition, handleTiersUpdate]);

  const deleteAllItems = useCallback(() => {
    previousTiersRef.current = tiers;
    const emptyTiers = tiers.map(tier => ({...tier, items: []}));
    handleTiersUpdate(emptyTiers);
  }, [tiers, handleTiersUpdate]);

  const undoReset = useCallback(() => {
    handleTiersUpdate(previousTiersRef.current);
  }, [handleTiersUpdate]);

  const undoDelete = useCallback(() => {
    handleTiersUpdate(previousTiersRef.current);
  }, [handleTiersUpdate]);

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
        <div className="flex space-x-2" id="settings" data-html2canvas-ignore>
          <TierTemplateSelector/>
          <ItemManager
            onItemsCreate={handleItemsCreate}
            onUndoItemsCreate={handleUndoItemsCreate}
            resetItems={resetItems}
            deleteAllItems={deleteAllItems}
            undoReset={undoReset}
            undoDelete={undoDelete}
          />
          <ShareButton/>
        </div>
        <div className="p-2" data-html2canvas-ignore>
          <p className="text-sm text-muted-foreground text-center">
            Drag to reorder.
          </p>
          <p className="tooltip-mouse text-sm text-muted-foreground text-center">
            Right-click on any item to delete.
          </p>
          <p className="tooltip-touch text-sm text-muted-foreground text-center">
            Long-press on any item to delete.
          </p>
        </div>
      </div>
      <DragDropTierList
        tiers={tiers}
        onTiersUpdate={handleTiersUpdate}
      />
    </TierContext.Provider>
  );
};

export default TierListManager;
