import {useCallback} from 'react';
import {toast} from 'sonner';
import Item from '@/models/Item';
import {useTierContext} from '@/contexts/TierContext';
import {useCustomImages} from '@/contexts/CustomImagesContext';
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
    if (addedIds.length === 0) {
      toast('No New Items', {description: 'Every item is already in the list.'});
      return;
    }
    toast('Items Added', {
      description: `${addedIds.length} item(s) have been added.`,
      action: {
        label: 'Undo',
        onClick: () => removeItems(addedIds),
      },
    });
  }, [tiers, addItems, removeItems]);
}

/** A link image the visitor chose: an address that passed checkLinkImageUrl, and its label. */
export interface ChosenLinkImage {
  /** The normalised address checkLinkImageUrl returned. */
  url: string;
  /** Its host, as checkLinkImageUrl returned it. */
  host: string;
  label: string;
}

/**
 * Link images the visitor adds ("From a link", a dropped link, a pasted image address; #107):
 * the visitor chose these sites, so their images may load on this page (allowHosts), and the
 * images become link image items. Every way of adding a link image goes through here.
 */
export function useLinkImageItems(): (images: readonly ChosenLinkImage[]) => Item[] {
  const {allowHosts} = useCustomImages();
  return useCallback((images: readonly ChosenLinkImage[]) => {
    allowHosts(Array.from(new Set(images.map((image) => image.host))));
    return images.map(({url, label}) => ({id: url, content: label, source: 'link', url}));
  }, [allowHosts]);
}
