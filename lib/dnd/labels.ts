import type {ItemLike, TierLike} from './model';

/**
 * Names of rows and items as people see them. Announcements use these, never internal ids.
 */

/**
 * The accessible name of a tier row, the same rule as the editor's row groups
 * (components/DragDropTierList.tsx): its label, or "Unranked" for the unnamed last row, or
 * "Tier <n>" for another row whose label was cleared.
 */
export function tierLabel(tiers: readonly TierLike[], index: number): string {
  const name = trimmed(tiers[index]?.name);
  if (name) return name;
  return index === tiers.length - 1 ? 'Unranked' : `Tier ${index + 1}`;
}

/**
 * A row as it reads inside a sentence: "tier S", "Unranked", "Tier 3". A label that already
 * starts with the word "tier" stays as it is: "Tier 10" reads "Tier 10".
 */
export function tierPhrase(tiers: readonly TierLike[], index: number): string {
  const label = tierLabel(tiers, index);
  const name = trimmed(tiers[index]?.name);
  if (!name || /^tier\b/i.test(name)) return label;
  return `tier ${label}`;
}

/** An item's name: its label, or "Unnamed item" when the label is empty. */
export function itemLabel(item: Pick<ItemLike, 'content'> | undefined): string {
  return trimmed(item?.content) || 'Unnamed item';
}

/** Labels come from shared links, so a value that is not a string counts as empty. */
function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
