import Tier, {DEFAULT_TIER_TEMPLATE, LabelPosition} from "@/models/Tier";
import Item, {DEFAULT_ITEM_SHAPE, isItemShape, ItemShape} from "@/models/Item";
import imagesetConfig from "@/imageset.config.json";
import imageAliases from "@/image-aliases.json";
import ImageSetConfig from "@/models/ImageSet";
import {ItemSet} from "@/models/ItemSet";
import {
  type CanonicalItem,
  type CanonicalState,
  decodeState,
  DEFAULT_WRITE_FORMAT,
  deviceImageIdForUpload,
  type EncodableState,
  encodeState,
  encodeV3,
  LEGACY_UPLOAD_ID_PREFIX,
  type RowTemplate,
} from "@/lib/state";
import {isVersionedValue} from "@/lib/state/decode";
import {measureDecompressedLength} from "@/lib/state/lz";
import {checkLegacyState, LEGACY_LINK_LIMITS} from "@/lib/legacyLinkLimits";

const CUSTOM_ITEMS_KEY = 'customItems';
const PLACEHOLDER_IMAGE_URL = '/placeholder-image.png';
/** The placeholder at link preview size (made by scripts/prepareImages.js). */
const PLACEHOLDER_PREVIEW_URL = '/placeholder-image.preview.png';
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

/** The layout settings that a v3 link carries along with the list (A3). */
export interface ListLayout {
  labelPosition: LabelPosition;
  showLabels: boolean;
}

/** The layout of a list whose link stores none: legacy links, template pages. */
export const DEFAULT_LIST_LAYOUT: ListLayout = Object.freeze({labelPosition: 'left', showLabels: true});

/** A list read from a link. `layout` is set only for v3 links, which store it. */
export interface DecodedList {
  title?: string;
  tiers: Tier[];
  layout?: ListLayout;
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

  /**
   * The v2 writer: exactly the bytes TierCortex always wrote before v3 (lib/state encodeV2).
   * The app writes v3 now (encodeListForURL); this stays for DEFAULT_WRITE_FORMAT 2 and tests.
   */
  public static encodeTierStateForURL(title: string | undefined, tiers: TierWithSimplifiedItems[]): string {
    return encodeState({
      title,
      tiers: tiers.map(tier => ({
        id: tier.id,
        name: tier.name,
        items: tier.items.map(toCanonicalItem),
      })),
    }, {format: 2});
  }

  /**
   * The link of a list, in the format the app writes (DEFAULT_WRITE_FORMAT in lib/state).
   *
   * v3 (docs/link-format-v3.md) stores the layout and each item by kind:
   * - image-set items, and image-set ids from v3 links that the image sets do not know, as
   *   their id (the image set holds the label);
   * - link images as their address and label;
   * - uploads (custom items) as device images, by their device image id: an id from before
   *   Phase 5c that breaks the device id rule gets the prefix `legacy-` (A42). An id that no
   *   prefix makes valid (an unknown id with a dot, from a legacy link) stays as a plain id.
   * The row template is the row count, as the "Number of Rows" menu shows it.
   *
   * v2 (the format before Phase 5b) stores the title and tiers only, with labels on custom
   * items.
   */
  public encodeListForURL(title: string, tiers: Tier[], layout: ListLayout = DEFAULT_LIST_LAYOUT): string {
    if (DEFAULT_WRITE_FORMAT === 2) {
      return TierCortex.encodeTierStateForURL(title, tiers.map(tier => ({
        ...tier,
        items: tier.items.map(item => ({i: item.id, c: this.isCustomItem(item.id) ? item.content : undefined})),
      })));
    }
    const list: EncodableState = {
      title,
      tiers: tiers.map(tier => ({id: tier.id, name: tier.name, items: tier.items.map(item => this.toV3Item(item))})),
      rowTemplate: rowTemplateOf(tiers),
      labelPosition: layout.labelPosition,
      showLabels: layout.showLabels,
    };
    return encodeV3(list);
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
  public decodeTierStateFromURL(encodedState: string): DecodedList | null {
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
      const list: DecodedList = {title: state.title, tiers: this.resolveTiers(state)};
      if (state.version === 3) {
        list.layout = {
          labelPosition: state.labelPosition ?? DEFAULT_LIST_LAYOUT.labelPosition,
          showLabels: state.showLabels ?? DEFAULT_LIST_LAYOUT.showLabels,
        };
      }
      return list;
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

  /**
   * The image URL for link previews: the PNG copy of a WebP image, or the placeholder's copy.
   * These copies are made at preview size (scripts/prepareImages.js), so previews draw fast.
   */
  public getOgSafeImageUrl(url: string): string {
    if (url === PLACEHOLDER_IMAGE_URL) url = PLACEHOLDER_PREVIEW_URL;

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

  /**
   * The item as link previews draw it. Link images and device images get no image URL, so
   * previews draw them as label tiles: the server never loads a link image's address (A8,
   * A36), and device images exist only in someone's browser.
   */
  public getOgSafeItem(item: Item): Item {
    if (item.source === 'link' || item.source === 'device' || !item.imageUrl) {
      return {...item, imageUrl: undefined};
    }
    return {
      ...item,
      imageUrl: this.getOgSafeImageUrl(item.imageUrl)
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

  /**
   * Resolves the items of every tier. Duplicate ids break drag and drop, so:
   * - an item id that appears twice, also after following an alias (an old id and its new id
   *   in one list), keeps only its first place (A32);
   * - a tier id that appears twice keeps its first row, and each later row gets a new id (A38).
   */
  private resolveTiers(state: CanonicalState): Tier[] {
    const seen = new Set<string>();
    const tierIds = uniqueTierIds(state.tiers.map(tier => tier.id));
    return state.tiers.map((tier, index) => ({
      id: tierIds[index],
      name: tier.name,
      items: tier.items
        .map(item => this.resolveCanonicalItem(item, state.version))
        .filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        }),
    }));
  }

  /** An item from a decoded link: by its kind in v3 links, by its id in legacy links. */
  private resolveCanonicalItem(item: CanonicalItem, version: CanonicalState['version']): Item {
    if (item.kind === 'link') {
      // A label tile until Phase 5c: no image URL, so nothing loads the address.
      return {id: item.id, content: item.content, source: 'link', url: item.url};
    }
    if (item.kind === 'device') return this.resolveDeviceItem(item.id, item.content);
    if (version === 3) {
      // v3 writes uploads as device images, so a plain id is always an image-set id.
      return this.resolvePackageItem(item.id) ?? {...this.createPlaceholderItem(item.id, ''), source: 'package'};
    }
    return this.resolveItem(item.id, item.content);
  }

  /** An image-set item, also by an old id that image-aliases.json maps to it. */
  private resolvePackageItem(itemId: string): Item | undefined {
    return this.packageItemLookup.get(itemId) ?? this.resolveAlias(itemId);
  }

  /**
   * A device image from a v3 link: the upload this browser stored under that id, or under the
   * id before the `legacy-` prefix (A42). Otherwise its label on the placeholder image, as for a
   * legacy custom item that this browser does not have.
   */
  private resolveDeviceItem(id: string, content: string): Item {
    let stored: StoredCustomItem | undefined;
    if (!this.isServer) {
      stored = this.customItemsMap.get(id);
      if (!stored && id.startsWith(LEGACY_UPLOAD_ID_PREFIX)) {
        stored = this.customItemsMap.get(id.slice(LEGACY_UPLOAD_ID_PREFIX.length));
      }
    }
    if (stored) return {id, content: content || stored.c, imageUrl: stored.d, source: 'device'};
    return {id, content, imageUrl: PLACEHOLDER_IMAGE_URL, source: 'device'};
  }

  /** How v3 stores an item of the list on screen (see encodeListForURL). */
  private toV3Item(item: Item): CanonicalItem {
    if (item.source === 'link') return {kind: 'link', id: item.id, url: item.url ?? item.id, content: item.content};
    if (item.source === 'package' || !this.isCustomItem(item.id)) return {id: item.id};
    const deviceId = deviceImageIdForUpload(item.id);
    return deviceId === null ? {id: item.id} : {kind: 'device', id: deviceId, content: item.content};
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

  /**
   * An unknown item: its stored label on the placeholder image. The image URL is relative, like
   * the package images, so next/image loads it on every host (A37). An absolute URL went
   * through the image optimizer as a remote image, which refused every host but localhost:3000,
   * so on Vercel the tile showed no image. Link previews make it absolute (getOgSafeImageUrl).
   */
  private createPlaceholderItem(itemId: string, content: string): Item {
    return {
      id: itemId,
      content,
      imageUrl: PLACEHOLDER_IMAGE_URL,
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

/**
 * The row template of a list, as the "Number of Rows" menu shows it: its row count without
 * the Unranked row. Any other count is 'custom'.
 */
export function rowTemplateOf(tiers: readonly Tier[]): RowTemplate {
  switch (tiers.length - 1) {
    case 3: return '3rows';
    case 5: return '5rows';
    case 7: return '7rows';
    default: return 'custom';
  }
}

/**
 * The tier ids with each later duplicate renamed to `<id>~2`, `<id>~3`... (the first number not
 * used by any tier), so every row has its own id. The first row with an id keeps it. The same
 * ids always give the same result.
 */
export function uniqueTierIds(ids: readonly string[]): string[] {
  const taken = new Set(ids);
  const seen = new Set<string>();
  return ids.map(id => {
    if (!seen.has(id)) {
      seen.add(id);
      return id;
    }
    let number = 2;
    while (taken.has(`${id}~${number}`)) number++;
    const newId = `${id}~${number}`;
    taken.add(newId);
    return newId;
  });
}

function toCanonicalItem(item: SimplifiedItem): CanonicalItem {
  return item.c === undefined ? {id: item.i} : {id: item.i, content: item.c};
}

export default TierCortex;
