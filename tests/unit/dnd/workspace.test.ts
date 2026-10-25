import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * The dnd-kit fork in packages/dnd-kit reaches the app through npm workspaces
 * (docs/dnd-fork.md). npm installs a second copy from the registry as soon as one fork
 * version stops matching a range inside dnd-kit (for example a prerelease suffix, or a
 * Dependabot bump). Two copies of @dnd-kit/state or @preact/signals-core break drag and
 * drop at runtime, so these tests guard the wiring.
 */
const repoRoot = path.resolve(__dirname, '../../..');
const forkDir = path.join(repoRoot, 'packages/dnd-kit');
const FORK_PACKAGES = ['abstract', 'collision', 'dom', 'geometry', 'helpers', 'react', 'state'];

interface Manifest {
  name: string;
  version: string;
  private?: boolean;
  main?: string;
  module?: string;
  types?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[];
}

interface Lockfile {
  packages: Record<string, {version?: string; resolved?: string; link?: boolean}>;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

const rootManifest = readJson<Manifest>(path.join(repoRoot, 'package.json'));
const lockfile = readJson<Lockfile>(path.join(repoRoot, 'package-lock.json'));
const forkManifests = new Map(FORK_PACKAGES.map(name => [name, readJson<Manifest>(path.join(forkDir, name, 'package.json'))]));

/** Whether `version` (x.y.z) satisfies `range`: an exact version or a caret range ^x.y.z. */
function satisfies(version: string, range: string): boolean {
  const parse = (value: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
    if (!match) throw new Error(`Unsupported version "${value}"`);
    return match.slice(1).map(Number) as [number, number, number];
  };
  if (!range.startsWith('^')) return parse(range).join('.') === parse(version).join('.');
  const [major, minor, patch] = parse(range.slice(1));
  const [vMajor, vMinor, vPatch] = parse(version);
  const atLeast = vMajor !== major ? vMajor > major : vMinor !== minor ? vMinor > minor : vPatch >= patch;
  if (!atLeast) return false;
  if (major > 0) return vMajor === major;
  if (minor > 0) return vMajor === 0 && vMinor === minor;
  return vMajor === 0 && vMinor === 0 && vPatch === patch;
}

describe('satisfies (test helper)', () => {
  it('follows npm caret ranges', () => {
    expect(satisfies('0.5.1', '^0.5.1')).toBe(true);
    expect(satisfies('0.5.9', '^0.5.1')).toBe(true);
    expect(satisfies('0.5.0', '^0.5.1')).toBe(false);
    expect(satisfies('0.6.0', '^0.5.1')).toBe(false);
    expect(satisfies('1.14.4', '^1.10.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.10.0')).toBe(false);
    expect(satisfies('0.0.3', '^0.0.3')).toBe(true);
    expect(satisfies('0.0.4', '^0.0.3')).toBe(false);
    expect(satisfies('0.5.1', '0.5.1')).toBe(true);
    expect(() => satisfies('0.5.1-otb.1', '^0.5.1')).toThrow();
  });
});

describe('dnd-kit fork wiring', () => {
  it('lists every fork package as an npm workspace', () => {
    expect(rootManifest.workspaces).toEqual(FORK_PACKAGES.map(name => `packages/dnd-kit/${name}`));
    for (const [name, manifest] of forkManifests) expect(manifest.name).toBe(`@dnd-kit/${name}`);
  });

  it('gives every fork package a plain release version, never a prerelease', () => {
    for (const manifest of forkManifests.values()) {
      expect(manifest.version, manifest.name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('keeps every dnd-kit range inside the fork satisfied by the fork versions', () => {
    for (const manifest of forkManifests.values()) {
      for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
        const match = /^@dnd-kit\/(.+)$/.exec(dependency);
        if (!match) continue;
        const target = forkManifests.get(match[1]);
        expect(target, `${manifest.name} depends on ${dependency}, which is not in the fork`).toBeDefined();
        expect(satisfies(target!.version, range), `${manifest.name} needs ${dependency}@${range}, the fork has ${target!.version}`).toBe(true);
      }
    }
  });

  it('depends on the fork packages at their exact fork versions', () => {
    const direct = Object.entries(rootManifest.dependencies ?? {}).filter(([name]) => name.startsWith('@dnd-kit/'));
    expect(direct.length).toBeGreaterThan(0);
    for (const [name, range] of direct) {
      expect(range, name).toBe(forkManifests.get(name.slice('@dnd-kit/'.length))?.version);
    }
  });

  it('marks the fork packages private and leaves out their upstream dev dependencies', () => {
    for (const manifest of forkManifests.values()) {
      expect(manifest.private, manifest.name).toBe(true);
      expect(manifest.devDependencies, manifest.name).toBeUndefined();
    }
  });

  it('links each fork package from package-lock.json, with no registry copy anywhere', () => {
    const entries = Object.entries(lockfile.packages).filter(([key]) => /(^|\/)node_modules\/@dnd-kit\//.test(key));
    expect(entries.map(([key]) => key).sort()).toEqual(FORK_PACKAGES.map(name => `node_modules/@dnd-kit/${name}`));
    for (const [key, entry] of entries) {
      expect(entry, key).toEqual({resolved: `packages/dnd-kit/${key.slice('node_modules/@dnd-kit/'.length)}`, link: true});
    }
  });

  it('installs one copy of @preact/signals-core, and it satisfies @dnd-kit/state', () => {
    const copies = Object.entries(lockfile.packages).filter(([key]) => /(^|\/)node_modules\/@preact\/signals-core$/.test(key));
    expect(copies.map(([key]) => key)).toEqual(['node_modules/@preact/signals-core']);
    const range = forkManifests.get('state')!.dependencies!['@preact/signals-core'];
    expect(satisfies(copies[0][1].version!, range)).toBe(true);
  });

  it('has the built files that each package.json points at (run packages/dnd-kit/build.mjs)', () => {
    for (const [name, manifest] of forkManifests) {
      const targets: string[] = [manifest.main, manifest.module, manifest.types].filter((value): value is string => Boolean(value));
      const collect = (value: unknown) => {
        if (typeof value === 'string') targets.push(value);
        else if (value && typeof value === 'object') Object.values(value).forEach(collect);
      };
      collect(manifest.exports);
      for (const target of targets.filter(target => !target.includes('*'))) {
        expect(fs.existsSync(path.join(forkDir, name, target)), `@dnd-kit/${name}: ${target}`).toBe(true);
      }
    }
  });

  it('keeps the licence with the fork, and a notice that names the vendored release', () => {
    const notice = fs.readFileSync(path.join(forkDir, 'NOTICE'), 'utf8');
    expect(notice).toContain(`@dnd-kit/react@${forkManifests.get('react')!.version}`);
    expect(notice).toMatch(/Commit:\s+[0-9a-f]{40}/);
    for (const name of ['.', ...FORK_PACKAGES]) {
      expect(fs.readFileSync(path.join(forkDir, name, 'LICENSE'), 'utf8'), `${name}/LICENSE`).toMatch(/^MIT License/);
    }
  });
});
