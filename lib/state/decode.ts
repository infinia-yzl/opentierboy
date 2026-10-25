import {decodeLegacyState} from './decoders/legacy';
import {readV3Payload} from './decoders/v3';
import type {CanonicalState, DecodeOptions} from './types';

/**
 * A versioned link value starts with its version number and a dot, for example `3.N4Ig...`.
 *
 * Legacy values (v0, v1, v2) have no prefix. They always start with 'N', because they are
 * lz-string output of JSON that starts with '{' or '['. A legacy value never starts with a
 * digit, so the prefix cannot be confused with one.
 */
const VERSION_PREFIX = /^(\d+)\./;

/** Returns the decoded state, or throws an Error that says why the value is invalid. */
type VersionedDecoder = (payload: string) => CanonicalState;

/**
 * Decoders for versioned values, keyed by the exact version text before the dot.
 *
 * A version without a decoder here is unknown: its values go to the legacy decoder, which
 * rejects them. A decoder receives the payload after the dot exactly as it came from the URL,
 * so it must read ' ' as '+' (lz-string's decompressFromEncodedURIComponent does) and ignore
 * characters after the end of its data, as the legacy decoder does.
 * docs/link-format-v3.md explains how to add a version.
 */
const VERSIONED_DECODERS: Readonly<Record<string, VersionedDecoder>> = {
  '3': payload => {
    const result = readV3Payload(payload);
    if (!result.ok) throw new Error(`Invalid v3 state: ${result.reason}`);
    return result.state;
  },
};

/**
 * Decodes the `state` value of a shared link. Returns null when the value is not a link this
 * app ever wrote; never throws.
 *
 * A value is versioned only when it starts with a known version and a dot. Everything else
 * goes to the legacy decoder, including legacy links that picked up stray characters at the
 * end (a trailing '.' or ')' from a chat message), which keep decoding as they always did.
 * Spaces count as '+', because URLSearchParams turns '+' into a space.
 */
export function decodeState(raw: string, options: DecodeOptions = {}): CanonicalState | null {
  try {
    const versioned = findVersionedDecoder(raw);
    if (versioned) return versioned.decode(versioned.payload);
    return decodeLegacyState(raw);
  } catch (error) {
    options.onError?.(error);
    return null;
  }
}

function findVersionedDecoder(raw: string): {decode: VersionedDecoder; payload: string} | null {
  const match = VERSION_PREFIX.exec(raw);
  if (!match) return null;
  const version = match[1];
  if (!Object.prototype.hasOwnProperty.call(VERSIONED_DECODERS, version)) return null;
  return {decode: VERSIONED_DECODERS[version], payload: raw.slice(match[0].length)};
}

/**
 * True when decodeState hands `raw` to a versioned decoder (it starts with a known version and
 * a dot), false when it goes to the legacy decoder. TierCortex uses it to apply the legacy
 * link limits only to legacy values.
 */
export function isVersionedValue(raw: string): boolean {
  return findVersionedDecoder(raw) !== null;
}
