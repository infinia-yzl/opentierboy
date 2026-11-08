/*
 * FROZEN. Never edit this file.
 *
 * Decodes the three legacy link formats (v0, v1, v2). People have shared links in these
 * formats since July 2024, and every one of them must keep opening forever. The logic is
 * copied from TierCortex.decodeTierStateFromURL as it was at commit bf2ff6e, with item
 * resolution left out (TierCortex still resolves items). It throws the same errors.
 *
 * The formats, as the historical encoders wrote them (lz-string compressToEncodedURIComponent
 * of compact JSON):
 *   v0 (c7a5995, July 2024):  [{"i":tierId,"n":name,"t":[{"i":itemId,"c":label}, ...]}, ...]
 *   v1 (6daca2d, July 2024):  {"tiers":[...same tiers...],"title":title}
 *   v2 (a273ba8, July 2024 until now): like v1, but only custom items carry "c".
 * The title is left out when it is empty. Golden fixtures for all three formats live in
 * tests/fixtures/state/generated.json and tests/fixtures/shared-links.json.
 *
 * If a legacy link ever stops decoding, fix the code around this file, never this file.
 */
import LZString from 'lz-string';
import type {CanonicalItem, CanonicalState, CanonicalTier} from '../types';

interface LegacyItem {
  i: string; // id
  c?: string; // content (label)
}

interface LegacyTier {
  i: string; // id
  n: string; // name
  t: LegacyItem[]; // items
}

/**
 * Decodes a legacy (unprefixed) link value. Throws when the value is not a legacy link.
 * Spaces count as '+' (lz-string restores them), because URLSearchParams turns '+' into ' '.
 * Characters after the end of the compressed data are ignored, so a link that picked up
 * stray punctuation (a trailing '.' or ')') still decodes.
 */
export function decodeLegacyState(encodedState: string): CanonicalState {
  const jsonString = LZString.decompressFromEncodedURIComponent(encodedState);
  if (!jsonString) throw new Error('Failed to decompress state');

  const parsed = JSON.parse(jsonString);

  let title: string | undefined;
  let simplifiedTiers: LegacyTier[];

  if (Array.isArray(parsed)) {
    // Old format: array of tiers
    simplifiedTiers = parsed;
  } else if (typeof parsed === 'object' && Array.isArray(parsed.tiers)) {
    // New format: object with title and tiers
    title = parsed.title;
    simplifiedTiers = parsed.tiers;
  } else {
    throw new Error('Invalid state format');
  }

  const tiers: CanonicalTier[] = simplifiedTiers.map(simplifiedTier => ({
    id: simplifiedTier.i,
    name: simplifiedTier.n,
    items: simplifiedTier.t.map(item => toCanonicalItem(item)),
  }));

  if (Array.isArray(parsed)) {
    return {version: 0, tiers};
  }

  // v1 wrote a label for every item; v2 writes labels for custom items only. A list without
  // package items is the same in both formats and reports the older one.
  const everyItemHasLabel = tiers.every(tier => tier.items.every(item => 'content' in item));
  const state: CanonicalState = {version: everyItemHasLabel ? 1 : 2, tiers};
  if (title !== undefined) state.title = title;
  return state;
}

function toCanonicalItem(item: LegacyItem): CanonicalItem {
  const id = item.i;
  const content = item.c;
  return content === undefined ? {id} : {id, content};
}
