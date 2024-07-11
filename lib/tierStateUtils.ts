import Tier, {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";
import Item from "@/models/Item";
import imagesetConfig from "@/imageset.config.json";
import ImageSetConfig from "@/models/ImageSet";
import {ItemSet} from "@/models/ItemSet";

const CUSTOM_ITEMS_KEY = 'customItems';
const typedImageSetConfig = imagesetConfig as ImageSetConfig;


interface SimplifiedTier {
  id: string;
  name: string;
  items: string[]; // Store item IDs as strings
}

interface StoredCustomItem {
  id: string;
  content: string;
  imageData: string;
}

export function encodeTierStateForURL(tiers: Tier[]): string {
  const simplifiedTiers: SimplifiedTier[] = tiers.map(tier => ({
    id: tier.id,
    name: tier.name,
    items: tier.items.map(item => item.id)
  }));
  return btoa(JSON.stringify(simplifiedTiers));
}

export function decodeTierStateFromURL(encodedState: string): Tier[] | null {
  try {
    const simplifiedTiers = JSON.parse(atob(encodedState)) as SimplifiedTier[];
    const customItems = loadCustomItemsFromLocalStorage();

    return simplifiedTiers.map(simplifiedTier => ({
      ...simplifiedTier,
      items: simplifiedTier.items.map(itemId => {
        // Check if it's a custom item first
        const customItem = customItems.find(item => item.id === itemId);
        if (customItem) {
          return {
            id: customItem.id,
            content: customItem.content,
            imageUrl: customItem.imageData,
            isUploaded: true,
            tags: []
          };
        }

        // If not a custom item, try to parse as a package item
        const packageMatch = itemId.match(/^(.+)-(\w+)-item-(\d+)$/);
        if (packageMatch) {
          const [, packageName, tagName, indexStr] = packageMatch;
          const index = parseInt(indexStr, 10);

          const packageData = typedImageSetConfig.packages[packageName];

          if (!packageData) {
            console.error(`Package ${packageName} not found in configuration.`);
            return createPlaceholderItem(itemId);
          }

          const image = packageData.images[index];

          if (!image) {
            console.error(`Image at index ${index} not found in package ${packageName}.`);
            return createPlaceholderItem(itemId);
          }

          return {
            id: itemId,
            content: image.label || image.filename.split('.')[0],
            imageUrl: `/images/${packageName}/${image.filename}`,
            tags: image.tags || [tagName],
            source: 'package' as const
          };
        }

        // If it doesn't match either format, return a placeholder
        console.error(`Invalid item ID format: ${itemId}`);
        return createPlaceholderItem(itemId);
      })
    })) as Tier[];
  } catch (error) {
    console.error('Failed to decode tier state from URL:', error);
    return null;
  }
}

function createPlaceholderItem(itemId: string): Item {
  return {
    id: itemId,
    content: 'Unavailable Item',
    imageUrl: '/placeholder-image.jpg',
  };
}

export function saveTierStateToLocalStorage(tiers: Tier[]): void {
  const customItems = tiers.flatMap(tier =>
    tier.items.filter(item => item.isUploaded)
  );

  if (customItems.length > 0) {
    const storedCustomItems = customItems.map(item => ({
      id: item.id,
      content: item.content,
      imageData: item.imageUrl
    })) as StoredCustomItem[]
    localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(storedCustomItems));
  } else {
    // be careful of this, if customItems aren't detected correctly, it will auto-delete from local storage
    localStorage.removeItem(CUSTOM_ITEMS_KEY);
  }
}

export function loadCustomItemsFromLocalStorage(): StoredCustomItem[] {
  const storedItems = localStorage.getItem(CUSTOM_ITEMS_KEY);
  if (!storedItems) return [];
  try {
    return JSON.parse(storedItems);
  } catch (error) {
    console.error('Failed to parse stored custom items:', error);
    return [];
  }
}

export function addCustomItem(item: Item): void {
  const customItems = loadCustomItemsFromLocalStorage();
  const newItem: StoredCustomItem = {
    id: item.id,
    content: item.content,
    imageData: item.imageUrl ?? ''
  };
  customItems.push(newItem);
  localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(customItems));
}

export function removeCustomItem(itemId: string): void {
  const customItems = loadCustomItemsFromLocalStorage();
  const updatedItems = customItems.filter(item => item.id !== itemId);
  localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(updatedItems));
}

export function getInitialTiers(initialState: string | undefined, initialItemSet: ItemSet | undefined): Tier[] {
  if (initialState) {
    const decodedState = decodeTierStateFromURL(initialState);
    if (decodedState) return decodedState;
  }

  if (initialItemSet) {
    const initialTiers = [...DEFAULT_TIER_TEMPLATE];
    const packageData = typedImageSetConfig.packages[initialItemSet.packageName];
    initialTiers[initialTiers.length - 1].items = initialItemSet.images.map((image, index) => {
      const imageData = packageData.images.find(img => img.filename === image);
      return {
        id: `${initialItemSet.packageName}-${initialItemSet.tagName}-item-${index}`,
        content: imageData?.label || image.split('.')[0],
        imageUrl: `/images/${initialItemSet.packageName}/${image}`,
        tags: imageData?.tags || [initialItemSet.tagName],
        source: 'package' as const
      };
    });
    return initialTiers;
  }

  return DEFAULT_TIER_TEMPLATE;
}
