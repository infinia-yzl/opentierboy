import type {CanonicalItem, CanonicalState, CanonicalTier} from '@/lib/state';

/**
 * Limits and type checks for links in the legacy formats (v0, v1, v2) (A29).
 *
 * The frozen legacy decoder (lib/state/decoders/legacy.ts) accepts any JSON that has the
 * right outline, so a hand-made link can hold an object where a name belongs, no tiers at all,
 * or a name of millions of characters. Such data crashed the editor ("Application error"),
 * aborted /api/og or blocked the server. TierCortex checks every legacy link with these rules
 * after decoding, and treats a link that breaks one like a link that does not decode: the page
 * falls back to the template and the preview to the default image. The decoder itself stays
 * frozen.
 *
 * The limits are generous. The largest golden link (430 items in 8 rows, tests/fixtures) has
 * 26,246 characters of JSON, 8 rows, a 53-character title, 33-character tier names,
 * 31-character labels and 51-character ids. Lengths count UTF-16 code units (`string.length`).
 * Raising a limit is safe. Lowering one can break links people already shared, so never lower
 * a limit. The v3 format (Phase 5b) has its own limits in lib/state.
 */
export const LEGACY_LINK_LIMITS = Object.freeze({
  /** Characters of JSON after decompression. Checked before decompressing (lib/state/lz.ts). */
  maxJsonLength: 1_000_000,
  /** Rows, including the Unranked row. A list needs at least one row. */
  maxTiers: 100,
  /** Items in all rows together. */
  maxItems: 5_000,
  /** The list title. */
  maxTitleLength: 1_000,
  /** A tier name (the label of a row). */
  maxTierNameLength: 500,
  /** An item label (`c`). */
  maxLabelLength: 500,
  /** A tier id or an item id. */
  maxIdLength: 500,
});

export type LegacyLinkLimits = typeof LEGACY_LINK_LIMITS;

export type LegacyStateCheck = {ok: true; state: CanonicalState} | {ok: false; reason: string};

/**
 * Checks a list decoded from a legacy link. Returns the list, or the reason it breaks a rule.
 *
 * Strings must be strings: tier ids and names, item ids, and the title and item labels when
 * present. A title or label of `null` counts as absent, as it always did (the app shows the
 * page title, or the item's own label). It is left out of the returned list.
 */
export function checkLegacyState(state: CanonicalState, limits: LegacyLinkLimits = LEGACY_LINK_LIMITS): LegacyStateCheck {
  // The decoder passes JSON values through without checking them, so treat them as unknown.
  const raw = state as unknown as {version: unknown; title?: unknown; tiers: unknown};
  const fail = (reason: string): LegacyStateCheck => ({ok: false, reason});

  if (!Array.isArray(raw.tiers)) return fail('the tiers are not a list');
  if (raw.tiers.length === 0) return fail('the list has no tiers');
  if (raw.tiers.length > limits.maxTiers) return fail(`more than ${limits.maxTiers} tiers`);

  let title: string | undefined;
  if (typeof raw.title === 'string') {
    if (raw.title.length > limits.maxTitleLength) return fail(`a title longer than ${limits.maxTitleLength} characters`);
    title = raw.title;
  } else if (raw.title !== undefined && raw.title !== null) {
    return fail('a title that is not text');
  }

  let itemCount = 0;
  const tiers: CanonicalTier[] = [];
  for (const tier of raw.tiers as unknown[]) {
    const {id, name, items} = tier as {id: unknown; name: unknown; items: unknown};
    if (!isText(id, limits.maxIdLength)) return fail('a tier id that is not text, or too long');
    if (!isText(name, limits.maxTierNameLength)) return fail('a tier name that is not text, or too long');
    if (!Array.isArray(items)) return fail('tier items that are not a list');
    itemCount += items.length;
    if (itemCount > limits.maxItems) return fail(`more than ${limits.maxItems} items`);

    const checkedItems: CanonicalItem[] = [];
    for (const item of items as unknown[]) {
      const {id: itemId, content} = item as {id: unknown; content?: unknown};
      if (!isText(itemId, limits.maxIdLength)) return fail('an item id that is not text, or too long');
      if (content === undefined || content === null) {
        checkedItems.push({id: itemId});
      } else if (isText(content, limits.maxLabelLength)) {
        checkedItems.push({id: itemId, content});
      } else {
        return fail('an item label that is not text, or too long');
      }
    }
    tiers.push({id, name, items: checkedItems});
  }

  const checked: CanonicalState = {version: state.version, tiers};
  if (title !== undefined) checked.title = title;
  return {ok: true, state: checked};
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}
