import Tier from "@/models/Tier";
import Item, {ItemShape} from "@/models/Item";
import imagesetConfig from "@/imageset.config.json";
import imageAliases from "@/image-aliases.json";
import ImageSetConfig from "@/models/ImageSet";
import {ItemSet} from "@/models/ItemSet";
import {
  getCategoryShape,
  isCustomItem,
  type ItemAliases,
  type ItemCatalog,
  packageItemLookup,
  resolveItemsFromPackage,
} from "@/lib/packageItems";
import {
  DEFAULT_LIST_LAYOUT,
  type DecodedList,
  decodeTierStateFromURL,
  encodeListForURL,
  getInitialTiers,
  type ListLayout,
} from "@/lib/listLink";
import {defaultBaseUrl, getAssetUrl, getOgSafeImageUrl, getOgSafeItem} from "@/lib/linkPreview";
import {listSetName} from "@/lib/listCard/model";

/** Configuration for createTierCortex. Every field has the app's default. */
export interface TierCortexOptions {
  /** Replaces image-aliases.json (for tests). */
  aliases?: ItemAliases;
  /** Replaces imageset.config.json (for tests). */
  imageSetConfig?: ImageSetConfig;
  /** Replaces the base URL of the app's own images (defaultBaseUrl in lib/linkPreview.ts). */
  baseUrl?: string;
}

const DEFAULT_IMAGE_SET_CONFIG = imagesetConfig as ImageSetConfig;
const DEFAULT_ALIASES = imageAliases as ItemAliases;

/**
 * The app's item lookup, links and link previews, bound to one configuration: the aliases
 * (image-aliases.json), the image-set config (imageset.config.json) and the base URL of the
 * app's own images. The functions themselves live in lib/packageItems.ts (items),
 * lib/listLink.ts (reading and writing links) and lib/linkPreview.ts (previews).
 *
 * Creating one is cheap: the item lookup is built once per image-set config and shared
 * (packageItemLookup). Nothing here reads Node or browser APIs at import time, because the
 * edge OG route imports this module; the default base URL is read when a TierCortex is made.
 */
export function createTierCortex(options: TierCortexOptions = {}) {
  const imageSetConfig = options.imageSetConfig ?? DEFAULT_IMAGE_SET_CONFIG;
  const catalog: ItemCatalog = Object.freeze({
    items: packageItemLookup(imageSetConfig),
    aliases: options.aliases ?? DEFAULT_ALIASES,
  });
  const baseUrl = options.baseUrl ?? defaultBaseUrl();
  // Uploads are not read here: the editor loads them from the device image store in an effect
  // (contexts/CustomImagesContext.tsx), so the server and the browser render the same list.

  return Object.freeze({
    /** The link of a list, in the format the app writes (lib/listLink.ts). */
    encodeListForURL: (title: string, tiers: Tier[], layout: ListLayout = DEFAULT_LIST_LAYOUT): string =>
      encodeListForURL(catalog, title, tiers, layout),
    /** The list a link holds, or null when it does not decode (lib/listLink.ts). */
    decodeTierStateFromURL: (encodedState: string): DecodedList | null => decodeTierStateFromURL(catalog, encodedState),
    /** The tiers an editor starts with: the link's list, or the template (lib/listLink.ts). */
    getInitialTiers: (initialState: string | undefined, initialItemSet: ItemSet | undefined): Tier[] =>
      getInitialTiers(catalog, initialState, initialItemSet),
    /** True for an id that names no image-set item. */
    isCustomItem: (itemId: string): boolean => isCustomItem(catalog, itemId),
    /** The items of an image set's files, each by its id or an alias. */
    resolveItemsFromPackage: (packageName: string, filenames: string[]): Item[] =>
      resolveItemsFromPackage(catalog, packageName, filenames),
    /** The tile shape an image set declares for a category, or square. */
    getCategoryShape: (packageName: string, tagName: string): ItemShape => getCategoryShape(imageSetConfig, packageName, tagName),
    /** An absolute URL for one of the app's own files, such as the logo. */
    getAssetUrl: (path: string): string => getAssetUrl(path, baseUrl),
    /** An image URL as link previews load it (lib/linkPreview.ts). */
    getOgSafeImageUrl: (url: string): string => getOgSafeImageUrl(url, baseUrl),
    /** An item as link previews draw it (lib/linkPreview.ts). */
    getOgSafeItem: (item: Item): Item => getOgSafeItem(item, baseUrl),
    /** The display name of the image set most of the list's items come from (lib/listCard/model.ts). */
    listSetName: (tiers: readonly Pick<Tier, 'items'>[]): string | null => listSetName(imageSetConfig, tiers),
  });
}

/** What createTierCortex returns: the functions above, bound to one configuration. */
export type TierCortex = ReturnType<typeof createTierCortex>;
