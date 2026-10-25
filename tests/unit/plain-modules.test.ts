import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * lib/snapshot and lib/recent are plain modules: no React, no Next, no Node modules, and no
 * browser globals at import time. They may import zod and files in their own folder only.
 * (Browser APIs such as CompressionStream or localStorage are used inside functions, at
 * call time; lib/recent receives its storage from the caller.)
 */
const root = path.resolve(__dirname, '../..');
const folders = ['lib/snapshot', 'lib/recent'];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

for (const folder of folders) {
  const dir = path.join(root, folder);
  const files = sourceFiles(dir);

  describe(`${folder} stays plain`, () => {
    it('has source files', () => {
      expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
      const name = path.relative(root, file);
      const code = withoutComments(fs.readFileSync(file, 'utf8'));

      it(`${name} imports only zod and files of its folder`, () => {
        const specifiers = Array.from(code.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]/g)).map(
          match => match[1] ?? match[2] ?? match[3],
        );
        for (const specifier of specifiers) {
          if (specifier === '@/lib/zod') continue;
          expect(specifier, `${name} imports ${specifier}`).toMatch(/^\.\.?\//);
          expect(path.resolve(path.dirname(file), specifier).startsWith(dir), `${name} imports ${specifier}`).toBe(true);
        }
      });

      it(`${name} uses no window, document, IndexedDB or Node globals`, () => {
        expect(code).not.toMatch(/\b(window|document|indexedDB|navigator|process|Buffer|__dirname|require)\b/);
      });
    }
  });
}
