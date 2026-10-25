import Item, {DEFAULT_ITEM_SHAPE, isItemShape, ItemShape} from "@/models/Item";
import ImageSetConfig from "@/models/ImageSet";
import {deviceImageIdForUpload} from "@/lib/state";

/**
 * Image-set items by id: the lookup, renamed ids (aliases), placeholder items and tile shapes.
 * Pure functions. The edge OG route runs this code too, so it uses no Node or browser APIs.
 */

/** The tile image of an item whose image the app cannot show (unknown id, upload not in this browser). */
export const PLACEHOLDER_IMAGE_URL = '/placeholder-image.png';
const MAX_ALIAS_STEPS = 10;

/** Old item id -> new item id, for renamed images (image-aliases.json). */
export type ItemAliases = Readonly<Record<string, string>>;

/**
 * Package items by id. A Map, so that an id from a link such as `constructor` or `__proto__`
 * finds nothing, like any other unknown id (a plain object would return its built-in members).
 */
export type PackageItemLookup = ReadonlyMap<string, Item>;

/** What item resolution needs: the image-set items, and the aliases of renamed ones. */
export interface ItemCatalog {
  readonly items: PackageItemLookup;
  readonly aliases: ItemAliases;
}

/** The lookup of each image-set config, built once on first use and then shared. */
const lookups = new WeakMap<ImageSetConfig, PackageItemLookup>();

/**
 * The package items of an image-set config, by id. Built once per config object, so every
 * caller shares one lookup. The items are frozen, because every list that shows them shares
 * them too.
 */
export function packageItemLookup(config: ImageSetConfig): PackageItemLookup {
  const known = lookups.get(config);
  if (known) return known;
  const lookup = buildPackageItemLookup(config);
  lookups.set(config, lookup);
  return lookup;
}

function buildPackageItemLookup(config: ImageSetConfig): PackageItemLookup {
  const lookup = new Map<string, Item>();
  for (const [packageName, packageData] of Object.entries(config.packages)) {
    for (const image of packageData.images) {
      const id = `${packageName}-${image.filename}`;
      // Square is the default, so only other shapes are stored on the item.
      const shape = isItemShape(image.shape) && image.shape !== DEFAULT_ITEM_SHAPE ? image.shape : undefined;
      lookup.set(id, Object.freeze({
        id,
        content: image.label || image.filename.split('.')[0],
        imageUrl: `/images/${packageName}/${image.filename}`,
        ...(shape && {shape}),
      }));
    }
  }
  return lookup;
}

/** True for an id that names no image-set item: an upload, a link image, an unknown id. */
export function isCustomItem(catalog: ItemCatalog, itemId: string): boolean {
  return !catalog.items.has(itemId);
}

/** An image-set item, also by an old id that image-aliases.json maps to it. */
export function resolvePackageItem(catalog: ItemCatalog, itemId: string): Item | undefined {
  return catalog.items.get(itemId) ?? resolveAlias(catalog, itemId);
}

/**
 * Follows image-aliases.json from the id of a renamed image to the package item that
 * replaced it, so links made before the rename keep showing the image.
 */
export function resolveAlias(catalog: ItemCatalog, itemId: string): Item | undefined {
  let currentId = itemId;
  for (let step = 0; step < MAX_ALIAS_STEPS; step++) {
    if (!Object.prototype.hasOwnProperty.call(catalog.aliases, currentId)) return undefined;
    const nextId = catalog.aliases[currentId];
    if (typeof nextId !== 'string') return undefined;
    const renamedItem = catalog.items.get(nextId);
    if (renamedItem) return renamedItem;
    currentId = nextId;
  }
  return undefined;
}

/**
 * An item of a legacy link (or a template image): the image-set item, also by an alias, or
 * else an upload or an unknown id. Such an item shows under the id that a v3 link writes for
 * it (A42: `legacy-<id>` for an upload id that breaks the device id rule), so the item keeps
 * one id on screen across Back and Forward between legacy and v3 versions of the list. Its
 * image is in the device image store under the same id (old localStorage uploads move there).
 */
export function resolveItem(catalog: ItemCatalog, itemId: string, content?: string): Item {
  const packageItem = catalog.items.get(itemId);
  if (packageItem) return packageItem;

  const renamedItem = resolveAlias(catalog, itemId);
  if (renamedItem) return renamedItem;

  // An upload (custom item) or an image the sets no longer have, under the id its v3 link
  // writes (A42). In the editor, an upload's tile shows the image from the device image store,
  // kept under that same id (contexts/CustomImagesContext.tsx).
  const shownId = deviceImageIdForUpload(itemId) ?? itemId;
  return createPlaceholderItem(shownId, content || '');
}

/** The items of an image set's files (the template picker), each by its id or an alias. */
export function resolveItemsFromPackage(catalog: ItemCatalog, packageName: string, filenames: string[]): Item[] {
  return filenames.map(filename => {
    const itemId = `${packageName}-${filename}`;
    return resolveItem(catalog, itemId, filename.split('.')[0]);
  });
}

/**
 * An unknown item: its stored label on the placeholder image. The image URL is relative, like
 * the package images, so next/image loads it on every host (A37). An absolute URL went
 * through the image optimizer as a remote image, which refused every host but localhost:3000,
 * so on Vercel the tile showed no image. Link previews make it absolute (getOgSafeImageUrl in
 * lib/linkPreview.ts).
 */
export function createPlaceholderItem(itemId: string, content: string): Item {
  return {
    id: itemId,
    content,
    imageUrl: PLACEHOLDER_IMAGE_URL,
  };
}

/**
 * The tile shape that an image set declares for a category (tag): square when it declares
 * none, and for unknown sets and tags. Item shapes come with the items (itemShape()).
 */
export function getCategoryShape(config: ImageSetConfig, packageName: string, tagName: string): ItemShape {
  const packages = config.packages;
  if (!Object.prototype.hasOwnProperty.call(packages, packageName)) return DEFAULT_ITEM_SHAPE;
  const tags = packages[packageName].tags;
  if (!Object.prototype.hasOwnProperty.call(tags, tagName)) return DEFAULT_ITEM_SHAPE;
  const shape = tags[tagName].shape;
  return isItemShape(shape) ? shape : DEFAULT_ITEM_SHAPE;
}
