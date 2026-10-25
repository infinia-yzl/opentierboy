import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * lib/dnd keeps dnd-kit in one file (dndKit.ts, re-exported by index.ts). The other files are
 * pure logic: they import only each other and app types from models/, and use no browser or
 * Node globals, so they run anywhere and test without a DOM. ESLint keeps dnd-kit out of
 * the rest of the app.
 */
const dndDir = path.resolve(__dirname, '../../../lib/dnd');
const BINDING_FILES = new Set(['dndKit.ts', 'index.ts']);

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function importsOf(code: string): string[] {
  return Array.from(code.matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]/g))
    .map(match => match[1] ?? match[2] ?? match[3]);
}

const files = fs.readdirSync(dndDir).filter(name => /\.(ts|tsx)$/.test(name));

describe('lib/dnd stays pure outside its dnd-kit binding', () => {
  it('has the binding and pure files', () => {
    expect(files).toContain('dndKit.ts');
    expect(files.length).toBeGreaterThan(BINDING_FILES.size);
  });

  for (const name of files.filter(file => !BINDING_FILES.has(file))) {
    const code = withoutComments(fs.readFileSync(path.join(dndDir, name), 'utf8'));

    it(`${name} imports only lib/dnd files and models`, () => {
      for (const specifier of importsOf(code)) {
        expect(specifier, `${name} imports ${specifier}`).toMatch(/^(\.\/[\w-]+|@\/models\/[\w-]+)$/);
      }
    });

    it(`${name} uses no browser or Node globals`, () => {
      expect(code).not.toMatch(/\b(window|document|navigator|localStorage|sessionStorage|indexedDB|performance|process|Buffer|__dirname|setTimeout|requestAnimationFrame)\b/);
    });
  }

  it('imports dnd-kit only in dndKit.ts', () => {
    for (const name of files) {
      const dndKit = importsOf(withoutComments(fs.readFileSync(path.join(dndDir, name), 'utf8'))).filter(specifier => specifier.startsWith('@dnd-kit/'));
      if (name === 'dndKit.ts') expect(dndKit.length).toBeGreaterThan(0);
      else expect(dndKit, name).toEqual([]);
    }
  });
});
