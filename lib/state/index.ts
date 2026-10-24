/**
 * The shared-link format: decoding every format the app ever wrote, and encoding the
 * current one. Pure code: it depends only on lz-string, so it runs in the browser, on the
 * server and in the edge runtime (the OG preview route).
 */
export {decodeState} from './decode';
export {encodeState, encodeV2} from './encode';
export type {
  CanonicalItem,
  CanonicalState,
  CanonicalTier,
  DecodeOptions,
  EncodableState,
  StateVersion,
} from './types';
