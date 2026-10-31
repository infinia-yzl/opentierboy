import Tier, {DEFAULT_TIER_TEMPLATE, LabelPosition} from "@/models/Tier";
import Item from "@/models/Item";
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
  type RowTemplate,
} from "@/lib/state";
import {isVersionedValue} from "@/lib/state/decode";
import {measureDecompressedLength} from "@/lib/state/lz";
import {checkLegacyState, LEGACY_LINK_LIMITS} from "@/lib/legacyLinkLimits";
import {
  createPlaceholderItem,
  isCustomItem,
  type ItemCatalog,
  PLACEHOLDER_IMAGE_URL,
  resolveItem,
  resolvePackageItem,
} from "@/lib/packageItems";

/**
 * The link of a list, between lib/state (the link format) and the items on screen: reading a
 * link into tiers of items, and writing the tiers on screen as a link. Pure functions; the item
 * lookup and aliases come in as an ItemCatalog (lib/packageItems.ts). createTierCortex in
 * lib/TierCortex.ts binds them to the app's catalog. The edge OG route runs this code too, so
 * it uses no Node or browser APIs.
 */

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

/**
 * The v2 writer: exactly the bytes TierCortex always wrote before v3 (lib/state encodeV2).
 * The app writes v3 now (encodeListForURL); this stays for DEFAULT_WRITE_FORMAT 2 and tests.
 */
export function encodeTierStateForURL(title: string | undefined, tiers: TierWithSimplifiedItems[]): string {
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
 * - image-set items as their id (the image set holds the label);
 * - link images as their address and label;
 * - uploads (custom items) as device images, by their device image id: an id from before
 *   Phase 5c that breaks the device id rule gets the prefix `legacy-` (A42);
 * - any other id that names no image-set item (an unknown id from a v3 link, or one with a
 *   dot from a legacy link, such as a removed image) as `{i, c}`, so its label stays (A45).
 * The row template is the row count, as the "Number of Rows" menu shows it.
 *
 * v2 (the format before Phase 5b) stores the title and tiers only, with labels on custom
 * items.
 */
export function encodeListForURL(catalog: ItemCatalog, title: string, tiers: Tier[], layout: ListLayout = DEFAULT_LIST_LAYOUT): string {
  if (DEFAULT_WRITE_FORMAT === 2) {
    return encodeTierStateForURL(title, tiers.map(tier => ({
      ...tier,
      items: tier.items.map(item => ({i: item.id, c: isCustomItem(catalog, item.id) ? item.content : undefined})),
    })));
  }
  const list: EncodableState = {
    title,
    tiers: tiers.map(tier => ({id: tier.id, name: tier.name, items: tier.items.map(item => toV3Item(catalog, item))})),
    rowTemplate: rowTemplateOf(tiers),
    labelPosition: layout.labelPosition,
    showLabels: layout.showLabels,
  };
  return encodeV3(list);
}

/**
 * lib/state decodes every link format; this checks legacy links against LEGACY_LINK_LIMITS and
 * turns the stored item ids into items. Returns null for a link that does not decode or breaks
 * a limit, so callers fall back to the template and the default preview image.
 */
export function decodeTierStateFromURL(catalog: ItemCatalog, encodedState: string): DecodedList | null {
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
    const list: DecodedList = {title: state.title, tiers: resolveTiers(catalog, state)};
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

/**
 * The tiers an editor starts with: the list of the link when it decodes, else the default row
 * template with the template's images in Unranked.
 */
export function getInitialTiers(catalog: ItemCatalog, initialState: string | undefined, initialItemSet: ItemSet | undefined): Tier[] {
  if (initialState) {
    const decodedState = decodeTierStateFromURL(catalog, initialState);
    if (decodedState) return decodedState.tiers;
  }

  const initialTiers: Tier[] = JSON.parse(JSON.stringify(DEFAULT_TIER_TEMPLATE));

  if (initialItemSet) {
    const lastTierIndex = initialTiers.length - 1;

    initialTiers[lastTierIndex].items = initialItemSet.images.map((filename) => {
      const itemId = `${initialItemSet.packageName}-${filename}`;
      return catalog.items.get(itemId) ?? createPlaceholderItem(itemId, filename);
    });
  }

  return initialTiers;
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
 * used by any tier), so every row has its own id. The first row with an id keeps it. An empty
 * id (only in hand-made links) becomes `tier~1`, `tier~2`..., because v3 links refuse empty
 * ids: a list opened from such a link must be able to write a v3 link that opens again. The
 * same ids always give the same result.
 */
export function uniqueTierIds(ids: readonly string[]): string[] {
  const taken = new Set(ids);
  const seen = new Set<string>();
  const newId = (base: string, firstNumber: number) => {
    let number = firstNumber;
    while (taken.has(`${base}~${number}`)) number++;
    const id = `${base}~${number}`;
    taken.add(id);
    return id;
  };
  return ids.map(id => {
    if (id === '') return newId(EMPTY_TIER_ID_BASE, 1);
    if (!seen.has(id)) {
      seen.add(id);
      return id;
    }
    return newId(id, 2);
  });
}

const EMPTY_TIER_ID_BASE = 'tier';

/**
 * Resolves the items of every tier. Duplicate ids break drag and drop, so:
 * - an item id that appears twice, also after following an alias (an old id and its new id
 *   in one list), keeps only its first place (A32);
 * - a tier id that appears twice keeps its first row, and each later row gets a new id (A38);
 * - an empty tier id or item id gets a new id too, because a v3 link needs one (A40).
 */
function resolveTiers(catalog: ItemCatalog, state: CanonicalState): Tier[] {
  const seen = new Set<string>();
  const tierIds = uniqueTierIds(state.tiers.map(tier => tier.id));
  const withItemId = nonEmptyItemIds(state.tiers.flatMap(tier => tier.items.map(item => item.id)));
  return state.tiers.map((tier, index) => ({
    id: tierIds[index],
    name: tier.name,
    items: tier.items
      .map(item => resolveCanonicalItem(catalog, withItemId(item), state.version))
      .filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }),
  }));
}

/** An item from a decoded link: by its kind in v3 links, by its id in legacy links. */
function resolveCanonicalItem(catalog: ItemCatalog, item: CanonicalItem, version: CanonicalState['version']): Item {
  if (item.kind === 'link') {
    // No image URL: the editor loads the address only from allowed sites
    // (contexts/CustomImagesContext.tsx), and link previews only from trusted ones.
    return {id: item.id, content: item.content, source: 'link', url: item.url};
  }
  if (item.kind === 'device') return resolveDeviceItem(item.id, item.content);
  if (version === 3) {
    // v3 writes uploads as device images, so a plain id (or {i, c}) names an image-set item,
    // or one the image sets do not know: its stored label on the placeholder (A45).
    return resolvePackageItem(catalog, item.id) ?? {...createPlaceholderItem(item.id, item.content ?? ''), source: 'package'};
  }
  return resolveItem(catalog, item.id, item.content);
}

/**
 * A device image from a v3 link: its label on the placeholder image, the same on the server
 * and in the browser. In the editor, the tile then shows the image this browser keeps under
 * that id in the device image store, if any (contexts/CustomImagesContext.tsx).
 */
function resolveDeviceItem(id: string, content: string): Item {
  return {id, content, imageUrl: PLACEHOLDER_IMAGE_URL, source: 'device'};
}

/** How v3 stores an item of the list on screen (see encodeListForURL). */
function toV3Item(catalog: ItemCatalog, item: Item): CanonicalItem {
  if (item.source === 'link') return {kind: 'link', id: item.id, url: item.url ?? item.id, content: item.content};
  // An image-set item: its id only (also after an alias, which gives the new id).
  if (!isCustomItem(catalog, item.id)) return {id: item.id};
  const labelled: CanonicalItem = item.content ? {id: item.id, content: item.content} : {id: item.id};
  if (item.source === 'package') return labelled;
  const deviceId = deviceImageIdForUpload(item.id);
  return deviceId === null ? labelled : {kind: 'device', id: deviceId, content: item.content};
}

/**
 * Gives each item with an empty id (only in hand-made links) a new id, `item~1`, `item~2`...
 * (the first numbers no item uses), keeping its label, because v3 links refuse empty ids (A40).
 * `ids` are all item ids of the list; the same list always gives the same ids.
 */
function nonEmptyItemIds(ids: readonly string[]): <T extends CanonicalItem>(item: T) => T {
  const taken = new Set(ids);
  let number = 1;
  return item => {
    if (item.id !== '') return item;
    while (taken.has(`item~${number}`)) number++;
    const id = `item~${number}`;
    taken.add(id);
    return {...item, id};
  };
}

function toCanonicalItem(item: SimplifiedItem): CanonicalItem {
  return item.c === undefined ? {id: item.i} : {id: item.i, content: item.c};
}
