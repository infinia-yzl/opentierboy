import LZString from 'lz-string';
import {encodeV3} from './encoders/v3';
import type {EncodableState} from './types';

interface V2Item {
  i: string; // id
  c?: string; // content, only for custom items
}

interface V2Tier {
  i: string; // id
  n: string; // name
  t: V2Item[]; // items
}

interface V2State {
  tiers: V2Tier[];
  title?: string;
}

/**
 * Writes the v2 link format, byte for byte what TierCortex.encodeTierStateForURL wrote
 * before lib/state existed (commit bf2ff6e):
 *   - JSON key order {"tiers":[{"i","n","t":[{"i","c"}]}],"title"}
 *   - an item's "c" is left out when its content is undefined, and kept when it is ""
 *   - the title is left out when it is empty or undefined
 *   - lz-string compressToEncodedURIComponent of the compact JSON
 *
 * The caller decides which items carry a label: today only custom items do.
 */
export function encodeV2(state: EncodableState): string {
  const encodedState: V2State = {
    tiers: state.tiers.map(tier => ({
      i: tier.id,
      n: tier.name,
      t: tier.items.map(item => ({i: item.id, c: item.content})),
    })),
  };
  if (state.title) {
    encodedState.title = state.title;
  }
  return LZString.compressToEncodedURIComponent(JSON.stringify(encodedState));
}

/** A link format the app can write. */
export type WriteFormat = 2 | 3;

/**
 * The link format encodeState writes by default: v3 since the Phase 5b wiring step.
 * encodeListForURL (lib/listLink.ts) writes the app's links in this format; changing it to 2 makes
 * the app write v2 links exactly as before (layout settings then stay out of links).
 */
export const DEFAULT_WRITE_FORMAT: WriteFormat = 3;

export interface EncodeOptions {
  /** Overrides DEFAULT_WRITE_FORMAT. */
  format?: WriteFormat;
}

/**
 * Writes a list in the link format the app writes (DEFAULT_WRITE_FORMAT: v3).
 * Decoding with decodeState and encoding again in the same format gives back the same text
 * for values that format's encoder wrote, so opening a link and saving it unchanged does
 * not change the URL.
 */
export function encodeState(state: EncodableState, options: EncodeOptions = {}): string {
  const format = options.format ?? DEFAULT_WRITE_FORMAT;
  return format === 3 ? encodeV3(state) : encodeV2(state);
}
