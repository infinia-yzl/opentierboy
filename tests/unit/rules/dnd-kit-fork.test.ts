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

describe('satisfies', () => {
  it('returns true when the version is inside the caret or exact range', () => {
    expect(satisfies('0.5.1', '^0.5.1')).toBe(true);
    expect(satisfies('0.5.9', '^0.5.1')).toBe(true);
    expect(satisfies('1.14.4', '^1.10.0')).toBe(true);
    expect(satisfies('0.0.3', '^0.0.3')).toBe(true);
    expect(satisfies('0.5.1', '0.5.1')).toBe(true);
  });

  it('returns false when the version is outside the caret or exact range', () => {
    expect(satisfies('0.5.0', '^0.5.1')).toBe(false);
    expect(satisfies('0.6.0', '^0.5.1')).toBe(false);
    expect(satisfies('2.0.0', '^1.10.0')).toBe(false);
    expect(satisfies('0.0.4', '^0.0.3')).toBe(false);
    expect(satisfies('0.5.2', '0.5.1')).toBe(false);
  });

  it('throws when the version is a prerelease', () => {
    expect(() => satisfies('0.5.1-otb.1', '^0.5.1')).toThrow();
  });
});

describe('packages/dnd-kit', () => {
  it('returns each fork package in workspaces, named @dnd-kit/<name>, when package.json is read', () => {
    expect(rootManifest.workspaces).toEqual(FORK_PACKAGES.map(name => `packages/dnd-kit/${name}`));
    for (const [name, manifest] of forkManifests) expect(manifest.name).toBe(`@dnd-kit/${name}`);
  });

  it('returns an x.y.z version with no prerelease suffix when each fork package.json is read', () => {
    for (const manifest of forkManifests.values()) {
      expect(manifest.version, manifest.name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('returns fork versions that satisfy every @dnd-kit range when each fork package.json is read', () => {
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

  it('returns the exact fork version for each @dnd-kit dependency when the root package.json is read', () => {
    const direct = Object.entries(rootManifest.dependencies ?? {}).filter(([name]) => name.startsWith('@dnd-kit/'));
    expect(direct.length).toBeGreaterThan(0);
    for (const [name, range] of direct) {
      expect(range, name).toBe(forkManifests.get(name.slice('@dnd-kit/'.length))?.version);
    }
  });

  it('returns private: true and no devDependencies when each fork package.json is read', () => {
    for (const manifest of forkManifests.values()) {
      expect(manifest.private, manifest.name).toBe(true);
      expect(manifest.devDependencies, manifest.name).toBeUndefined();
    }
  });

  it('returns only link entries to packages/dnd-kit for @dnd-kit when package-lock.json is read', () => {
    const entries = Object.entries(lockfile.packages).filter(([key]) => /(^|\/)node_modules\/@dnd-kit\//.test(key));
    expect(entries.map(([key]) => key).sort()).toEqual(FORK_PACKAGES.map(name => `node_modules/@dnd-kit/${name}`));
    for (const [key, entry] of entries) {
      expect(entry, key).toEqual({resolved: `packages/dnd-kit/${key.slice('node_modules/@dnd-kit/'.length)}`, link: true});
    }
  });

  it('returns 1 @preact/signals-core entry that satisfies @dnd-kit/state when package-lock.json is read', () => {
    const copies = Object.entries(lockfile.packages).filter(([key]) => /(^|\/)node_modules\/@preact\/signals-core$/.test(key));
    expect(copies.map(([key]) => key)).toEqual(['node_modules/@preact/signals-core']);
    const range = forkManifests.get('state')!.dependencies!['@preact/signals-core'];
    expect(satisfies(copies[0][1].version!, range)).toBe(true);
  });

  it('returns an existing file for every main, module, types and exports path when packages/dnd-kit is built', () => {
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

  it('returns an MIT LICENSE per package and a NOTICE with the release and commit when packages/dnd-kit is read', () => {
    const notice = fs.readFileSync(path.join(forkDir, 'NOTICE'), 'utf8');
    expect(notice).toContain(`@dnd-kit/react@${forkManifests.get('react')!.version}`);
    expect(notice).toMatch(/Commit:\s+[0-9a-f]{40}/);
    for (const name of ['.', ...FORK_PACKAGES]) {
      expect(fs.readFileSync(path.join(forkDir, name, 'LICENSE'), 'utf8'), `${name}/LICENSE`).toMatch(/^MIT License/);
    }
  });
});
