import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {MACHINE_MODELS} from '../../machines';
import {assertFullCoverage, machineDiagramMarkdown, walkModel, walkRevisits} from '../../support/machines';

/**
 * The machines of tests/machines/, checked without a browser:
 * - each one's diagram in docs/machines/<id>.md matches the machine (`npm run machines:diagrams`
 *   writes the files again after a change to a machine);
 * - each one's walk, the one its Playwright campaign runs, reaches every state node and
 *   transition, so a change to a machine that its walk misses fails here first.
 */
const docs = path.resolve(__dirname, '../../../docs/machines');
const idleSut = {create: () => ({send: () => {}})};

describe.each(MACHINE_MODELS.map((model) => [model.id, model] as const))('machine %s', (id, model) => {
  it('writes the Mermaid diagram of docs/machines when the machine is drawn', async () => {
    await expect(machineDiagramMarkdown(model)).toMatchFileSnapshot(path.join(docs, `${id}.md`));
  });

  it('returns every state node, transition and drawn state when the model walks without a browser', async () => {
    const coverage = await walkModel(model, idleSut);
    expect(() => assertFullCoverage(model, coverage)).not.toThrow();
    await walkRevisits(model, idleSut);
  });
});
