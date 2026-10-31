import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * The file-name rule of tests/README.md ("File names"):
 * - a unit test of one source file has that file's name and path: lib/images/deviceStore.ts is
 *   tested in tests/unit/lib/images/deviceStore.test.ts;
 * - every other file and folder under tests/ has a kebab-case name (README.md excepted).
 */
const repoRoot = path.resolve(__dirname, '../../..');

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js'];

/** The name before its first dot: deviceStore.test.ts is deviceStore, legacy-sets.api.spec.ts is legacy-sets. */
function stem(name: string): string {
  return name.split('.')[0];
}

/** Whether a path under tests/unit names a source file or folder at the same path in the repository. */
function mirrorsSource(relative: string, exists: (file: string) => boolean): boolean {
  if (!relative.startsWith('tests/unit/')) return false;
  const sourcePath = relative.slice('tests/unit/'.length).replace(/\.test\.ts$/, '');
  if (!relative.endsWith('.test.ts')) return exists(sourcePath);
  return SOURCE_EXTENSIONS.some((extension) => exists(sourcePath + extension)) || exists(path.posix.join(sourcePath, 'index.ts'));
}

/** The rule breaks for a list of paths under tests/, one line each. */
function fileNameBreaks(paths: readonly string[], exists: (file: string) => boolean): string[] {
  const breaks: string[] = [];
  for (const relative of paths) {
    const name = path.posix.basename(relative);
    if (name === 'README.md') continue;
    if (KEBAB.test(stem(name)) || mirrorsSource(relative, exists)) continue;
    breaks.push(`${relative}: "${stem(name)}" is neither kebab-case nor the name of the source file at the same path`);
  }
  return breaks;
}

/** Every file and folder under tests/, as repository paths. */
function pathsUnderTests(): string[] {
  return fs.readdirSync(path.join(repoRoot, 'tests'), {recursive: true, encoding: 'utf8'})
    .map((entry) => path.posix.join('tests', entry.split(path.sep).join('/')))
    .sort();
}

const existsInRepo = (file: string) => fs.existsSync(path.join(repoRoot, file));

describe('test file names', () => {
  it('returns a break when a helper, page object or test of no single source file is not kebab-case', () => {
    const exists = (file: string) => ['lib/images/deviceStore.ts', 'lib/snapshot/index.ts', 'lib'].includes(file);
    expect(fileNameBreaks([
      'tests/pages/TierListPage.ts',
      'tests/support/imageSites.ts',
      'tests/unit/lib/v3Format.test.ts',
      'tests/unit/lib/images/deviceStore.test.ts',
      'tests/unit/lib/snapshot.test.ts',
      'tests/unit/lib',
      'tests/e2e/drag-and-drop.spec.ts',
      'tests/e2e/legacy-sets.api.spec.ts',
      'tests/README.md',
    ], exists)).toEqual([
      'tests/pages/TierListPage.ts: "TierListPage" is neither kebab-case nor the name of the source file at the same path',
      'tests/support/imageSites.ts: "imageSites" is neither kebab-case nor the name of the source file at the same path',
      'tests/unit/lib/v3Format.test.ts: "v3Format" is neither kebab-case nor the name of the source file at the same path',
    ]);
  });

  it('returns no break when given every file and folder under tests/', () => {
    const paths = pathsUnderTests();
    expect(paths.length).toBeGreaterThan(100);
    expect(fileNameBreaks(paths, existsInRepo)).toEqual([]);
  });
});
