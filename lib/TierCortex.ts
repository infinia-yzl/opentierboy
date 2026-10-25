import Tier, {DEFAULT_TIER_TEMPLATE} from "@/models/Tier";
import Item, {DEFAULT_ITEM_SHAPE, isItemShape, ItemShape} from "@/models/Item";
import imagesetConfig from "@/imageset.config.json";
import imageAliases from "@/image-aliases.json";
import ImageSetConfig from "@/models/ImageSet";
import {ItemSet} from "@/models/ItemSet";
import {type CanonicalItem, type CanonicalState, decodeState, encodeState} from "@/lib/state";
import {isVersionedValue} from "@/lib/state/decode";
import {measureDecompressedLength} from "@/lib/state/lz";
import {checkLegacyState, LEGACY_LINK_LIMITS} from "@/lib/legacyLinkLimits";

const CUSTOM_ITEMS_KEY = 'customItems';
const typedImageSetConfig = imagesetConfig as ImageSetConfig;
const MAX_ALIAS_STEPS = 10;

/** Old item id -> new item id, for renamed images (image-aliases.json). */
export type ItemAliases = Readonly<Record<string, string>>;

export interface TierCortexOptions {
  /** Replaces image-aliases.json (for tests). */
  aliases?: ItemAliases;
  /** Replaces imageset.config.json (for tests). */
  imageSetConfig?: ImageSetConfig;
}

interface SimplifiedItem {
  i: string; // id
  c?: string; // content (only for custom items)
}

export interface TierWithSimplifiedItems extends Omit<Tier, 'items'> {
  items: SimplifiedItem[];
}

interface StoredCustomItem {
  i: string; // id
  c: string; // content
  d: string; // imageData
}

/**
 * Package items by id. A Map, so that an id from a link such as `constructor` or `__proto__`
 * finds nothing, like any other unknown id (a plain object would return its built-in members).
 */
export type PackageItemLookup = ReadonlyMap<string, Item>;

const OG_TIER_GRADIENTS = [
  'linear-gradient(to right, #d21203, #c40a01)',
  'linear-gradient(to right, #ee1e1e, #f84a44)',
  'linear-gradient(to right, #dca414, #dc991d)',
  'linear-gradient(to right, #c98b17, #e8910f)',
  'linear-gradient(to right, #7ad21f, #1aea1d)',
  'linear-gradient(to right, #72b231, #0cd30e)',
  'linear-gradient(to right, #4d7e15, #01b004)',
];

export class TierCortex {
  // this class isn't concerned about managing UI states, so tiers are managed externally
  private readonly packageItemLookup: PackageItemLookup;
  private customItemsMap: Map<string, StoredCustomItem>;
  private readonly isServer: boolean;
  private readonly aliases: ItemAliases;
  private readonly imageSetConfig: ImageSetConfig;
  private baseUrl: string;


  constructor(options: TierCortexOptions = {}) {
    this.aliases = options.aliases ?? (imageAliases as ItemAliases);
    this.imageSetConfig = options.imageSetConfig ?? typedImageSetConfig;
    this.isServer = typeof window === 'undefined';
    this.baseUrl = this.isServer ? process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3000'
      : window.location.origin;
    this.packageItemLookup = this.initializePackageItemLookup();
    this.customItemsMap = new Map<string, StoredCustomItem>();

    if (!this.isServer) {
      this.initializeCustomItemsMap();
    }
  }

  // The link format lives in lib/state. This writes exactly the bytes it always wrote.
  public static encodeTierStateForURL(title: string | undefined, tiers: TierWithSimplifiedItems[]): string {
    return encodeState({
      title,
      tiers: tiers.map(tier => ({
        id: tier.id,
        name: tier.name,
        items: tier.items.map(toCanonicalItem),
      })),
    });
  }

  public isCustomItem(itemId: string): boolean {
    return !this.packageItemLookup.has(itemId);
  }

  public getOgTierGradient(index: number, tiersLength: number): string {
    if (index === tiersLength - 1) return 'linear-gradient(to right, #f0f0f0, #f0f0f0)';
    return OG_TIER_GRADIENTS[index % OG_TIER_GRADIENTS.length];
  }

  /**
   * lib/state decodes every link format; TierCortex checks legacy links against
   * LEGACY_LINK_LIMITS and turns the stored item ids into items. Returns null for a link that
   * does not decode or breaks a limit, so callers fall back to the template and the default
   * preview image.
   */
  public decodeTierStateFromURL(encodedState: string): { title?: string, tiers: Tier[] } | null {
    const logError = (error: unknown) => console.error('Failed to decode tier state from URL:', error);

    // A short link can decompress to a huge text, so legacy links are measured first (A29).
    const isLegacy = !isVersionedValue(encodedState);
    if (isLegacy && measureDecompressedLength(encodedState, LEGACY_LINK_LIMITS.maxJsonLength) === null) {
      logError(new Error(`The link is not complete lz-string data, or holds more than ${LEGACY_LINK_LIMITS.maxJsonLength} characters`));
      return null;
    }

    const decoded = decodeState(encodedState, {onError: logError});
    if (!decoded) return null;

    let state: CanonicalState = decoded;
    if (isLegacy) {
      const check = checkLegacyState(decoded);
      if (!check.ok) {
        logError(new Error(`The link holds ${check.reason}`));
        return null;
      }
      state = check.state;
    }

    try {
      return {title: state.title, tiers: this.resolveTiers(state)};
    } catch (error) {
      logError(error);
      return null;
    }
  }

  public addCustomItems(items: Item[]): void {
    if (this.isServer) return;

    const newItems = items.map(item => ({
      i: item.id,
      c: item.content,
      d: item.imageUrl ?? ''
    }));

    newItems.forEach(item => this.customItemsMap.set(item.i, item));

    const allItems = Array.from(this.customItemsMap.values());
    localStorage.setItem(CUSTOM_ITEMS_KEY, JSON.stringify(allItems));
  }

  public getInitialTiers(initialState: string | undefined, initialItemSet: ItemSet | undefined): Tier[] {
    if (initialState) {
      const decodedState = this.decodeTierStateFromURL(initialState);
      if (decodedState) return decodedState.tiers;
    }

    const initialTiers: Tier[] = JSON.parse(JSON.stringify(DEFAULT_TIER_TEMPLATE));

    if (initialItemSet) {
      const lastTierIndex = initialTiers.length - 1;

      initialTiers[lastTierIndex].items = initialItemSet.images.map((filename) => {
        const itemId = `${initialItemSet.packageName}-${filename}`;
        return this.packageItemLookup.get(itemId) ?? this.createPlaceholderItem(itemId, filename);
      });
    }

    return initialTiers;
  }

  public getOgSafeImageUrl(url: string): string {
    // Convert WebP to PNG
    if (url.toLowerCase().endsWith('.webp')) {
      url = url.substring(0, url.length - 5) + '.png';
    }

    // Make URL absolute if it's not already
    if (!url.startsWith('http')) {
      url = new URL(url, this.baseUrl).toString();
    }

    return url;
  }

  public getOgSafeItem(item: Item): Item {
    return {
      ...item,
      imageUrl: this.getOgSafeImageUrl(item.imageUrl ?? '')
    };
  }

  public resolveItemsFromPackage(packageName: string, filenames: string[]): Item[] {
    return filenames.map(filename => {
      const itemId = `${packageName}-${filename}`;
      return this.resolveItem(itemId, filename.split('.')[0]);
    });
  }

  public getAssetUrl(path: string): string {
    return this.getAbsoluteUrl(path);
  }

  /**
   * The tile shape that an image set declares for a category (tag): square when it declares
   * none, and for unknown sets and tags. Item shapes come with the items (itemShape()).
   */
  public getCategoryShape(packageName: string, tagName: string): ItemShape {
    const packages = this.imageSetConfig.packages;
    if (!Object.prototype.hasOwnProperty.call(packages, packageName)) return DEFAULT_ITEM_SHAPE;
    const tags = packages[packageName].tags;
    if (!Object.prototype.hasOwnProperty.call(tags, tagName)) return DEFAULT_ITEM_SHAPE;
    const shape = tags[tagName].shape;
    return isItemShape(shape) ? shape : DEFAULT_ITEM_SHAPE;
  }

  private initializePackageItemLookup(): PackageItemLookup {
    const packageItemLookup = new Map<string, Item>();
    for (const [packageName, packageData] of Object.entries(this.imageSetConfig.packages)) {
      for (const image of packageData.images) {
        const id = `${packageName}-${image.filename}`;
        // Square is the default, so only other shapes are stored on the item.
        const shape = isItemShape(image.shape) && image.shape !== DEFAULT_ITEM_SHAPE ? image.shape : undefined;
        packageItemLookup.set(id, {
          id,
          content: image.label || image.filename.split('.')[0],
          imageUrl: `/images/${packageName}/${image.filename}`,
          ...(shape && {shape}),
        });
      }
    }
    return packageItemLookup;
  }

  private initializeCustomItemsMap(): void {
    if (this.customItemsMap.size === 0) {
      const customItems = this.loadCustomItemsFromLocalStorage();
      customItems.forEach(item => this.customItemsMap.set(item.i, item));
    }
  }

  private resolveTiers(state: CanonicalState): Tier[] {
    return state.tiers.map(tier => ({
      id: tier.id,
      name: tier.name,
      items: tier.items.map(item => this.resolveItem(item.id, item.content)),
    }));
  }

  private resolveItem(itemId: string, content?: string): Item {
    const packageItem = this.packageItemLookup.get(itemId);
    if (packageItem) return packageItem;

    const renamedItem = this.resolveAlias(itemId);
    if (renamedItem) return renamedItem;

    if (!this.isServer) {
      const customItem = this.customItemsMap.get(itemId);
      if (customItem) {
        return {
          id: customItem.i,
          content: content || customItem.c,
          imageUrl: customItem.d,
        };
      }
    }

    return this.createPlaceholderItem(itemId, content || '');
  }

  /**
   * Follows image-aliases.json from the id of a renamed image to the package item that
   * replaced it, so links made before the rename keep showing the image.
   */
  private resolveAlias(itemId: string): Item | undefined {
    let currentId = itemId;
    for (let step = 0; step < MAX_ALIAS_STEPS; step++) {
      if (!Object.prototype.hasOwnProperty.call(this.aliases, currentId)) return undefined;
      const nextId = this.aliases[currentId];
      if (typeof nextId !== 'string') return undefined;
      const renamedItem = this.packageItemLookup.get(nextId);
      if (renamedItem) return renamedItem;
      currentId = nextId;
    }
    return undefined;
  }

  private createPlaceholderItem(itemId: string, content: string): Item {
    return {
      id: itemId,
      content,
      imageUrl: this.getAbsoluteUrl('/placeholder-image.png'),
    };
  }

  private loadCustomItemsFromLocalStorage(): StoredCustomItem[] {
    if (this.isServer) return [];

    const storedItems = localStorage.getItem(CUSTOM_ITEMS_KEY);
    if (!storedItems) return [];
    try {
      return JSON.parse(storedItems);
    } catch (error) {
      console.error('Failed to parse stored custom items:', error);
      return [];
    }
  }

  private getAbsoluteUrl(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }
}

function toCanonicalItem(item: SimplifiedItem): CanonicalItem {
  return item.c === undefined ? {id: item.i} : {id: item.i, content: item.c};
}

export default TierCortex;
