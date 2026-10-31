import type {RowTemplate, RowTemplateId} from './types';

/**
 * The tier ids of each row template, top to bottom, as models/Tier.ts defines them
 * (`tierTemplates`). lib/state cannot import models/, so it keeps this copy;
 * tests/unit/lib/state/templates.test.ts fails when the two differ.
 *
 * These lists are part of the v3 link format: a v3 row may leave out its tier id when the id
 * equals the template's id at that position. Never change or reorder an existing list.
 * A new template needs a new `tp` value (see docs/reference/link-format.md).
 */
export const ROW_TEMPLATE_TIER_IDS: Readonly<Record<RowTemplateId, readonly string[]>> = {
  '3rows': ['tier-s', 'tier-a', 'tier-b', 'uncategorized'],
  '5rows': ['tier-s', 'tier-a', 'tier-b', 'tier-c', 'tier-f', 'uncategorized'],
  '7rows': ['tier-ss', 'tier-s', 'tier-a', 'tier-b', 'tier-c', 'tier-d', 'tier-f', 'uncategorized'],
};

/** The `tp` value of each row template in a v3 link. 'custom' has none: `tp` is left out. */
export const ROW_TEMPLATE_TP: Readonly<Record<RowTemplateId, number>> = {
  '3rows': 3,
  '5rows': 5,
  '7rows': 7,
};

const ROW_TEMPLATE_IDS = Object.keys(ROW_TEMPLATE_TIER_IDS) as RowTemplateId[];

/** The template id when `template` is one of the three row templates, else undefined. */
export function knownRowTemplate(template: unknown): RowTemplateId | undefined {
  return ROW_TEMPLATE_IDS.find(id => id === template);
}

/** The row template for a `tp` value, or undefined when the value is not a known template. */
export function rowTemplateFromTp(tp: unknown): RowTemplateId | undefined {
  return ROW_TEMPLATE_IDS.find(id => ROW_TEMPLATE_TP[id] === tp);
}

/**
 * The omission rule of v3 links: the tier id a row may leave out at `index` (0 = top row)
 * under `template`, or undefined when the row must write its id.
 *
 * A row's id may be left out only when it equals the template's tier id at the row's
 * position. The 'custom' template has no ids, and neither has a position below the last row
 * of a template, so those rows always write their id.
 */
export function defaultTierId(template: RowTemplate, index: number): string | undefined {
  const known = knownRowTemplate(template);
  if (known === undefined) return undefined;
  const ids = ROW_TEMPLATE_TIER_IDS[known];
  return Number.isInteger(index) && index >= 0 && index < ids.length ? ids[index] : undefined;
}
