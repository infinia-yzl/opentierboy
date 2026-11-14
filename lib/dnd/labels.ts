import type {ItemLike, TierLike} from './model';

/**
 * Names of rows and items as people see them. Announcements use these, never internal ids.
 */

/**
 * The accessible name of a tier row, the same rule as the editor's row groups
 * (components/DragDropTierList.tsx): its label, or "Unranked" for the unnamed last row, or
 * "Row <n>" for another row without a label: its current position, which the editor shows as a
 * faint hint and never writes into the link (owner decision, 2026-11-14).
 */
export function tierLabel(tiers: readonly TierLike[], index: number): string {
  return index === tiers.length - 1 && !trimmed(tiers[index]?.name) ? 'Unranked' : rowLabel(tiers[index]?.name, index);
}

/**
 * A row as it reads inside a sentence: "row S", "Unranked", "Row 3". A label that already
 * starts with the word "row" or "tier" stays as it is: "Tier 10" (an older added row) reads
 * "Tier 10", not "row Tier 10".
 */
export function tierPhrase(tiers: readonly TierLike[], index: number): string {
  return index === tiers.length - 1 && !trimmed(tiers[index]?.name) ? 'Unranked' : rowPhrase(tiers[index]?.name, index);
}

/** The name of a ranked row at `index` (0-based): its label, or "Row <n>" without one. */
export function rowLabel(name: unknown, index: number): string {
  return trimmed(name) || `Row ${index + 1}`;
}

/** A ranked row inside a sentence: "row S", "Row 3", or a label that starts with "row" or "tier" as it is. */
export function rowPhrase(name: unknown, index: number): string {
  const label = rowLabel(name, index);
  return !trimmed(name) || /^(row|tier)\b/i.test(label) ? label : `row ${label}`;
}

/** The button name of a row's grip: "Move row S", "Move Row 3". */
export function rowGripName(name: unknown, index: number): string {
  return `Move ${rowPhrase(name, index)}`;
}

/**
 * The button name of a row's stack: "Move the 3 items of row S", "Move the 1 item of Row 3", or
 * "Row C has 0 items to move" for an empty row, whose stack is off. The name holds the count the
 * stack shows (WCAG 2.5.3, label in name).
 */
export function rowStackName(name: unknown, index: number, count: number): string {
  const phrase = rowPhrase(name, index);
  if (count === 0) return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} has 0 items to move`;
  return `Move the ${count} item${count === 1 ? '' : 's'} of ${phrase}`;
}

/** An item's name: its label, or "Unnamed item" when the label is empty. */
export function itemLabel(item: Pick<ItemLike, 'content'> | undefined): string {
  return trimmed(item?.content) || 'Unnamed item';
}

/** Labels come from shared links, so a value that is not a string counts as empty. */
function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
