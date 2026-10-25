import path from 'node:path';
import {ESLint} from 'eslint';
import {beforeAll, describe, expect, it} from 'vitest';

/**
 * The import rules in eslint.config.mjs (amendments A12 and A31). Each case lints a small
 * piece of code as if it lived at the given path, and lists the import lines ESLint blocks.
 */
const repoRoot = path.resolve(__dirname, '../../..');
let eslint: ESLint;

beforeAll(async () => {
  eslint = new ESLint({cwd: repoRoot});
  // Load the config and plugins once, outside the test timeouts.
  await eslint.calculateConfigForFile(path.join(repoRoot, 'lib/state/index.ts'));
}, 90_000);

/** The lines (each once) where ESLint reports one of `rules` for this code at this path. */
async function reportedLines(filePath: string, code: string, rules: string[]): Promise<number[]> {
  const [result] = await eslint.lintText(code, {filePath: path.join(repoRoot, filePath)});
  const lines = result.messages.filter(message => message.ruleId !== null && rules.includes(message.ruleId)).map(message => message.line);
  return [...new Set(lines)];
}

async function blockedLines(filePath: string, imports: string[]): Promise<number[]> {
  const code = imports.map((source, index) => `import x${index} from '${source}';`).join('\n') + '\n';
  const [result] = await eslint.lintText(code, {filePath: path.join(repoRoot, filePath)});
  return result.messages.filter(message => message.ruleId === 'no-restricted-imports').map(message => message.line);
}

// Loading the ESLint config with the Next.js plugins takes a few seconds, more on a busy machine.
describe('ESLint import rules', {timeout: 90_000}, () => {
  it('keep lib/state free of outside code, at every folder depth', async () => {
    expect(await blockedLines('lib/state/probe.ts', [
      './decode', './decoders/legacy', 'lz-string', // allowed
      '../utils', '../../models/Tier', './decoders/../decode', './../TierCortex',
      'react', 'next/server', '@/lib/utils', 'node:crypto', 'os', 'fs/promises', 'idb',
    ])).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(await blockedLines('lib/state/decoders/probe.ts', [
      './legacy', '../encode', '../types', // allowed
      '../../utils', '../../../package.json', './../decode', '../decoders/../encode',
    ])).toEqual([4, 5, 6, 7]);
    expect(await blockedLines('lib/state/a/b/probe.ts', ['../../encode', '../../../utils'])).toEqual([2]);
  });

  it('allow IndexedDB libraries only in the device image store and its tests', async () => {
    const libraries = ['dexie', 'idb', 'idb/with-async-ittr', 'idb-keyval', 'localforage', 'fake-indexeddb', 'fake-indexeddb/auto'];
    expect(await blockedLines('components/Probe.tsx', [...libraries, 'idbx', '@/lib/images/deviceStore'])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(await blockedLines('lib/images/linkImage.ts', libraries)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(await blockedLines('tests/unit/images/other.test.ts', libraries)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(await blockedLines('lib/images/deviceStore.ts', libraries)).toEqual([]);
    expect(await blockedLines('tests/unit/images/deviceStore.test.ts', libraries)).toEqual([]);
  });

  it('allow the indexedDB global only in the device image store and its tests', async () => {
    const code = 'export const a = indexedDB;\nexport const b = globalThis.indexedDB;\nexport const c = window.indexedDB;\nexport const d = self.indexedDB;\n';
    const rules = ['no-restricted-globals', 'no-restricted-properties'];
    expect(await reportedLines('components/Probe.tsx', code, rules)).toEqual([1, 2, 3, 4]);
    expect(await reportedLines('lib/state/probe.ts', code, rules)).toEqual([1, 2, 3, 4]);
    expect(await reportedLines('app/api/og/probe.ts', code, rules)).toEqual([1, 2, 3, 4]);
    expect(await reportedLines('lib/zod.ts', code, rules)).toEqual([1, 2, 3, 4]);
    expect(await reportedLines('lib/images/deviceStore.ts', code, rules)).toEqual([]);
    expect(await reportedLines('tests/unit/images/deviceStore.test.ts', code, rules)).toEqual([]);
  });

  it('allow importing zod only in lib/zod.ts and the eval-probe test', async () => {
    const imports = ['zod', '@/lib/zod', '@hookform/resolvers/zod', 'zod/v4'];
    expect(await blockedLines('components/ItemCreator.tsx', imports)).toEqual([1, 4]);
    expect(await blockedLines('lib/snapshot/payload.ts', imports)).toEqual([1, 4]);
    expect(await blockedLines('lib/images/deviceStore.ts', imports)).toEqual([1, 4]);
    expect(await blockedLines('app/api/og/route.tsx', imports)).toEqual([1, 4]);
    expect(await blockedLines('lib/zod.ts', imports)).toEqual([]);
    expect(await blockedLines('tests/unit/zod-eval-probe.test.ts', imports)).toEqual([]);
  });

  it('refuse zod loaded with import(), require() and the like outside lib/zod.ts and the eval-probe test', async () => {
    const code = [
      "export const a = await import('zod');",
      "export const b = await import('zod/v4');",
      "export const c = require('zod');",
      "export const d = require('zod/mini');",
      'export const e = await import(`zod`);',
      'export const f = require(`zod/v4`);',
      "export const g = module.require('zod');",
      "export const h = createRequire(import.meta.url)('zod');",
      'export const i = createRequire(import.meta.url)(`zod`);',
      "export const j = await vi.importActual('zod');",
      // Allowed:
      "export const k = await import('@/lib/zod');",
      "export const l = await import('zodiac');",
      "export const m = require('lz-string');",
      'export const n = await import(`zod${suffix}`);',
      "export const o = await vi.importActual('lz-string');",
    ].join('\n') + '\n';
    const rules = ['no-restricted-syntax'];
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const file of ['components/Probe.tsx', 'lib/snapshot/payload.ts', 'lib/state/probe.ts', 'lib/images/deviceStore.ts', 'app/api/og/probe.ts', 'tests/e2e/probe.spec.ts', 'tests/unit/probe.test.ts', 'tests/support/probe.ts', 'scripts/probe.mjs']) {
      expect(await reportedLines(file, code, rules), file).toEqual(all);
    }
    expect(await reportedLines('lib/zod.ts', code, rules)).toEqual([]);
    expect(await reportedLines('tests/unit/zod-eval-probe.test.ts', code, rules)).toEqual([]);
  });

  it('refuse ways around the external-request guard in tests, except in tests/support', async () => {
    // In a function, so that every kind of script file parses it (CommonJS has no top-level await).
    const code = [
      'export async function probe(route, r, handler, browser, playwright, chromium, ctx, request, url) {',
      'await route.continue();',
      "await route['continue']();",
      'await route.fetch();',
      'await r.fetch();',
      "await handler['fetch']();",
      'const context = await browser.newContext();',
      "const other = await browser['newContext']();",
      'const api = await playwright.request.newContext();',
      "const profile = await playwright.chromium.launchPersistentContext('dir');",
      'const launched = await chromium.launch();',
      "const remote = await chromium.connectOverCDP('http://127.0.0.1:9222');",
      'const page = await browser.newPage();',
      "const page2 = await browser['newPage']();",
      'const page3 = await ctx.browser().newPage();',
      'const page4 = await ctx.browser()?.newPage();',
      // Allowed:
      'await route.fallback();',
      "await route.fulfill({body: ''});",
      'await request.fetch(url);',
      'await ctx.request.fetch(url);',
      'await ctx.pages()[0].request.fetch(url);',
      'await window.fetch(url);',
      'await self.fetch(url);',
      'const tab = await ctx.newPage();',
      'await fetch(url);',
      '}',
    ].join('\n') + '\n';
    const rules = ['no-restricted-syntax'];
    const all = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    for (const file of ['tests/e2e/probe.spec.ts', 'tests/e2e/probe.spec.js', 'tests/e2e/probe.spec.mjs', 'tests/e2e/probe.spec.mts', 'tests/e2e/probe.spec.tsx', 'tests/pages/Probe.ts']) {
      expect(await reportedLines(file, code, rules), file).toEqual(all);
    }
    // TypeScript only: the non-null form of page.context().browser().
    expect(await reportedLines('tests/e2e/probe.spec.ts', 'export const p = async (page) => page.context().browser()!.newPage();\n', rules)).toEqual([1]);
    const commonJs = 'module.exports = async (route, browser) => {\n  await route.continue();\n  await browser.newContext();\n};\n';
    expect(await reportedLines('tests/e2e/probe.spec.cjs', commonJs, rules)).toEqual([2, 3]);
    expect(await reportedLines('tests/support/probe.ts', code, rules)).toEqual([]);
    expect(await reportedLines('tests/support/probe.mjs', code, rules)).toEqual([]);
    expect(await reportedLines('tests/support/probe.cjs', commonJs, rules)).toEqual([]);
  });

  it('keep zod out of lib/recent, lib/state and tests, and keep the other shared rule for each exception', async () => {
    const imports = ['zod', 'zod/mini', '@/lib/zod', 'zodiac'];
    expect(await blockedLines('lib/recent/recentLinks.ts', imports)).toEqual([1, 2]);
    expect(await blockedLines('lib/state/probe.ts', ['zod'])).toEqual([1]);
    expect(await blockedLines('tests/unit/probe.test.ts', ['zod'])).toEqual([1]);
    expect(await blockedLines('lib/zod.ts', ['idb'])).toEqual([1]);
    expect(await blockedLines('lib/images/deviceStore.ts', ['zod', 'idb'])).toEqual([1]);
  });

  it('keep Node built-ins and IndexedDB out of the OG route and TierCortex', async () => {
    const imports = ['os', 'crypto', 'fs', 'fs/promises', 'path', 'node:buffer', 'child_process', 'localforage', './crypto', './path-helpers', 'lz-string'];
    const blocked = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(await blockedLines('app/api/og/probe.ts', imports)).toEqual(blocked);
    expect(await blockedLines('app/api/og/route.tsx', imports)).toEqual(blocked);
    expect(await blockedLines('lib/TierCortex.ts', imports)).toEqual(blocked);
    for (const file of ['linkImage', 'trustedSites', 'imageType', 'listImages']) {
      expect(await blockedLines(`lib/images/${file}.ts`, imports), file).toEqual(blocked);
    }
    // Elsewhere Node modules stay allowed, for example in scripts and tests.
    expect(await blockedLines('tests/unit/probe.test.ts', ['os', 'node:fs', 'path'])).toEqual([]);
  });
});
