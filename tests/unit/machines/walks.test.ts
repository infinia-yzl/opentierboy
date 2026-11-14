import {describe, expect, it} from 'vitest';
import {MACHINE_MODELS} from '../../models';
import {assertFullCoverage, IDLE_SUT, MAX_PART_STEPS, walkModel, walkParts, walkPaths} from '../../support/machines';

/**
 * The machines of tests/machines/, walked without a browser: each walk, the one its Playwright
 * campaign runs, reaches every state node, transition and reachable state, so a change to a
 * machine that its walk misses fails here first, in `npm run check`.
 */

describe.each(MACHINE_MODELS.map((model) => [model.id, model] as const))('machine %s', (_id, model) => {
  it('returns every state node, transition and reachable state when the model walks without a browser', async () => {
    const coverage = await walkModel(model, IDLE_SUT);
    expect(() => assertFullCoverage(model, coverage)).not.toThrow();
  });

  it('returns parts of at most MAX_PART_STEPS steps, with each sequence of the walk once, when the walk is split', () => {
    const parts = walkParts(model);
    for (const part of parts) {
      expect(part.paths.reduce((sum, path) => sum + path.length, 0)).toBeLessThanOrEqual(MAX_PART_STEPS);
    }
    expect(parts.flatMap((part) => part.paths)).toEqual(walkPaths(model));
  });
});
