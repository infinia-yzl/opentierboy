/**
 * The tier list as a shared link describes it, independent of the link format.
 *
 * lib/state is pure: it depends only on lz-string. No React, no window, no localStorage,
 * no IndexedDB, no Node modules. The OG preview route runs it in the edge runtime.
 */

/**
 * The link format a state was decoded from.
 *
 * - 0: legacy array of tiers, every item carries its label (`c`). No title.
 * - 1: legacy object `{tiers, title?}`, every item carries its label.
 * - 2: legacy object `{tiers, title?}`, only custom items carry a label. The app writes
 *   this format today.
 * - 3: the `3.` prefixed format (docs/link-format-v3.md). It also stores the row template,
 *   the label position, label visibility, and images from links and devices.
 *
 * A v2 list whose items are all custom, or that has no items, is byte-identical to what
 * the v1 encoder wrote for the same list, so it reports version 1 (the oldest format that
 * matches). This only affects reporting: v1 and v2 decode the same way.
 */
export type StateVersion = 0 | 1 | 2 | 3;

/**
 * The row templates of the editor's "Number of Rows" menu. The keys are the same as
 * `tierTemplates` in models/Tier.ts. 'custom' means no template: the rows match none of them.
 */
export type RowTemplateId = '3rows' | '5rows' | '7rows';
export type RowTemplate = RowTemplateId | 'custom';

/** Where tier labels sit. The same values as `LabelPosition` in models/Tier.ts. */
export type LabelPosition = 'left' | 'right' | 'top';

/**
 * An image-set item, or any item of a legacy (v0–v2) link.
 *
 * In legacy links this shape holds every item, also custom (uploaded) ones: the app tells
 * them apart by looking the id up in the image sets (isCustomItem in lib/packageItems.ts).
 * v3 links write this shape as a plain id string, or as `{i, c}` when it has a non-empty
 * `content`. The app keeps `content` only for ids that name no image-set item (A45).
 */
export interface CanonicalPackageItem {
  kind?: undefined;
  /** `<packageName>-<filename>` for package items, a random id for legacy custom items. */
  id: string;
  /** The label stored in the link, if the link stored one. Present only when stored. */
  content?: string;
}

/** v3: an image loaded from a web address. */
export interface CanonicalLinkItem {
  kind: 'link';
  /**
   * A link image stores no id. The decoder uses its URL as its id, so the same image twice
   * in one list counts as one item, as package items do. The encoder ignores this field.
   */
  id: string;
  /** The image address, exactly as stored. lib/state does not check it: see the docs. */
  url: string;
  /** The label. Empty when the link stored none. */
  content: string;
}

/** v3: an image stored in the browser of the person who added it. */
export interface CanonicalDeviceItem {
  kind: 'device';
  /**
   * The image's local id: its key in the browser's image store. v3 links accept only ids
   * that follow the device id rule (deviceId.ts: isDeviceImageId).
   */
  id: string;
  /** The label. Empty when the link stored none. */
  content: string;
}

export type CanonicalItem = CanonicalPackageItem | CanonicalLinkItem | CanonicalDeviceItem;

export interface CanonicalTier {
  id: string;
  name: string;
  items: CanonicalItem[];
}

export interface CanonicalState {
  version: StateVersion;
  /** Present only when the link stored a title. v3 never reports an empty title. */
  title?: string;
  tiers: CanonicalTier[];
  /** v3 only: the row template. Legacy links do not store it. */
  rowTemplate?: RowTemplate;
  /** v3 only: where tier labels sit. Legacy links do not store it. */
  labelPosition?: LabelPosition;
  /** v3 only: whether item labels show. Legacy links do not store it. */
  showLabels?: boolean;
}

/**
 * What the encoders need: the list without a format version. The v2 encoder writes only the
 * title and the tiers. The v3 encoder treats a missing layout field as its default
 * ('custom' row template, labels on the left, labels shown).
 */
export type EncodableState = Omit<CanonicalState, 'version'>;

export interface DecodeOptions {
  /** Called with the reason when a value does not decode (decodeState then returns null). */
  onError?: (error: unknown) => void;
}
