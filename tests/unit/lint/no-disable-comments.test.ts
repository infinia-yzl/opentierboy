import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * ESLint rules hold only while nobody turns them off in the code. Outside tests (and the
 * vendored dnd-kit fork in packages/), an eslint-disable comment must name the rules it turns
 * off, and none may turn off no-restricted-syntax, which carries the class ban (A47) and the
 * zod rules (A39). The same goes for an inline config comment such as
 * `/* eslint no-restricted-syntax: off *\/`. A class that a third-party API requires goes in
 * ALLOWED_CLASS_FILES in eslint.config.mjs instead.
 */
const root = path.resolve(__dirname, '../../..');
const SKIPPED = new Set(['node_modules', '.next', '.git', '.vercel', '.idea', 'tests', 'packages', 'test-results', 'playwright-report', 'blob-report']);
const CODE = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/;

function codeFiles(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED.has(entry.name) || path.relative(root, full) === path.join('public', 'images')) return [];
      return codeFiles(full);
    }
    return CODE.test(entry.name) ? [full] : [];
  });
}

/** The comments that turn ESLint rules off without naming them, or that turn off no-restricted-syntax. */
function forbiddenDirectives(source: string): string[] {
  const found: string[] = [];
  for (const [comment] of source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g)) {
    const body = (comment.startsWith('//') ? comment.slice(2) : comment.slice(2, -2)).trim();
    const directive = /^eslint(-disable(?:-next-line|-line)?|-enable)?(?=\s|$)([\s\S]*)$/.exec(body);
    if (!directive || directive[1] === '-enable') continue;
    // Text after " -- " is a description, not a rule list.
    const rules = directive[2].split(/\s-{2,}(?:\s|$)/)[0].trim();
    const namesRule = /(?:^|[\s,])no-restricted-syntax(?:[\s,:]|$)/.test(rules);
    // `eslint-disable...` without rules turns every rule off; `eslint <rule>: off` is inline config.
    if (namesRule || (directive[1] !== undefined && rules === '')) found.push(comment);
  }
  return found;
}

describe('ESLint directive comments outside tests', () => {
  it('flags a bare eslint-disable and any comment that turns off no-restricted-syntax', () => {
    const flagged = [
      '// eslint-disable-next-line',
      '/* eslint-disable */',
      '// eslint-disable-line -- just this once',
      '/*\n  eslint-disable\n*/',
      '// eslint-disable-next-line no-restricted-syntax',
      '/* eslint-disable react-hooks/exhaustive-deps, no-restricted-syntax -- reason */',
      '// eslint-disable-line no-restricted-syntax',
      '/* eslint no-restricted-syntax: off */',
      '/* eslint no-restricted-syntax: 0, no-console: 1 */',
    ];
    for (const comment of flagged) expect(forbiddenDirectives(`const a = 1; ${comment}\n`), comment).toEqual([comment]);
  });

  it('allows a disable comment that names other rules, and comments that only mention eslint', () => {
    const allowed = [
      '// eslint-disable-next-line @next/next/no-img-element -- link images never go through the image optimizer (A8)',
      '/* eslint-disable react-hooks/exhaustive-deps */',
      '/* eslint-enable */',
      '/* eslint-env node */',
      '// the eslint-disable comments in this file name their rules',
      "const url = 'https://example.com/eslint-disable';",
      '/* eslint no-console: off */',
    ];
    for (const comment of allowed) expect(forbiddenDirectives(`${comment}\n`), comment).toEqual([]);
  });

  it('finds none in the code of the repository', () => {
    const files = codeFiles(root);
    const names = files.map(file => path.relative(root, file));
    // The scan reaches app code, scripts and the root config files.
    expect(names).toEqual(expect.arrayContaining(['eslint.config.mjs', 'components/ItemTile.tsx', 'lib/TierCortex.ts', 'scripts/prepareImages.js']));
    expect(names.some(name => name.startsWith('tests/'))).toBe(false);
    for (const file of files) {
      expect(forbiddenDirectives(fs.readFileSync(file, 'utf8')), path.relative(root, file)).toEqual([]);
    }
  });
});
