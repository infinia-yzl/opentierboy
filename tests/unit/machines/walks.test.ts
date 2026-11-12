import {describe, expect, it} from 'vitest';
import {MACHINE_MODELS} from '../../models';
import {assertFullCoverage, walkModel} from '../../support/machines';

/**
 * The machines of tests/machines/, walked without a browser: each walk, the one its Playwright
 * campaign runs, reaches every state node, transition and reachable state, so a change to a
 * machine that its walk misses fails here first, in `npm run check`.
 */
const idleSut = {create: () => ({send: () => {}})};

describe.each(MACHINE_MODELS.map((model) => [model.id, model] as const))('machine %s', (_id, model) => {
  it('returns every state node, transition and reachable state when the model walks without a browser', async () => {
    const coverage = await walkModel(model, idleSut);
    expect(() => assertFullCoverage(model, coverage)).not.toThrow();
  });
});
