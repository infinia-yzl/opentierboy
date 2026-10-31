import LZString from 'lz-string';
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

/**
 * Writes the link format the app writes today: v2. Phase 5b switches this to v3.
 * Decoding with decodeState and encoding again gives back the same bytes for v1 and v2
 * values, so opening a link and saving it unchanged does not change the URL.
 */
export function encodeState(state: EncodableState): string {
  return encodeV2(state);
}
