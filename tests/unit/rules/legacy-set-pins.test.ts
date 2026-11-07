import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * The legacy image sets ({"legacy": true} in imageset.custom.json) are frozen. Their npm
 * packages stay at the exact version they shipped with: a published npm version can never be
 * overwritten, so an exact pin freezes the images, and prepareImages checks the config entry
 * against imageset.legacy.json. The pin holds only while:
 * - package.json names an exact x.y.z version (no ^, ~, range or tag), and package-lock.json
 *   installs that version;
 * - Dependabot never proposes an update: .github/dependabot.yml ignores each legacy package
 *   in its npm entry, with no versions or update-types limit (that would ignore only some updates).
 * Active sets must not be on that ignore list: their updates come through it as a fallback.
 */
const root = path.resolve(__dirname, '../../..');
const EXACT_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

type Custom = {packages: Record<string, {legacy?: boolean}>};
type Manifest = {dependencies?: Record<string, string>; devDependencies?: Record<string, string>};
type Lock = {packages: Record<string, {version?: string; dependencies?: Record<string, string>}>};

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as T;

/** One `ignore` entry of a Dependabot update: the dependency name and the other keys it sets. */
type IgnoreEntry = {name: string; keys: string[]};

/**
 * The `ignore` entries of the npm update for the root folder in a dependabot.yml text. A small
 * reader for the layout this repository uses (two-space indents, one key per line), so the test
 * needs no YAML dependency.
 */
function npmIgnoreEntries(yaml: string): IgnoreEntry[] {
  const lines = yaml.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));
  const indent = (line: string) => line.length - line.trimStart().length;
  const value = (line: string) => line.slice(line.indexOf(':') + 1).trim().replace(/^["']|["']$/g, '');
  const starts = lines.flatMap((line, index) => (/^\s*- package-ecosystem:/.test(line) ? [index] : []));
  for (const [number, start] of starts.entries()) {
    const block = lines.slice(start, starts[number + 1] ?? lines.length);
    const keyIndent = indent(block[0]) + 2;
    const key = (name: string) => block.find((line) => indent(line) === keyIndent && line.trim().startsWith(`${name}:`));
    const directory = key('directory');
    if (value(block[0]) !== 'npm' || !directory || value(directory) !== '/') continue;
    const ignoreAt = block.findIndex((line) => indent(line) === keyIndent && line.trim() === 'ignore:');
    const entries: IgnoreEntry[] = [];
    for (let index = ignoreAt + 1; ignoreAt !== -1 && index < block.length && indent(block[index]) > keyIndent; index++) {
      const line = block[index].trim();
      if (line.startsWith('- dependency-name:')) entries.push({name: value(line), keys: []});
      else if (entries.length > 0 && !line.startsWith('- ')) entries[entries.length - 1].keys.push(line.split(':')[0]);
    }
    return entries;
  }
  return [];
}

/** The breaks of the legacy pin rule, one line each. */
function pinBreaks(custom: Custom, manifest: Manifest, lock: Lock, dependabot: string): string[] {
  const breaks: string[] = [];
  const ignored = npmIgnoreEntries(dependabot);
  for (const [name, entry] of Object.entries(custom.packages)) {
    const ignore = ignored.find((item) => item.name === name);
    if (entry.legacy !== true) {
      if (ignore) breaks.push(`${name} is an active set but .github/dependabot.yml ignores it`);
      continue;
    }
    const pin = manifest.dependencies?.[name] ?? manifest.devDependencies?.[name];
    if (pin === undefined) breaks.push(`${name} is not a dependency in package.json`);
    else if (!EXACT_VERSION.test(pin)) breaks.push(`${name} is "${pin}" in package.json, not an exact x.y.z version`);
    else {
      const rootDependency = lock.packages['']?.dependencies?.[name];
      const installed = lock.packages[`node_modules/${name}`]?.version;
      if (rootDependency !== pin) breaks.push(`${name} is "${rootDependency}" in package-lock.json, not "${pin}" as in package.json`);
      if (installed !== pin) breaks.push(`package-lock.json installs ${name} ${installed}, not ${pin}`);
    }
    if (!ignore) breaks.push(`${name} is missing from the npm ignore list in .github/dependabot.yml`);
    else if (ignore.keys.length > 0) breaks.push(`${name}: the Dependabot ignore entry limits ${ignore.keys.join(', ')}, so some updates still come`);
  }
  return breaks;
}

const DEPENDABOT = `version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    ignore:
      # A comment.
      - dependency-name: "lz-string"
      - dependency-name: "image-old"
      - dependency-name: "image-partly"
        versions: [">=2"]
    groups:
      image-sets:
        patterns:
          - "image-*"
  - package-ecosystem: "github-actions"
    directory: "/"
    ignore:
      - dependency-name: "image-elsewhere"
`;
const custom: Custom = {packages: {'image-new': {}, 'image-old': {legacy: true}}};
const lockFor = (versions: Record<string, string>): Lock => ({
  packages: {
    '': {dependencies: versions},
    ...Object.fromEntries(Object.entries(versions).map(([name, version]) => [`node_modules/${name}`, {version}])),
  },
});

describe('legacy image set pins', () => {
  it('returns the ignore entries of the npm update only when npmIgnoreEntries reads a dependabot.yml text', () => {
    expect(npmIgnoreEntries(DEPENDABOT)).toEqual([
      {name: 'lz-string', keys: []},
      {name: 'image-old', keys: []},
      {name: 'image-partly', keys: ['versions']},
    ]);
  });

  it('returns no break when each legacy set is pinned exactly, installed at its pin and ignored', () => {
    expect(pinBreaks(custom, {dependencies: {'image-new': '^1.0.0', 'image-old': '1.2.3'}}, lockFor({'image-new': '^1.0.0', 'image-old': '1.2.3'}), DEPENDABOT)).toEqual([]);
  });

  it.each([
    ['a caret range', '^1.2.3', 'image-old is "^1.2.3" in package.json, not an exact x.y.z version'],
    ['a tilde range', '~1.2.3', 'image-old is "~1.2.3" in package.json, not an exact x.y.z version'],
    ['a tag', 'latest', 'image-old is "latest" in package.json, not an exact x.y.z version'],
    ['a pre-release', '1.2.3-beta.1', 'image-old is "1.2.3-beta.1" in package.json, not an exact x.y.z version'],
  ])('returns a break when package.json pins a legacy set to %s', (_name, pin, message) => {
    expect(pinBreaks(custom, {dependencies: {'image-old': pin}}, lockFor({'image-old': pin}), DEPENDABOT)).toEqual([message]);
  });

  it('returns a break when a legacy set is missing from package.json', () => {
    expect(pinBreaks(custom, {dependencies: {}}, lockFor({}), DEPENDABOT)).toEqual(['image-old is not a dependency in package.json']);
  });

  it('returns a break when package-lock.json installs another version than the pin', () => {
    const lock = lockFor({'image-old': '1.2.3'});
    lock.packages['node_modules/image-old'] = {version: '1.3.0'};
    expect(pinBreaks(custom, {dependencies: {'image-old': '1.2.3'}}, lock, DEPENDABOT)).toEqual(['package-lock.json installs image-old 1.3.0, not 1.2.3']);
  });

  it.each([
    ['missing from the npm ignore list', DEPENDABOT.replace('      - dependency-name: "image-old"\n', ''), 'image-old is missing from the npm ignore list in .github/dependabot.yml'],
    ['ignored only in another ecosystem', DEPENDABOT.replace('"image-old"', '"image-other"').replace('"image-elsewhere"', '"image-old"'), 'image-old is missing from the npm ignore list in .github/dependabot.yml'],
    ['ignored for some versions only', DEPENDABOT.replace('"image-partly"', '"image-old"').replace('      - dependency-name: "image-old"\n      - dependency-name: "image-old"', '      - dependency-name: "image-old"'), 'image-old: the Dependabot ignore entry limits versions, so some updates still come'],
  ])('returns a break when a legacy set is %s', (_name, dependabot, message) => {
    expect(pinBreaks(custom, {dependencies: {'image-old': '1.2.3'}}, lockFor({'image-old': '1.2.3'}), dependabot)).toEqual([message]);
  });

  it('returns a break when an active set is on the npm ignore list', () => {
    const dependabot = DEPENDABOT.replace('"lz-string"', '"image-new"');
    expect(pinBreaks(custom, {dependencies: {'image-old': '1.2.3'}}, lockFor({'image-old': '1.2.3'}), dependabot)).toEqual(['image-new is an active set but .github/dependabot.yml ignores it']);
  });

  it('returns no break when package.json, package-lock.json and .github/dependabot.yml of this repository are read', () => {
    const repoCustom = readJson<Custom>('imageset.custom.json');
    expect(Object.values(repoCustom.packages).filter((entry) => entry.legacy === true)).toHaveLength(5);
    expect(pinBreaks(
      repoCustom,
      readJson<Manifest>('package.json'),
      readJson<Lock>('package-lock.json'),
      fs.readFileSync(path.join(root, '.github/dependabot.yml'), 'utf8'),
    )).toEqual([]);
  });
});
