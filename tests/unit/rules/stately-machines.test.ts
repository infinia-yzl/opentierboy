import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {getMachineSerializationDiagnostics} from 'xstate';
import {toDirectedGraph} from 'xstate/graph';
import {MACHINE_MODELS} from '../../models';

/**
 * Each file in tests/machines/ pastes into the Stately editor's Import Code as it is, and the
 * editor draws every arrow (tests/README.md, "Model-based tests"):
 * - the file holds only the machine: one import of createMachine, one exported machine;
 * - every transition is an object with a written-out target, never a function, as XState's
 *   agent guide asks when visual inspection matters (`analysis.transitionTargetsComplete`);
 * - the machine holds no code that a JSON export would leave out.
 */
const machinesDir = path.join(process.cwd(), 'tests/machines');
const files = fs.readdirSync(machinesDir).filter(name => name.endsWith('.ts')).sort();
const SHAPE = /^import \{createMachine\} from 'xstate';\n\nexport const (\w+Machine) = createMachine\(\{\n[\s\S]*\n\}\);\n$/;

describe.each(files)('tests/machines/%s', (file) => {
  const source = fs.readFileSync(path.join(machinesDir, file), 'utf8');
  const id = file.replace(/\.ts$/, '');
  const model = MACHINE_MODELS.find(candidate => candidate.id === id);

  it('returns one createMachine call and nothing else when the file is read', () => {
    expect(source).toMatch(SHAPE);
    expect(source.match(/\bexport\b/g)).toHaveLength(1);
    expect(source).not.toMatch(/=>|\bfunction\b|\/\/|\/\*|`/);
  });

  it('returns a model in tests/models when the file is read', () => {
    expect(model?.id).toBe(id);
  });

  it('returns a complete graph without diagnostics when XState analyses the machine', () => {
    const {analysis} = toDirectedGraph(model!.machine) as unknown as {analysis: {transitionTargetsComplete: boolean; diagnostics: unknown[]}};
    expect(analysis).toEqual({transitionTargetsComplete: true, diagnostics: []});
    expect(getMachineSerializationDiagnostics(model!.machine)).toEqual([]);
  });
});
