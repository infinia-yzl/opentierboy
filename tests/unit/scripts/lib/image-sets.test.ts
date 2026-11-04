import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import imagesetConfig from '@/imageset.config.json';
import customConfig from '@/imageset.custom.json';
import legacyConfig from '@/imageset.legacy.json';
import {
  buildPackageEntry,
  displayFields,
  frozenEntryDifferences,
  imageShape,
  legacyEntry,
  mergeConfig,
  activePackages,
  splitPackages,
  tagShape,
  tagSlug,
} from '@/scripts/lib/image-sets.mjs';
import {createSEOFriendlyTagSlug} from '@/lib/utils';

const repoRoot = path.resolve(__dirname, '../../../..');
const LEGACY_SETS = ['image-set', 'image-wutheringwaves', 'image-webdev', 'image-supervive', 'image-helldivers2'];
const ACTIVE_SETS = ['image-reachthefinals', 'image-overwatch'];

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
  it('returns the 2 active and 5 legacy sets from splitPackages when it reads imageset.custom.json', () => {
    const {active, legacy} = splitPackages(customConfig, legacyConfig);
    expect(active).toEqual(ACTIVE_SETS);
    expect(legacy.sort()).toEqual([...LEGACY_SETS].sort());
    expect(activePackages(customConfig)).toEqual(ACTIVE_SETS);
  });

  it('returns the imageset.custom.json order when the keys of imageset.config.json are read', () => {
    expect(Object.keys(configPackages)).toEqual(Object.keys(customConfig.packages));
  });

  it('returns the legacyEntry of each legacy set, and no legacy key on active sets, when imageset.config.json is read', () => {
    for (const name of LEGACY_SETS) {
      expect(configPackages[name], name).toEqual(legacyEntry(name, legacyPackages[name]));
      expect(configPackages[name].legacy, name).toBe(true);
    }
    for (const name of ACTIVE_SETS) expect(configPackages[name], name).not.toHaveProperty('legacy');
  });

  it('returns no committed file when git ls-files lists public/images', () => {
    // Every set, legacy sets included, is copied from its npm package at build time.
    expect(committedFilesUnder('public/images')).toEqual([]);
  });

  it('returns every image and PNG copy of each legacy set when git check-ignore reads their paths', () => {
    for (const name of LEGACY_SETS) {
      const files = legacyPackages[name].images.flatMap(({filename}) => [filename, filename.replace(/\.webp$/i, '.png')])
        .map((file) => `public/images/${name}/${file}`);
      expect(gitIgnored(files), name).toEqual([...files].sort());
    }
  });

  it('returns no difference from frozenEntryDifferences when the installed package of each legacy set builds its entry', async () => {
    for (const name of LEGACY_SETS) {
      const frozen = legacyPackages[name];
      const imageSet = await import(/* @vite-ignore */ name);
      const images = await imageSet.getImageList(path.join(repoRoot, 'node_modules', name, 'public/images'));
      const built = buildPackageEntry({
        packageName: name,
        displayName: displayFields(name, frozen).displayName,
        images,
        metadata: await imageSet.getImageMetadata(),
        custom: frozen,
      });
      expect(frozenEntryDifferences(name, built, frozen), name).toEqual([]);
    }
  });

  it('returns the sets of imageset.custom.json and no other image-* package when package.json dependencies are read', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const imageDependencies = Object.keys({...packageJson.dependencies, ...packageJson.devDependencies}).filter((name) => name.startsWith('image-'));
    expect(imageDependencies.sort()).toEqual([...ACTIVE_SETS, ...LEGACY_SETS].sort());
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

    it('returns {order, active, legacy} in file order when active and legacy sets are mixed', () => {
      expect(splitPackages(custom, {'image-old': entry('Old')})).toEqual({
        order: ['image-one', 'image-old', 'image-two'],
        active: ['image-one', 'image-two'],
        legacy: ['image-old'],
      });
    });

    it.each([
      ['a legacy set without a frozen entry', custom, {}, 'has no entry in imageset.legacy.json'],
      ['a frozen entry for an active set', custom, {'image-old': entry('Old'), 'image-one': entry('One')}, 'must mark it {"legacy": true}'],
      ['a frozen entry missing from imageset.custom.json', custom, {'image-old': entry('Old'), 'image-gone': entry('Gone')}, 'is in imageset.legacy.json but not in imageset.custom.json'],
      ['"legacy": false', {packages: {'image-one': {legacy: false}}}, {}, 'Use true or leave it out'],
      ['a name that is not an image set', {packages: {'left-pad': {}}}, {}, 'is not an image set package name'],
      ['no packages', {}, {}, 'must be {"packages"'],
    ])('throws an Error with the reason when the input has %s', (_name, customConfig, legacy, message) => {
      expect(() => splitPackages(customConfig, legacy)).toThrow(message);
    });
  });

  it('returns only image-* sets without legacy from activePackages when the config is mixed or null', () => {
    expect(activePackages({packages: {'image-a': {}, 'image-b': {legacy: true}, 'bad name': {}}})).toEqual(['image-a']);
    expect(activePackages(null)).toEqual([]);
  });

  describe('legacyEntry', () => {
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
  });

  describe('frozenEntryDifferences', () => {
    const frozen = {
      displayName: 'Old',
      images: [{filename: 'a.webp', label: 'A', tags: ['t']}, {filename: 'b.webp', label: 'B', tags: ['t']}],
      tags: {t: {title: 'T', description: 'All', category: 'general'}},
      backgroundImage: '/old.webp',
      legacy: true,
    };
    const built = () => {
      const copy = JSON.parse(JSON.stringify(frozen));
      delete copy.legacy;
      return copy;
    };

    it('returns [] when the built entry equals the frozen entry without its legacy key', () => {
      expect(frozenEntryDifferences('image-old', built(), frozen)).toEqual([]);
    });

    it.each([
      ['a changed label', (entry: typeof frozen) => { entry.images[1].label = 'Bee'; }, 'image-old: image "b.webp" is {"filename":"b.webp","label":"Bee","tags":["t"]} instead of {"filename":"b.webp","label":"B","tags":["t"]}'],
      ['a removed image', (entry: typeof frozen) => { entry.images.pop(); }, 'image-old: image "b.webp" is missing'],
      ['a new image', (entry: typeof frozen) => { entry.images.push({filename: 'c.webp', label: 'C', tags: []}); }, 'image-old: image "c.webp" is new'],
      ['images in another order', (entry: typeof frozen) => { entry.images.reverse(); }, 'image-old: the images are in a different order'],
      ['a new tag', (entry: typeof frozen) => { Object.assign(entry.tags, {u: {title: 'U', description: 'U', category: 'general'}}); }, 'image-old: tag "u" is new'],
      ['a changed display name', (entry: typeof frozen) => { entry.displayName = 'New'; }, 'image-old: displayName is "New" instead of "Old"'],
      ['a missing background image', (entry: Partial<typeof frozen>) => { delete entry.backgroundImage; }, 'image-old: backgroundImage is nothing instead of "/old.webp"'],
    ])('returns the difference when the built entry has %s', (_name, change, difference) => {
      const entry = built();
      change(entry);
      expect(frozenEntryDifferences('image-old', entry, frozen)).toEqual([difference]);
    });

    it('returns "the keys are in a different order" when only the key order differs', () => {
      const {displayName, images, tags, backgroundImage} = built();
      expect(frozenEntryDifferences('image-old', {images, displayName, tags, backgroundImage}, frozen)).toEqual(['image-old: the keys are in a different order']);
    });

    it('throws from legacyEntry when the frozen entry has no images', () => {
      expect(() => frozenEntryDifferences('image-old', built(), {...frozen, images: []})).toThrow('has no images');
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

describe('buildPackageEntry, imageShape and tagShape with tile shapes', () => {
  const tags = {
    maps: {name: 'maps', title: 'Maps', description: 'Maps', shape: 'landscape'},
    heroes: {name: 'heroes', title: 'Heroes', description: 'Heroes', shape: 'portrait'},
    icons: {name: 'icons', title: 'Icons', description: 'Icons', shape: 'square'},
    plain: {name: 'plain', title: 'Plain', description: 'Plain'},
  };

  it('returns image shapes, omitting square, when buildPackageEntry gets per-image shapes (image-set 2.2.0)', () => {
    const entry = buildPackageEntry({
      packageName: 'image-mixed',
      displayName: 'Mixed',
      images: ['map.webp', 'hero.webp', 'icon.webp', 'plain.webp'],
      metadata: [
        {filename: 'map.webp', label: 'Map', tags: [tags.maps], shape: 'landscape'},
        {filename: 'hero.webp', label: 'Hero', tags: [tags.heroes, tags.maps], shape: 'portrait'},
        {filename: 'icon.webp', label: 'Icon', tags: [tags.icons], shape: 'square'},
        {filename: 'plain.webp', label: 'Plain', tags: [tags.plain], shape: 'square'},
      ],
    });
    expect(JSON.stringify(entry.images)).toBe(JSON.stringify([
      {filename: 'map.webp', label: 'Map', tags: ['maps'], shape: 'landscape'},
      {filename: 'hero.webp', label: 'Hero', tags: ['heroes', 'maps'], shape: 'portrait'},
      {filename: 'icon.webp', label: 'Icon', tags: ['icons']},
      {filename: 'plain.webp', label: 'Plain', tags: ['plain']},
    ]));
    expect(entry.tags).toEqual({
      maps: {title: 'Maps', description: 'Maps', category: 'general', shape: 'landscape'},
      heroes: {title: 'Heroes', description: 'Heroes', category: 'general', shape: 'portrait'},
      icons: {title: 'Icons', description: 'Icons', category: 'general'},
      plain: {title: 'Plain', description: 'Plain', category: 'general'},
    });
  });

  it('returns the shape of the first tag that has one, omitting square, when an image has no shape', () => {
    expect(imageShape('image-mixed', {filename: 'a.webp', tags: [tags.plain, tags.heroes, tags.maps]})).toBe('portrait');
    expect(imageShape('image-mixed', {filename: 'a.webp', tags: [tags.icons, tags.maps]})).toBeUndefined();
    expect(imageShape('image-mixed', {filename: 'a.webp', tags: [tags.plain]})).toBeUndefined();
    expect(imageShape('image-mixed', undefined)).toBeUndefined();
  });

  it('throws "has the unknown shape" when imageShape or tagShape gets an unknown shape', () => {
    expect(() => imageShape('image-mixed', {filename: 'a.webp', shape: 'round', tags: []})).toThrow('image "a.webp" has the unknown shape "round"');
    expect(() => tagShape('image-mixed', {name: 'maps', shape: 'wide'})).toThrow('tag "maps" has the unknown shape "wide"');
  });
});
