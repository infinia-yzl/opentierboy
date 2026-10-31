import {describe, expect, expectTypeOf, it} from 'vitest';
import {
  defaultTierId,
  type LabelPosition,
  ROW_TEMPLATE_TIER_IDS,
  ROW_TEMPLATE_TP,
  type RowTemplateId,
} from '@/lib/state';
import {knownRowTemplate, rowTemplateFromTp} from '@/lib/state/templates';
import {DEFAULT_TIER_TEMPLATE, type LabelPosition as ModelLabelPosition, tierTemplates} from '@/models/Tier';

/**
 * lib/state cannot import models/, so it keeps its own copy of the row templates' tier ids.
 * The v3 link format depends on them (a row may leave out its template id), so the copy must
 * match models/Tier.ts exactly.
 */
describe('row templates (v3 omission rule)', () => {
  it('match the tier ids of every template in models/Tier.ts, in order', () => {
    expect(Object.keys(ROW_TEMPLATE_TIER_IDS).sort()).toEqual(Object.keys(tierTemplates).sort());
    for (const [template, tiers] of Object.entries(tierTemplates)) {
      expect(ROW_TEMPLATE_TIER_IDS[template as RowTemplateId], template).toEqual(tiers.map(tier => tier.id));
    }
  });

  it('use the same label positions as models/Tier.ts, with "left" as the default', () => {
    // Checked by tsc (npm run check), which also type-checks the tests.
    expectTypeOf<LabelPosition>().toEqualTypeOf<ModelLabelPosition>();
    for (const tier of DEFAULT_TIER_TEMPLATE) expect(tier.labelPosition).toBe('left');
  });

  it('give each template its row count as tp', () => {
    expect(ROW_TEMPLATE_TP).toEqual({'3rows': 3, '5rows': 5, '7rows': 7});
    for (const [template, tp] of Object.entries(ROW_TEMPLATE_TP)) {
      expect(ROW_TEMPLATE_TIER_IDS[template as RowTemplateId].length - 1).toBe(tp);
      expect(rowTemplateFromTp(tp)).toBe(template);
    }
    for (const tp of [0, 1, 4, 6, 8, '5', 5.5, null, undefined, NaN, Infinity, true, [5], {}]) {
      expect(rowTemplateFromTp(tp), String(tp)).toBeUndefined();
    }
  });

  it('let a row leave out its id only at its own position in the current template', () => {
    for (const [template, tiers] of Object.entries(tierTemplates)) {
      tiers.forEach((tier, index) => expect(defaultTierId(template as RowTemplateId, index)).toBe(tier.id));
      expect(defaultTierId(template as RowTemplateId, tiers.length)).toBeUndefined();
      expect(defaultTierId(template as RowTemplateId, -1)).toBeUndefined();
      expect(defaultTierId(template as RowTemplateId, 0.5)).toBeUndefined();
    }
    // The same id sits at different positions in different templates.
    expect(defaultTierId('5rows', 0)).toBe('tier-s');
    expect(defaultTierId('7rows', 0)).toBe('tier-ss');
    expect(defaultTierId('7rows', 1)).toBe('tier-s');
    expect(defaultTierId('3rows', 3)).toBe('uncategorized');
    expect(defaultTierId('5rows', 3)).toBe('tier-c');
  });

  it('give a custom or unknown template no default ids', () => {
    for (let index = 0; index < 10; index++) expect(defaultTierId('custom', index)).toBeUndefined();
    expect(defaultTierId('4rows' as RowTemplateId, 0)).toBeUndefined();
    expect(defaultTierId('constructor' as RowTemplateId, 0)).toBeUndefined();
    expect(knownRowTemplate('__proto__')).toBeUndefined();
    expect(knownRowTemplate('5rows')).toBe('5rows');
  });
});
