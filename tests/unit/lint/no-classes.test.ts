import path from 'node:path';
import {ESLint} from 'eslint';
import {beforeAll, describe, expect, it} from 'vitest';
import {ALLOWED_CLASS_FILES, ROOT_CONFIG_FILES} from '../../../eslint.config.mjs';

/**
 * The no-classes rule in eslint.config.mjs (amendment A47): no code file declares a class,
 * apart from tests, the vendored dnd-kit fork (packages/), the config files at the root
 * (ROOT_CONFIG_FILES) and the files in ALLOWED_CLASS_FILES. Each case lints a small piece of
 * code as if it lived at the given path, and lists the lines ESLint reports.
 */
const repoRoot = path.resolve(__dirname, '../../..');
let eslint: ESLint;

beforeAll(async () => {
  eslint = new ESLint({cwd: repoRoot});
  // Load the config and plugins once, outside the test timeouts.
  await eslint.calculateConfigForFile(path.join(repoRoot, 'lib/utils.ts'));
}, 90_000);

/** The lines (each once) where no-restricted-syntax reports this code at this path, with the messages. */
async function reported(filePath: string, code: string): Promise<{lines: number[]; messages: string[]}> {
  const [result] = await eslint.lintText(code, {filePath: path.join(repoRoot, filePath)});
  const found = result.messages.filter(message => message.ruleId === 'no-restricted-syntax');
  return {lines: [...new Set(found.map(message => message.line))], messages: [...new Set(found.map(message => message.message))]};
}

const CLASSES = [
  'class Named {}',
  'export const Expression = class {};',
  'export default class {}',
  'export const plain = () => new Map();',
  'export class Failure extends Error {}',
  'export const factory = () => Object.freeze({count: () => 1});',
].join('\n') + '\n';
const CLASS_LINES = [1, 2, 3, 5];
/** The same in CommonJS, for .cjs files (no export statements there). */
const COMMONJS_CLASSES = [
  'class Named {}',
  'module.exports.Expression = class {};',
  'module.exports.Default = class {};',
  'module.exports.plain = () => new Map();',
  'module.exports.Failure = class Failure extends Error {};',
  'module.exports.factory = () => Object.freeze({count: () => 1});',
].join('\n') + '\n';
const codeFor = (file: string) => (file.endsWith('.cjs') ? COMMONJS_CLASSES : CLASSES);

const OWN_FILES = [
  'app/probe.tsx', 'app/api/og/probe.ts', 'components/Probe.tsx', 'contexts/Probe.tsx', 'lib/probe.ts',
  'lib/state/probe.ts', 'lib/images/deviceStore.ts', 'lib/zod.ts', 'lib/dnd/probe.ts', 'models/Probe.ts',
  'scripts/probe.mjs', 'scripts/probe.js', 'scripts/lib/probe.mjs',
  // A new file at the root, a new folder, and other code folders: covered as well.
  'proxy.ts', 'middleware.ts', 'probe.cjs', 'scripts/probe.cjs', 'probe.mts', 'probe.cts', 'probe.jsx', 'hooks/useProbe.tsx', 'types/probe.ts',
  'public/sw.js', 'articles/probe.mjs',
];

// Loading the ESLint config with the Next.js plugins takes a few seconds, more on a busy machine.
describe('ESLint rule: no classes in our own code (A47)', {timeout: 90_000}, () => {
  it('reports class declarations and class expressions in every code file outside tests, packages and the root configs', async () => {
    for (const file of OWN_FILES) {
      const {lines, messages} = await reported(file, codeFor(file));
      expect(lines, file).toEqual(CLASS_LINES);
      expect(messages, file).toEqual([expect.stringMatching(/no classes \(A47, "Code conventions" in CLAUDE\.md\).*ALLOWED_CLASS_FILES/)]);
    }
  });

  it('allows classes in tests, in the vendored dnd-kit fork and in the named config files at the root', async () => {
    const quiet = ['tests/unit/probe.test.ts', 'tests/e2e/probe.spec.ts', 'tests/pages/Probe.ts', 'tests/support/probe.ts', 'packages/dnd-kit/src/probe.ts', ...ROOT_CONFIG_FILES];
    for (const file of quiet) {
      expect((await reported(file, CLASSES)).lines, file).toEqual([]);
    }
    // The exempt config files are named one by one, at the root only.
    expect(ROOT_CONFIG_FILES).toEqual(expect.arrayContaining(['eslint.config.mjs', 'next.config.ts', 'playwright.config.ts', 'vitest.config.mts']));
    for (const file of ROOT_CONFIG_FILES) expect(file, file).toMatch(/^[\w.-]+$/);
    expect((await reported('lib/next.config.ts', CLASSES)).lines).toEqual(CLASS_LINES);
  });

  it('keeps the zod rule next to it, and lib/zod.ts keeps its zod exemption', async () => {
    const code = "class Named {}\nexport const z = await import('zod');\n";
    expect((await reported('lib/probe.ts', code)).lines).toEqual([1, 2]);
    expect((await reported('scripts/probe.mjs', code)).lines).toEqual([1, 2]);
    expect((await reported('lib/zod.ts', code)).lines).toEqual([1]);
    expect((await reported('tests/unit/probe.test.ts', code)).lines).toEqual([2]);
  });

  it('allows a class only in the files listed in ALLOWED_CLASS_FILES, which keep the other rules', async () => {
    const code = "class Required {}\nexport const z = await import('zod');\n";
    for (const file of ALLOWED_CLASS_FILES) {
      expect(file, file).not.toMatch(/^(tests|packages)\//);
      expect((await reported(file, code)).lines, file).toEqual([2]);
    }
  });
});
