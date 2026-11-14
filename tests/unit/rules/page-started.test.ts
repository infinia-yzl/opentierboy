import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * <main> holds the page busy until the page's own content has started (lib/busy.ts, pageStart;
 * components/BusyMain.tsx). Each page says so with <PageStarted/> (components/StartHold.tsx),
 * so every page.tsx under app/ renders it.
 */
const appDir = path.resolve(__dirname, '../../../app');

function pageFiles(directory: string): string[] {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(full);
    return entry.name === 'page.tsx' ? [full] : [];
  });
}

const pages = pageFiles(appDir);

describe('PageStarted on every page', () => {
  it('returns at least the Home and editor pages when app/ is searched', () => {
    const names = pages.map((file) => path.relative(appDir, file));
    expect(names).toContain('page.tsx');
    expect(names).toContain(path.join('rank', '[[...slug]]', 'page.tsx'));
  });

  it.each(pages.map((file) => [path.relative(appDir, file), file] as const))('returns <PageStarted/> in %s when the page is read', (_name, file) => {
    const source = fs.readFileSync(file, 'utf8');
    expect(source).toMatch(/import \{[^}]*\bPageStarted\b[^}]*\} from ['"]@\/components\/StartHold['"]/);
    expect(source).toContain('<PageStarted/>');
  });
});
