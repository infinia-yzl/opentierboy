import Tier from "@/models/Tier";
import Item from "@/models/Item";

const LOCAL_STORAGE_KEY = 'tierListState';

interface SimplifiedTier {
  id: string;
  name: string;
  items: string[];
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
    const storedState = loadTierStateFromLocalStorage();
    if (!storedState) return null;

    const itemMap = new Map(storedState.flatMap(tier => tier.items.map(item => [item.id, item])));

    return simplifiedTiers.map((simpleTier) => ({
      ...simpleTier,
      items: simpleTier.items
        .map(itemId => itemMap.get(itemId))
        .filter(Boolean) as Item[]
    }));
  } catch (error) {
    console.error('Failed to decode tier state from URL:', error);
    return null;
  }
}

export function saveTierStateToLocalStorage(tiers: Tier[]): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(tiers));
}

export function loadTierStateFromLocalStorage(): Tier[] | null {
  const storedState = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!storedState) return null;
  try {
    return JSON.parse(storedState);
  } catch (error) {
    console.error('Failed to parse stored tier state:', error);
    return null;
  }
}
