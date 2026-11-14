import {describe, expect, it} from 'vitest';
import {MACHINE_MODELS} from '../../models';
import {assertFullCoverage, IDLE_SUT, MAX_PART_STEPS, pathItems, walkItems, walkModel, walkParts, walkPaths} from '../../support/machines';

/**
 * The machines of tests/machines/, walked without a browser. Each walk, the one its Playwright
 * campaign runs in parts, is checked twice: by @xstate/test's own coverage (every state node,
 * transition and reachable state) and by the walk's own items (walkItems: every state entered,
 * every transition into every state it leads to and from every state below the node that
 * declares it, and every ignored event in each state that ignores it). A change to a machine
 * that its walk misses fails here first, in `npm run check`.
 */

describe.each(MACHINE_MODELS.map((model) => [model.id, model] as const))('machine %s', (_id, model) => {
  it('returns every state node, transition and reachable state when the model walks without a browser', async () => {
    const coverage = await walkModel(model, IDLE_SUT);
    expect(() => assertFullCoverage(model, coverage)).not.toThrow();
  });

  it('returns every item of the walk when the sequences of all its parts run on the machine', () => {
    const covered = new Set(walkParts(model).flatMap((part) => part.paths).flatMap((path) => pathItems(model, path)));
    expect(walkItems(model).filter((item) => !covered.has(item))).toEqual([]);
  });

  it('returns parts of at most MAX_PART_STEPS steps, with each sequence of the walk once, when the walk is split', () => {
    const parts = walkParts(model);
    for (const part of parts) {
      expect(part.paths.reduce((sum, path) => sum + path.length, 0)).toBeLessThanOrEqual(MAX_PART_STEPS);
    }
    expect(parts.flatMap((part) => part.paths)).toEqual(walkPaths(model));
  });
});
