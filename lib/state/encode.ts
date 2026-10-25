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
 * The link format encodeState writes by default. The app writes v2 today.
 *
 * The Phase 5b wiring step switches the app to v3 by changing this to 3, once TierCortex
 * resolves v3 items and the editor passes the layout fields (row template, label position,
 * label visibility) and marks custom items as device items. Until then keep it at 2:
 * TierListManager does not pass the layout fields yet.
 */
export const DEFAULT_WRITE_FORMAT: WriteFormat = 2;

export interface EncodeOptions {
  /** Overrides DEFAULT_WRITE_FORMAT. */
  format?: WriteFormat;
}

/**
 * Writes a list in the link format the app writes (DEFAULT_WRITE_FORMAT, v2 today).
 * Decoding with decodeState and encoding again in the same format gives back the same text
 * for values that format's encoder wrote, so opening a link and saving it unchanged does
 * not change the URL.
 */
export function encodeState(state: EncodableState, options: EncodeOptions = {}): string {
  const format = options.format ?? DEFAULT_WRITE_FORMAT;
  return format === 3 ? encodeV3(state) : encodeV2(state);
}
