import Tier, {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";
import Item from "@/models/Item";
import imagesetConfig from "@/imageset.config.json";
import ImageSetConfig from "@/models/ImageSet";
import {ItemSet} from "@/models/ItemSet";
import LZString from 'lz-string';
import {apiMoeItemCache, extractMoeApiItemInfo, wandererMoeApiClient} from "@/lib/wandererMoeApiClient";

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

export interface ItemWithTags extends Item {
  tags: string[];
}

// Precompute package item lookup
export const packageItemLookup: Record<string, ItemWithTags> = {};

function initializePackageItemLookup() {
  for (const [packageName, packageData] of Object.entries(typedImageSetConfig.packages)) {
    for (const image of packageData.images) {
      const id = `${packageName}-${image.filename}`;
      packageItemLookup[id] = {
        id,
        content: image.label || image.filename.split('.')[0],
        imageUrl: `/images/${packageName}/${image.filename}`,
        tags: image.tags,
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

export async function decodeTierStateFromURL(encodedState: string): Promise<Tier[] | null> {
  try {
    const jsonString = LZString.decompressFromEncodedURIComponent(encodedState);
    if (!jsonString) throw new Error('Failed to decompress state');

    const simplifiedTiers = JSON.parse(jsonString) as SimplifiedTier[];
    initializeCustomItemsMap();

    return await Promise.all(simplifiedTiers.map(async (simplifiedTier) => {
      const items = await Promise.all(
        simplifiedTier.t.map(async (item) => await resolveItem(item.i, item.c))
      );

      return {
        id: simplifiedTier.i,
        name: simplifiedTier.n,
        items: items
      };
    }));
  } catch (error) {
    console.error('Failed to decode tier state from URL:', error);
    return null;
  }
}

async function resolveItem(itemId: string, content: string): Promise<Item> {
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

  // 3. Check if it's an API item
  const apiItemInfo = extractMoeApiItemInfo(itemId);
  if (apiItemInfo) {
    const {gameName, assetType, assetName} = apiItemInfo;

    // Check cache first
    const cacheKey = `${gameName}/${assetType}/${assetName}`;
    const cachedItem = apiMoeItemCache[cacheKey];
    if (cachedItem && cachedItem.expiresAt > Date.now()) {
      return {
        id: itemId,
        content: content,
        imageUrl: cachedItem.imageUrl,
      };
    }

    // If not in cache or expired, fetch from API
    try {
      const assetData = await wandererMoeApiClient.getGameAssetData(gameName, assetType);
      const asset = assetData.images.find(img => img.name === assetName);

      if (asset) {
        // Cache the result
        apiMoeItemCache[cacheKey] = {
          imageUrl: asset.path,
          expiresAt: Date.now() + 3600000, // Cache for 1 hour
        };

        return {
          id: itemId,
          content: content,
          imageUrl: asset.path,
        };
      }
    } catch (error) {
      console.error('Failed to fetch API item:', error);
    }
  }

  // 4. If all else fails, create an item with the provided content and a placeholder image
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

export async function getInitialTiers(initialState: string | undefined, initialItemSet: ItemSet | undefined): Promise<Tier[]> {
  if (initialState) {
    const decodedState = await decodeTierStateFromURL(initialState);
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
