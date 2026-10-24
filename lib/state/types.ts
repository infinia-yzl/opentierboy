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
 * - 3: reserved for the `3.` prefixed format (Phase 5b).
 *
 * A v2 list whose items are all custom, or that has no items, is byte-identical to what
 * the v1 encoder wrote for the same list, so it reports version 1 (the oldest format that
 * matches). This only affects reporting: v1 and v2 decode the same way.
 */
export type StateVersion = 0 | 1 | 2 | 3;

export interface CanonicalItem {
  /** `<packageName>-<filename>` for package items, a random id for custom items. */
  id: string;
  /** The label stored in the link, if the link stored one. Present only when stored. */
  content?: string;
}

export interface CanonicalTier {
  id: string;
  name: string;
  items: CanonicalItem[];
}

export interface CanonicalState {
  version: StateVersion;
  /** Present only when the link stored a title. */
  title?: string;
  tiers: CanonicalTier[];
}

/** What the encoder needs: the list without a format version. */
export type EncodableState = Pick<CanonicalState, 'title' | 'tiers'>;

export interface DecodeOptions {
  /** Called with the reason when a value does not decode (decodeState then returns null). */
  onError?: (error: unknown) => void;
}
