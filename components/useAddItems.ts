import {useCallback} from 'react';
import {toast} from 'sonner';
import Item from '@/models/Item';
import {useTierContext} from '@/contexts/TierContext';
import {itemsToAdd} from '@/lib/tierListReducer';

/**
 * Adds items to Unranked with the "Items Added" toast and its Undo, as every way of adding
 * items does (templates, device images, links, paste). Undo is a new change to the list, so it
 * adds a history entry (A6), and it removes only the items this really added: the list may
 * hold some of them already.
 */
export function useAddItemsWithUndo(): (newItems: Item[]) => void {
  const {tiers, addItems, removeItems} = useTierContext();
  return useCallback((newItems: Item[]) => {
    const addedIds = itemsToAdd(tiers, newItems).map((item) => item.id);
    addItems(newItems);
    toast('Items Added', {
      description: `${newItems.length} item(s) have been added.`,
      action: {
        label: 'Undo',
        onClick: () => removeItems(addedIds),
      },
    });
  }, [tiers, addItems, removeItems]);
}
