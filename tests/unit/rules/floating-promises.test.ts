import path from 'node:path';
import {ESLint} from 'eslint';
import {beforeAll, describe, expect, it} from 'vitest';

/**
 * @typescript-eslint/no-floating-promises in eslint.config.mjs (Playwright best practices: "Lint
 * your tests"). A Playwright action or assertion without `await` runs on after the test moves
 * on, so the test checks nothing or fails at random. The rule needs type information, so the
 * test files are linted with the TypeScript project.
 */
const repoRoot = path.resolve(__dirname, '../../..');
let eslint: ESLint;

beforeAll(async () => {
  eslint = new ESLint({cwd: repoRoot});
  await eslint.calculateConfigForFile(path.join(repoRoot, 'tests/e2e/history.spec.ts'));
}, 90_000);

/** The lines that no-floating-promises reports when the code lives at an existing test file's path. */
async function floatingLines(filePath: string, code: string): Promise<number[]> {
  const [result] = await eslint.lintText(code, {filePath: path.join(repoRoot, filePath)});
  return result.messages.filter((message) => message.ruleId === '@typescript-eslint/no-floating-promises').map((message) => message.line);
}

const PROBE = [
  "import {expect, test} from '../support/test';",
  "test('probe', async ({page}) => {",
  "  expect(page).toHaveURL('/');",
  "  page.goto('/');",
  "  await expect(page).toHaveURL('/');",
  "  await page.goto('/');",
  '});',
].join('\n');

describe('ESLint @typescript-eslint/no-floating-promises', {timeout: 90_000}, () => {
  it('returns an error for each Playwright call without await when the file is an end-to-end test', async () => {
    expect(await floatingLines('tests/e2e/history.spec.ts', PROBE)).toEqual([3, 4]);
  });
});
