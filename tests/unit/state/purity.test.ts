import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * lib/state runs in the browser, on the server and in the edge runtime (the OG preview
 * route), so it may depend on lz-string and its own files only: no React, no browser
 * globals, no Node modules.
 */
const stateDir = path.resolve(__dirname, '../../../lib/state');

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

const files = sourceFiles(stateDir);

describe('lib/state stays pure', () => {
  it('has source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const name = path.relative(stateDir, file);
    const code = withoutComments(fs.readFileSync(file, 'utf8'));

    it(`${name} imports only lz-string and lib/state files`, () => {
      const specifiers = Array.from(code.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]/g))
        .map(match => match[1] ?? match[2] ?? match[3]);
      for (const specifier of specifiers) {
        if (specifier === 'lz-string') continue;
        expect(specifier, `${name} imports ${specifier}`).toMatch(/^\.\.?\//);
        expect(path.resolve(path.dirname(file), specifier).startsWith(stateDir), `${name} imports ${specifier}`).toBe(true);
      }
    });

    it(`${name} uses no browser or Node globals`, () => {
      expect(code).not.toMatch(/\b(window|document|localStorage|sessionStorage|indexedDB|navigator|process|Buffer|__dirname)\b/);
    });
  }
});
