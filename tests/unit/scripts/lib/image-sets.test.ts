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
  tagSlug,
} from '@/scripts/lib/image-sets.mjs';
import {createSEOFriendlyTagSlug} from '@/lib/utils';

const repoRoot = path.resolve(__dirname, '../../../..');
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
  it('returns the 2 official and 5 legacy sets from splitPackages when it reads imageset.custom.json', () => {
    const {official, legacy} = splitPackages(customConfig, legacyConfig);
    expect(official).toEqual(OFFICIAL_SETS);
    expect(legacy.sort()).toEqual([...LEGACY_SETS].sort());
    expect(officialPackages(customConfig)).toEqual(OFFICIAL_SETS);
  });

  it('returns the imageset.custom.json order when the keys of imageset.config.json are read', () => {
    expect(Object.keys(configPackages)).toEqual(Object.keys(customConfig.packages));
  });

  it('returns the legacyEntry of each legacy set, and no legacy key on official sets, when imageset.config.json is read', () => {
    for (const name of LEGACY_SETS) {
      expect(configPackages[name], name).toEqual(legacyEntry(name, legacyPackages[name]));
      expect(configPackages[name].legacy, name).toBe(true);
    }
    for (const name of OFFICIAL_SETS) expect(configPackages[name], name).not.toHaveProperty('legacy');
  });

  it('returns exactly the WebP images of each legacy set when git ls-files lists public/images/<set>', () => {
    for (const name of LEGACY_SETS) {
      const dir = path.join(repoRoot, 'public/images', name);
      expect(fs.lstatSync(dir).isDirectory(), `${dir} is a folder`).toBe(true);
      const images = legacyPackages[name].images.map(({filename}) => filename);
      expect(committedFilesUnder(`public/images/${name}`), name).toEqual([...images].sort());
      expect(images.every((image) => image.endsWith('.webp')), `${name} has only WebP images`).toBe(true);
    }
  });

  it('returns only the PNG copies of the legacy images when git check-ignore reads their paths', () => {
    for (const name of LEGACY_SETS) {
      const files: string[] = legacyFiles(legacyPackages[name]).map((file: string) => `public/images/${name}/${file}`);
      const ignored = gitIgnored(files);
      expect(ignored, name).toEqual(files.filter((file) => file.endsWith('.png')).sort());
      expect(ignored.length, name).toBe(legacyPackages[name].images.length);
    }
  });

  it('returns the RIFF and WEBP headers when each committed legacy image is read', () => {
    for (const name of LEGACY_SETS) {
      for (const {filename} of legacyPackages[name].images) {
        const bytes = fs.readFileSync(path.join(repoRoot, 'public/images', name, filename));
        expect(bytes.toString('latin1', 0, 4) + bytes.toString('latin1', 8, 12), filename).toBe('RIFFWEBP');
      }
    }
  });

  it('returns only the official image-* packages when the dependencies in package.json are read', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const imageDependencies = Object.keys({...packageJson.dependencies, ...packageJson.devDependencies}).filter((name) => name.startsWith('image-'));
    expect(imageDependencies.sort()).toEqual([...OFFICIAL_SETS].sort());
  });
});

describe('tagSlug', () => {
  it('returns the createSEOFriendlyTagSlug result when the tag is any shipped tag or an odd name', () => {
    const tags = Object.values(configPackages).flatMap((set) => Object.keys(set.tags));
    const odd = ['', '_', '__', '-', '--x', 'x--', '_x_', '__a__b__', 'h_all', 'h-all', 'H_All', 'ALL', '_all_', 'a_l_l', 'Stratagems', 'c_rarity_5', 'a-_-b', 'ÄÖ_ü', '0', 'x'.repeat(64)];
    expect(tags.length).toBeGreaterThan(50);
    for (const tag of [...tags, ...odd]) expect(tagSlug(tag), JSON.stringify(tag)).toBe(createSEOFriendlyTagSlug(tag));
  });

  it('returns a unique, non-empty slug other than "all" when the tags of each shipped set are mapped', () => {
    for (const [name, set] of Object.entries(configPackages)) {
      const slugs = Object.keys(set.tags).map(tagSlug);
      expect(slugs.filter((slug) => slug === '' || slug === 'all'), name).toEqual([]);
      expect(new Set(slugs).size, name).toBe(slugs.length);
    }
  });
});

describe('scripts/lib/image-sets.mjs', () => {
  const entry = (displayName: string) => ({displayName, images: [{filename: 'a.webp', label: 'A', tags: []}], tags: {}});

  describe('splitPackages', () => {
    const custom = {packages: {'image-one': {displayName: 'One'}, 'image-old': {legacy: true}, 'image-two': {displayName: 'Two'}}};

    it('returns {order, official, legacy} in file order when official and legacy sets are mixed', () => {
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
    ])('throws an Error with the reason when the input has %s', (_name, customConfig, legacy, message) => {
      expect(() => splitPackages(customConfig, legacy)).toThrow(message);
    });
  });

  it('returns only image-* sets without legacy from officialPackages when the config is mixed or null', () => {
    expect(officialPackages({packages: {'image-a': {}, 'image-b': {legacy: true}, 'bad name': {}}})).toEqual(['image-a']);
    expect(officialPackages(null)).toEqual([]);
  });

  describe('legacyEntry and legacyFiles', () => {
    it('returns legacy as the last key from legacyEntry when the entry has other keys', () => {
      const result = legacyEntry('image-old', {...entry('Old'), legacy: true, backgroundImage: '/x.webp'});
      expect(Object.keys(result)).toEqual(['displayName', 'images', 'tags', 'backgroundImage', 'legacy']);
    });

    it.each([
      ['no images', {displayName: 'Old', images: [], tags: {}}, 'has no images'],
      ['an image without a filename', {displayName: 'Old', images: [{label: 'A'}], tags: {}}, 'without a filename'],
      ['no tags', {displayName: 'Old', images: [{filename: 'a.webp'}]}, 'must have displayName, images and tags'],
    ])('throws from legacyEntry when the entry has %s', (_name, value, message) => {
      expect(() => legacyEntry('image-old', value)).toThrow(message);
    });

    it('returns each file and a PNG copy of each WebP file from legacyFiles when the images mix WebP and PNG', () => {
      expect(legacyFiles({images: [{filename: 'a.webp'}, {filename: 'sub/B.WEBP'}, {filename: 'c.png'}]}))
        .toEqual(['a.webp', 'a.png', 'sub/B.WEBP', 'sub/B.png', 'c.png']);
    });
  });

  describe('buildPackageEntry', () => {
    const metadata = [
      {filename: 'ana.webp', label: 'Ana', tags: [{name: 'sup', title: 'Support', description: 'Healers'}]},
      {filename: 'sub/mei.webp', label: '', tags: [{name: 'dps'}]},
    ];

    it('returns the exact entry JSON, with filenames as missing labels and default tag texts, when metadata is partial', () => {
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

    it('throws "has no images" when the package has no images', () => {
      expect(() => buildPackageEntry({packageName: 'image-ow', displayName: 'OW', images: [], metadata})).toThrow('has no images');
    });
  });

  it('returns packages from mergeConfig in the given order, legacy sets marked legacy, when every package has an entry', () => {
    const merged = mergeConfig(['image-b', 'image-old', 'image-a'], {'image-a': entry('A'), 'image-b': entry('B')}, {'image-old': entry('Old')});
    expect(Object.keys(merged.packages)).toEqual(['image-b', 'image-old', 'image-a']);
    expect((merged.packages as Record<string, unknown>)['image-old']).toEqual({...entry('Old'), legacy: true});
  });

  it('throws "No config entry for image-c" from mergeConfig when the package image-c has no entry', () => {
    expect(() => mergeConfig(['image-c'], {}, {})).toThrow('No config entry for image-c');
  });
});
