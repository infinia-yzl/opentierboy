import path from 'node:path';
import {ESLint} from 'eslint';
import {beforeAll, describe, expect, it} from 'vitest';

/**
 * @typescript-eslint/no-floating-promises in eslint.config.mjs (Playwright best practices: "Lint
 * your tests"). A Playwright action or assertion without `await` runs on after the test moves
 * on, so the test checks nothing or fails at random. The rule needs type information, so the
 * test files are linted with the TypeScript project. @typescript-eslint/no-misused-promises
 * also reports an async callback where nothing awaits it, such as forEach(async …).
 */
const repoRoot = path.resolve(__dirname, '../../..');
let eslint: ESLint;

beforeAll(async () => {
  eslint = new ESLint({cwd: repoRoot});
  await eslint.calculateConfigForFile(path.join(repoRoot, 'tests/e2e/history.spec.ts'));
}, 90_000);

/** The lines that a rule reports when the code lives at an existing test file's path. */
async function reportedLines(filePath: string, code: string, rule = '@typescript-eslint/no-floating-promises'): Promise<number[]> {
  const [result] = await eslint.lintText(code, {filePath: path.join(repoRoot, filePath)});
  return result.messages.filter((message) => message.ruleId === rule).map((message) => message.line);
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

const PAGE_OBJECT_PROBE = [
  "import {expect, type Page} from '@playwright/test';",
  'export async function probe(page: Page) {',
  "  page.goto('/');",
  "  expect(page).toHaveURL('/');",
  "  await page.goto('/');",
  "  ['/a', '/b'].forEach(async (url) => {",
  '    await page.goto(url);',
  '  });',
  '}',
].join('\n');

describe('ESLint @typescript-eslint/no-floating-promises', {timeout: 90_000}, () => {
  it('returns an error for each Playwright call without await when the file is an end-to-end test', async () => {
    expect(await reportedLines('tests/e2e/history.spec.ts', PROBE)).toEqual([3, 4]);
  });

  it('returns an error for each Playwright call without await when the file is a page object or a support file', async () => {
    expect(await reportedLines('tests/pages/site-page.ts', PAGE_OBJECT_PROBE)).toEqual([3, 4]);
    expect(await reportedLines('tests/support/links.ts', PAGE_OBJECT_PROBE)).toEqual([3, 4]);
  });
});

describe('ESLint @typescript-eslint/no-misused-promises', {timeout: 90_000}, () => {
  it('returns an error when an async callback goes to forEach in a page object', async () => {
    expect(await reportedLines('tests/pages/site-page.ts', PAGE_OBJECT_PROBE, '@typescript-eslint/no-misused-promises')).toEqual([6]);
  });
});
