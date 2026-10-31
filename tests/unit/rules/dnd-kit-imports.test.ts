import path from 'node:path';
import {ESLint} from 'eslint';
import {beforeAll, describe, expect, it} from 'vitest';

/**
 * The dnd-kit import rule in eslint.config.mjs (amendment A41): only lib/dnd and its tests may
 * import @dnd-kit/*. Each case lints a few import lines as if they lived at the given path.
 * The config also has to keep the rule in the blocks that set their own import patterns
 * (lib/state, the OG route and the code it imports) and in the files exempt from another shared
 * rule (IndexedDB, zod): ESLint keeps only the last matching block's setting, so every block
 * builds it with restrictImports().
 */
const repoRoot = path.resolve(__dirname, '../../..');
const DND_KIT_MESSAGE = /Only lib\/dnd may import dnd-kit/;
let eslint: ESLint;

beforeAll(async () => {
  eslint = new ESLint({cwd: repoRoot});
  // Load the config and plugins once, outside the test timeouts.
  await eslint.calculateConfigForFile(path.join(repoRoot, 'lib/dnd/index.ts'));
}, 90_000);

/** The no-restricted-imports messages for some import lines, as [line, message]. */
async function restrictedImports(filePath: string, imports: string[]): Promise<[number, string][]> {
  const code = imports.map((source, index) => `import x${index} from '${source}';`).join('\n') + '\n';
  const [result] = await eslint.lintText(code, {filePath: path.join(repoRoot, filePath)});
  return result.messages.filter(message => message.ruleId === 'no-restricted-imports').map(message => [message.line, message.message]);
}

/** The lines that the dnd-kit rule blocks. */
async function dndKitBlocked(filePath: string, imports: string[]): Promise<number[]> {
  return (await restrictedImports(filePath, imports)).filter(([, message]) => DND_KIT_MESSAGE.test(message)).map(([line]) => line);
}

/** The patterns of the no-restricted-imports setting that ESLint uses for a file. */
async function patternsFor(filePath: string): Promise<{group?: string[]; message?: string}[]> {
  const config = await eslint.calculateConfigForFile(path.join(repoRoot, filePath));
  const setting = config.rules?.['no-restricted-imports'];
  return Array.isArray(setting) ? (setting[1]?.patterns ?? []) : [];
}

const DND_KIT_IMPORTS = ['@dnd-kit/react', '@dnd-kit/react/sortable', '@dnd-kit/dom', '@dnd-kit/state', '@dnd-kit/helpers', 'react', '@/lib/dnd'];

// Loading the ESLint config with the Next.js plugins takes a few seconds, more on a busy machine.
describe('ESLint: dnd-kit only in lib/dnd', {timeout: 90_000}, () => {
  it('blocks dnd-kit in components, other lib code, scripts, configs and other tests', async () => {
    for (const file of ['components/Probe.tsx', 'lib/Probe.ts', 'app/rank/probe.tsx', 'scripts/probe.mjs', 'next.config.mjs', 'tests/e2e/history.spec.ts', 'tests/unit/probe.test.ts']) {
      expect(await dndKitBlocked(file, DND_KIT_IMPORTS), file).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('allows dnd-kit in lib/dnd and its unit tests, which keep the other shared rules', async () => {
    for (const file of ['lib/dnd/x.ts', 'lib/dnd/sub/x.ts', 'lib/dnd/react.tsx', 'tests/unit/lib/dnd/x.test.ts']) {
      expect(await restrictedImports(file, DND_KIT_IMPORTS), file).toEqual([]);
      const lines = (await restrictedImports(file, ['@dnd-kit/react', 'idb', 'zod', '@/lib/zod'])).map(([line]) => line);
      expect([...new Set(lines)], file).toEqual([2, 3]);
    }
  });

  it('keeps the dnd-kit rule in lib/state, next to its own rules', async () => {
    expect(await dndKitBlocked('lib/state/probe.ts', DND_KIT_IMPORTS)).toEqual([1, 2, 3, 4, 5]);
    const lines = (await restrictedImports('lib/state/decoders/probe.ts', ['@dnd-kit/state', 'react', 'fs', '@/lib/utils', 'lz-string']))
      .map(([line]) => line);
    expect([...new Set(lines)]).toEqual([1, 2, 3, 4]);
  });

  it('keeps the dnd-kit rule in the OG route, next to its own rules', async () => {
    for (const file of ['app/api/og/route.tsx', 'app/api/og/probe.ts']) {
      expect(await dndKitBlocked(file, DND_KIT_IMPORTS), file).toEqual([1, 2, 3, 4, 5]);
      const lines = (await restrictedImports(file, ['@dnd-kit/helpers', 'fs', 'node:path', 'lz-string'])).map(([line]) => line);
      expect([...new Set(lines)], file).toEqual([1, 2, 3]);
    }
  });

  it('carries the dnd-kit pattern in the setting of every file outside lib/dnd', async () => {
    const files = ['components/ItemTile.tsx', 'lib/TierCortex.ts', 'lib/packageItems.ts', 'lib/state/types.ts', 'lib/state/decoders/legacy.ts',
      'app/api/og/route.tsx', 'app/page.tsx', 'scripts/check-image-registry.mjs', 'tests/unit/lib/state/decode.test.ts',
      'lib/zod.ts', 'tests/unit/rules/zod-eval-probe.test.ts', 'lib/images/deviceStore.ts', 'tests/unit/lib/images/deviceStore.test.ts'];
    for (const file of files) {
      expect((await patternsFor(file)).some(pattern => pattern.group?.includes('@dnd-kit/*')), file).toBe(true);
    }
    for (const file of ['lib/dnd/dndKit.ts', 'tests/unit/lib/dnd/dndKit.test.ts']) {
      expect((await patternsFor(file)).some(pattern => pattern.group?.includes('@dnd-kit/*')), file).toBe(false);
    }
  });
});
