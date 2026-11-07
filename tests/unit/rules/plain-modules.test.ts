import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * lib/snapshot, lib/recent and lib/rankPath.ts are plain modules: no React, no Next, no Node
 * modules, and no browser globals at import time. They may import files in their own folder and
 * a few plain app modules: zod through lib/zod (A39), the link format (lib/state, which is
 * plain itself), the device id rule (A40), the /rank path rule and the image type and size
 * reader (lib/images/imageType.ts, also plain). (Browser APIs such as CompressionStream or localStorage are used inside functions,
 * at call time; lib/recent receives its storage from the caller.)
 */
const root = path.resolve(__dirname, '../../..');
const folders = ['lib/snapshot', 'lib/recent'];
const ALLOWED_APP_MODULES = new Set(['@/lib/zod', '@/lib/state', '@/lib/state/deviceId', '@/lib/rankPath', '@/lib/images/imageType']);

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

for (const folder of [...folders, 'lib/rankPath.ts']) {
  const isFile = folder.endsWith('.ts');
  // A single file may import no relative files at all: nothing starts with its own path.
  const dir = path.join(root, folder);
  const files = isFile ? [dir] : sourceFiles(dir);

  describe(`${folder} imports`, () => {
    it('returns at least 1 source file when the folder is listed', () => {
      expect(files.length).toBeGreaterThan(0);
    });

    it('returns no import from zod when each source file is read', () => {
      for (const file of files) expect(fs.readFileSync(file, 'utf8'), path.relative(root, file)).not.toMatch(/from\s*['"]zod['"]/);
    });

    for (const file of files) {
      const name = path.relative(root, file);
      const code = withoutComments(fs.readFileSync(file, 'utf8'));

      it(`returns only same-folder and allowed plain module imports when ${name} is parsed`, () => {
        const specifiers = Array.from(code.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]/g)).map(
          match => match[1] ?? match[2] ?? match[3],
        );
        for (const specifier of specifiers) {
          if (ALLOWED_APP_MODULES.has(specifier)) continue;
          expect(specifier, `${name} imports ${specifier}`).toMatch(/^\.\.?\//);
          expect(path.resolve(path.dirname(file), specifier).startsWith(dir), `${name} imports ${specifier}`).toBe(true);
        }
      });

      it(`returns no window, document, indexedDB or Node global when ${name} is parsed`, () => {
        expect(code).not.toMatch(/\b(window|document|indexedDB|navigator|process|Buffer|__dirname|require)\b/);
      });
    }
  });
}
