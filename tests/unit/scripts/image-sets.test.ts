import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import imagesetConfig from '@/imageset.config.json';
import customConfig from '@/imageset.custom.json';
import legacyConfig from '@/imageset.legacy.json';
import {
  buildPackageEntry,
  legacyEntry,
  legacyFiles,
  mergeConfig,
  officialPackages,
  splitPackages,
} from '@/scripts/lib/image-sets.mjs';

const repoRoot = path.resolve(__dirname, '../../..');
const LEGACY_SETS = ['image-set', 'image-wutheringwaves', 'image-webdev', 'image-supervive', 'image-helldivers2'];
const OFFICIAL_SETS = ['image-reachthefinals', 'image-overwatch'];

type ConfigEntry = {displayName: string; images: {filename: string}[]; tags: object; legacy?: boolean};
const configPackages = (imagesetConfig as {packages: Record<string, ConfigEntry>}).packages;
const legacyPackages = legacyConfig as Record<string, ConfigEntry>;

/** The files committed under `dir` (relative to the repository), relative to `dir`, sorted. */
function committedFilesUnder(dir: string): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', dir], {cwd: repoRoot, encoding: 'utf8'})
    .split('\0')
    .filter(Boolean)
    .map((file) => path.posix.relative(dir, file))
    .sort();
}

/** The paths among `files` that .gitignore ignores, whether or not they exist, sorted. */
function gitIgnored(files: string[]): string[] {
  const result = spawnSync('git', ['check-ignore', '--no-index', '--stdin', '-z'], {cwd: repoRoot, input: files.join('\0'), encoding: 'utf8'});
  // check-ignore exits 1 when no path is ignored.
  expect([0, 1], result.stderr).toContain(result.status);
  return result.stdout.split('\0').filter(Boolean).sort();
}

describe('image sets in this repository', () => {
  it('ships THE FINALS and OVERWATCH from npm, and the other sets as legacy', () => {
    const {official, legacy} = splitPackages(customConfig, legacyConfig);
    expect(official).toEqual(OFFICIAL_SETS);
    expect(legacy.sort()).toEqual([...LEGACY_SETS].sort());
    expect(officialPackages(customConfig)).toEqual(OFFICIAL_SETS);
  });

  it('keeps every set in imageset.config.json, in the order of imageset.custom.json', () => {
    expect(Object.keys(configPackages)).toEqual(Object.keys(customConfig.packages));
  });

  it('copies each legacy entry unchanged into imageset.config.json, marked legacy', () => {
    for (const name of LEGACY_SETS) {
      expect(configPackages[name], name).toEqual(legacyEntry(name, legacyPackages[name]));
      expect(configPackages[name].legacy, name).toBe(true);
    }
    for (const name of OFFICIAL_SETS) expect(configPackages[name], name).not.toHaveProperty('legacy');
  });

  it('commits exactly the images of every legacy set, without their PNG copies', () => {
    for (const name of LEGACY_SETS) {
      const dir = path.join(repoRoot, 'public/images', name);
      expect(fs.lstatSync(dir).isDirectory(), `${dir} is a folder`).toBe(true);
      const images = legacyPackages[name].images.map(({filename}) => filename);
      expect(committedFilesUnder(`public/images/${name}`), name).toEqual([...images].sort());
      expect(images.every((image) => image.endsWith('.webp')), `${name} has only WebP images`).toBe(true);
    }
  });

  it('keeps the PNG copies of the legacy images out of git (prepareImages makes them)', () => {
    for (const name of LEGACY_SETS) {
      const files: string[] = legacyFiles(legacyPackages[name]).map((file: string) => `public/images/${name}/${file}`);
      const ignored = gitIgnored(files);
      expect(ignored, name).toEqual(files.filter((file) => file.endsWith('.png')).sort());
      expect(ignored.length, name).toBe(legacyPackages[name].images.length);
    }
  });

  it('commits real WebP files for the legacy sets', () => {
    for (const name of LEGACY_SETS) {
      for (const {filename} of legacyPackages[name].images) {
        const bytes = fs.readFileSync(path.join(repoRoot, 'public/images', name, filename));
        expect(bytes.toString('latin1', 0, 4) + bytes.toString('latin1', 8, 12), filename).toBe('RIFFWEBP');
      }
    }
  });

  it('does not depend on the npm packages of the legacy sets any more', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const imageDependencies = Object.keys({...packageJson.dependencies, ...packageJson.devDependencies}).filter((name) => name.startsWith('image-'));
    expect(imageDependencies.sort()).toEqual([...OFFICIAL_SETS].sort());
  });
});

describe('scripts/lib/image-sets.mjs', () => {
  const entry = (displayName: string) => ({displayName, images: [{filename: 'a.webp', label: 'A', tags: []}], tags: {}});

  describe('splitPackages', () => {
    const custom = {packages: {'image-one': {displayName: 'One'}, 'image-old': {legacy: true}, 'image-two': {displayName: 'Two'}}};

    it('splits official and legacy sets and keeps the order', () => {
      expect(splitPackages(custom, {'image-old': entry('Old')})).toEqual({
        order: ['image-one', 'image-old', 'image-two'],
        official: ['image-one', 'image-two'],
        legacy: ['image-old'],
      });
    });

    it.each([
      ['a legacy set without a frozen entry', custom, {}, 'has no entry in imageset.legacy.json'],
      ['a frozen entry for an official set', custom, {'image-old': entry('Old'), 'image-one': entry('One')}, 'must mark it {"legacy": true}'],
      ['a frozen entry missing from imageset.custom.json', custom, {'image-old': entry('Old'), 'image-gone': entry('Gone')}, 'is in imageset.legacy.json but not in imageset.custom.json'],
      ['"legacy": false', {packages: {'image-one': {legacy: false}}}, {}, 'Use true or leave it out'],
      ['a name that is not an image set', {packages: {'left-pad': {}}}, {}, 'is not an image set package name'],
      ['no packages', {}, {}, 'must be {"packages"'],
    ])('refuses %s', (_name, customConfig, legacy, message) => {
      expect(() => splitPackages(customConfig, legacy)).toThrow(message);
    });
  });

  it('officialPackages lists the sets without "legacy"', () => {
    expect(officialPackages({packages: {'image-a': {}, 'image-b': {legacy: true}, 'bad name': {}}})).toEqual(['image-a']);
    expect(officialPackages(null)).toEqual([]);
  });

  describe('legacyEntry and legacyFiles', () => {
    it('marks the entry legacy, as its last key', () => {
      const result = legacyEntry('image-old', {...entry('Old'), legacy: true, backgroundImage: '/x.webp'});
      expect(Object.keys(result)).toEqual(['displayName', 'images', 'tags', 'backgroundImage', 'legacy']);
    });

    it.each([
      ['no images', {displayName: 'Old', images: [], tags: {}}, 'has no images'],
      ['an image without a filename', {displayName: 'Old', images: [{label: 'A'}], tags: {}}, 'without a filename'],
      ['no tags', {displayName: 'Old', images: [{filename: 'a.webp'}]}, 'must have displayName, images and tags'],
    ])('refuses an entry with %s', (_name, value, message) => {
      expect(() => legacyEntry('image-old', value)).toThrow(message);
    });

    it('lists each image and the PNG copy of each WebP image', () => {
      expect(legacyFiles({images: [{filename: 'a.webp'}, {filename: 'sub/B.WEBP'}, {filename: 'c.png'}]}))
        .toEqual(['a.webp', 'a.png', 'sub/B.WEBP', 'sub/B.png', 'c.png']);
    });
  });

  describe('buildPackageEntry', () => {
    const metadata = [
      {filename: 'ana.webp', label: 'Ana', tags: [{name: 'sup', title: 'Support', description: 'Healers'}]},
      {filename: 'sub/mei.webp', label: '', tags: [{name: 'dps'}]},
    ];

    it('writes the entry the app has always written', () => {
      const result = buildPackageEntry({
        packageName: 'image-ow',
        displayName: 'OW',
        images: ['ana.webp', 'sub/mei.webp', 'new.webp'],
        metadata,
        custom: {googleFont: 'Saira', backgroundImage: '/bg.webp'},
      });
      expect(JSON.stringify(result)).toBe(JSON.stringify({
        displayName: 'OW',
        images: [
          {filename: 'ana.webp', label: 'Ana', tags: ['sup']},
          {filename: 'sub/mei.webp', label: 'sub/mei.webp', tags: ['dps']},
          {filename: 'new.webp', label: 'new.webp', tags: []},
        ],
        tags: {
          sup: {title: 'Support', description: 'Healers', category: 'general'},
          dps: {title: 'dps for OW', description: 'Description of dps in OW', category: 'general'},
        },
        googleFont: 'Saira',
        backgroundImage: '/bg.webp',
      }));
    });

    it('refuses a package without images', () => {
      expect(() => buildPackageEntry({packageName: 'image-ow', displayName: 'OW', images: [], metadata})).toThrow('has no images');
    });
  });

  it('mergeConfig keeps the order of imageset.custom.json', () => {
    const merged = mergeConfig(['image-b', 'image-old', 'image-a'], {'image-a': entry('A'), 'image-b': entry('B')}, {'image-old': entry('Old')});
    expect(Object.keys(merged.packages)).toEqual(['image-b', 'image-old', 'image-a']);
    expect((merged.packages as Record<string, unknown>)['image-old']).toEqual({...entry('Old'), legacy: true});
    expect(() => mergeConfig(['image-c'], {}, {})).toThrow('No config entry for image-c');
  });
});
