import type {ItemLike, TierLike} from './model';

/**
 * Names of rows and items as people see them. Announcements use these, never internal ids.
 */

export function tierLabel(tiers: readonly TierLike[], index: number): string {
  return index === tiers.length - 1 && !trimmed(tiers[index]?.name) ? 'Unranked' : rowLabel(tiers[index]?.name, index);
}

export function tierPhrase(tiers: readonly TierLike[], index: number): string {
  return index === tiers.length - 1 && !trimmed(tiers[index]?.name) ? 'Unranked' : rowPhrase(tiers[index]?.name, index);
}

export function rowLabel(name: unknown, index: number): string {
  return trimmed(name) || `Row ${index + 1}`;
}

export function rowPhrase(name: unknown, index: number): string {
  const label = rowLabel(name, index);
  return !trimmed(name) || /^(row|tier)\b/i.test(label) ? label : `row ${label}`;
}

export function rowGripName(name: unknown, index: number): string {
  return `Move ${rowPhrase(name, index)}`;
}

export function rowStackName(name: unknown, index: number, count: number): string {
  const phrase = rowPhrase(name, index);
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
