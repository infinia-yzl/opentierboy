import Tier, {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";
import Item from "@/models/Item";
import imagesetConfig from "@/imageset.config.json";
import ImageSetConfig from "@/models/ImageSet";
import {ItemSet} from "@/models/ItemSet";
import LZString from 'lz-string';

const CUSTOM_ITEMS_KEY = 'customItems';
const typedImageSetConfig = imagesetConfig as ImageSetConfig;

interface SimplifiedTier {
  i: string; // id
  n: string; // name
  t: SimplifiedItem[]; // items
}

interface SimplifiedItem {
  i: string; // id
  c: string; // content
}

interface StoredCustomItem {
  i: string; // id
  c: string; // content
  d: string; // imageData
}

// Precompute package item lookup
const packageItemLookup: Record<string, Item> = {};

function initializePackageItemLookup() {
  for (const [packageName, packageData] of Object.entries(typedImageSetConfig.packages)) {
    for (const image of packageData.images) {
      const id = `${packageName}-${image.filename}`;
      packageItemLookup[id] = {
        id,
        content: image.label || image.filename.split('.')[0],
        imageUrl: `/images/${packageName}/${image.filename}`,
      };
    }
  }
}

initializePackageItemLookup();

// Use a Map for faster lookups of custom items
const customItemsMap = new Map<string, StoredCustomItem>();

function initializeCustomItemsMap() {
  if (customItemsMap.size === 0) {
    const customItems = loadCustomItemsFromLocalStorage();
    customItems.forEach(item => customItemsMap.set(item.i, item));
  }
}

export function encodeTierStateForURL(tiers: Tier[]): string {
  const simplifiedTiers: SimplifiedTier[] = tiers.map(tier => ({
    i: tier.id,
    n: tier.name,
    t: tier.items.map(item => ({
      i: item.id,
      c: item.content
    }))
  }));
  const jsonString = JSON.stringify(simplifiedTiers);
  return LZString.compressToEncodedURIComponent(jsonString);
}

export function decodeTierStateFromURL(encodedState: string): Tier[] | null {
  try {
    const jsonString = LZString.decompressFromEncodedURIComponent(encodedState);
    if (!jsonString) throw new Error('Failed to decompress state');

    const simplifiedTiers = JSON.parse(jsonString) as SimplifiedTier[];
    initializeCustomItemsMap();

    return simplifiedTiers.map(simplifiedTier => ({
      id: simplifiedTier.i,
      name: simplifiedTier.n,
      items: simplifiedTier.t.map(item => resolveItem(item.i, item.c))
    }));
  } catch (error) {
    console.error('Failed to decode tier state from URL:', error);
    return null;
  }
}

function resolveItem(itemId: string, content: string): Item {
  // 1. Check package items
  const packageItem = packageItemLookup[itemId];
  if (packageItem) return packageItem;

  // 2. Check custom items
  const customItem = customItemsMap.get(itemId);
  if (customItem) {
    return {
      id: customItem.i,
      content: content, // Use the content from the encoded URL
      imageUrl: customItem.d,
    };
  }

  // 3. Create an item with the provided content
  return {
    id: itemId,
    content: content,
    imageUrl: '/placeholder-image.jpg',
  };
}

function createPlaceholderItem(itemId: string, content: string): Item {
  return {
    id: itemId,
    content,
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

export function addCustomItems(items: Item[]): void {
  const newItems = items.map(item => ({
    i: item.id,
    c: item.content,
    d: item.imageUrl ?? ''
  }));

  newItems.forEach(item => customItemsMap.set(item.i, item));

  const allItems = Array.from(customItemsMap.values());
  localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(allItems));
}

export function getInitialTiers(initialState: string | undefined, initialItemSet: ItemSet | undefined): Tier[] {
  if (initialState) {
    const decodedState = decodeTierStateFromURL(initialState);
    if (decodedState) return decodedState;
  }

  if (initialItemSet) {
    const initialTiers = [...DEFAULT_TIER_TEMPLATE];
    const lastTierIndex = initialTiers.length - 1;

    initialTiers[lastTierIndex].items = initialItemSet.images.map((filename) => {
      const itemId = `${initialItemSet.packageName}-${filename}`;
      return packageItemLookup[itemId] || createPlaceholderItem(itemId, filename);
    });
    return initialTiers;
  }

  return DEFAULT_TIER_TEMPLATE;
}
