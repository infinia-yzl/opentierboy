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
  items: SimplifiedItem[];
}

interface SimplifiedItem {
  id: string;
  content: string;
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
    items: tier.items.map(item => ({
      id: item.id,
      content: item.content
    }))
  }));
  return btoa(JSON.stringify(simplifiedTiers));
}

export function decodeTierStateFromURL(encodedState: string): Tier[] | null {
  try {
    const simplifiedTiers = JSON.parse(atob(encodedState)) as SimplifiedTier[];
    const customItems = loadCustomItemsFromLocalStorage();

    return simplifiedTiers.map(simplifiedTier => ({
      ...simplifiedTier,
      items: simplifiedTier.items.map(simplifiedItem => resolveItem(simplifiedItem, customItems))
    })) as Tier[];
  } catch (error) {
    console.error('Failed to decode tier state from URL:', error);
    return null;
  }
}

function resolveItem(simplifiedItem: SimplifiedItem, customItems: StoredCustomItem[]): Item {
  // 1. Assume it's a package item and search for it
  for (const [packageName, packageData] of Object.entries(typedImageSetConfig.packages)) {
    const image = packageData.images.find(img => simplifiedItem.id.includes(img.filename));
    if (image) {
      return {
        id: simplifiedItem.id,
        content: image.label || image.filename.split('.')[0],
        imageUrl: `/images/${packageName}/${image.filename}`,
      };
    }
  }

  // 2. If not found in packages, search localStorage
  const customItem = customItems.find(item => item.id === simplifiedItem.id);
  if (customItem) {
    return {
      id: customItem.id,
      content: customItem.content,
      imageUrl: customItem.imageData,
    };
  }

  // 3. If not found in either, create a placeholder
  return createPlaceholderItem(simplifiedItem.id, simplifiedItem.content);
}

function createPlaceholderItem(itemId: string, content: string): Item {
  return {
    id: itemId,
    content: content || 'Unavailable Item',
    imageUrl: '/placeholder-image.jpg',
  };
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

// Uploaded items will remain in perpetuity until manually deleted
export function addCustomItems(items: Item[]): void {
  const customItems = loadCustomItemsFromLocalStorage();
  const newItems = items.map(item => ({
    id: item.id,
    content: item.content,
    imageData: item.imageUrl ?? ''
  }));
  customItems.push(...newItems);
  localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(customItems));
}

// do not remove custom item pointers from local storage, because other lists may point to the same item
// export function removeCustomItem(itemId: string): void {
//   const customItems = loadCustomItemsFromLocalStorage();
//   const updatedItems = customItems.filter(item => item.id !== itemId);
//   localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(updatedItems));
// }

export function getInitialTiers(initialState: string | undefined, initialItemSet: ItemSet | undefined): Tier[] {
  if (initialState) {
    const decodedState = decodeTierStateFromURL(initialState);
    if (decodedState) return decodedState;
  }

  if (initialItemSet) {
    const initialTiers = [...DEFAULT_TIER_TEMPLATE];
    const packageData = typedImageSetConfig.packages[initialItemSet.packageName];
    initialTiers[initialTiers.length - 1].items = initialItemSet.images.map((filename) => {
      const imageData = packageData.images.find(img => img.filename === filename);
      if (!imageData) {
        console.error(`Image ${filename} not found in package ${initialItemSet.packageName}.`);
        return createPlaceholderItem(`${initialItemSet.packageName}-${filename}`, filename);
      }
      return {
        id: `${initialItemSet.packageName}-${filename}`,
        content: imageData.label || filename.split('.')[0],
        imageUrl: `/images/${initialItemSet.packageName}/${filename}`,
      };
    });
    return initialTiers;
  }

  return DEFAULT_TIER_TEMPLATE;
}
