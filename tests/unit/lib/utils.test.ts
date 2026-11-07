import {describe, expect, it} from 'vitest';
import imagesetConfig from '@/imageset.config.json';
import {createSEOFriendlyTagSlug, getTierGradient, slugify} from '@/lib/utils';

/**
 * These helpers build public URLs (/rank/<set>/<tag>) and the tier row colours.
 * Shared links and search engines point at these URLs, so their output must not change.
 */

/**
 * The /rank/<slug>/... path of every image set that has shipped. These URLs are public,
 * so a shipped set keeps its slug. Add new sets here; never change or remove an entry.
 */
const SHIPPED_SET_SLUGS: Record<string, string> = {
  'image-set': 'example-items-template',
  'image-reachthefinals': 'the-finals',
  'image-wutheringwaves': 'wuthering-waves',
  'image-overwatch': 'overwatch',
  'image-webdev': 'web-development-technologies',
  'image-supervive': 'supervive',
  'image-helldivers2': 'helldivers-2',
};

describe('slugify', () => {
  const packages: Record<string, {displayName: string}> = imagesetConfig.packages;

  for (const [packageName, slug] of Object.entries(SHIPPED_SET_SLUGS)) {
    it(`returns ${slug} when slugify gets the display name of ${packageName}`, () => {
      expect(packages[packageName], `${packageName} is in imageset.config.json`).toBeDefined();
      expect(slugify(packages[packageName].displayName)).toBe(slug);
    });
  }

  it('returns a distinct slug for each image set when called with every display name', () => {
    const slugs = Object.values(packages).map((set) => slugify(set.displayName));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('returns single dashes and no dash at either end when the text has spaces and dashes', () => {
    expect(slugify('  Hello,  World!  ')).toBe('hello-world');
    expect(slugify('a--b')).toBe('a-b');
    expect(slugify('--tier list--')).toBe('tier-list');
  });

  it('returns only a-z, 0-9, underscore and dash when the text has other characters', () => {
    expect(slugify('C++ & C#')).toBe('c-c');
    expect(slugify('Déjà vu')).toBe('dj-vu');
    expect(slugify('émoji 🎮 list')).toBe('moji-list');
    expect(slugify('snake_case')).toBe('snake_case');
  });

  it('returns an empty slug when the text is empty', () => {
    expect(slugify('')).toBe('');
  });
});

describe('createSEOFriendlyTagSlug', () => {
  it('returns dashes when the tag has underscores', () => {
    expect(createSEOFriendlyTagSlug('h_all')).toBe('h-all');
    expect(createSEOFriendlyTagSlug('c_rarity_4')).toBe('c-rarity-4');
    expect(createSEOFriendlyTagSlug('4_0_0')).toBe('4-0-0');
  });

  it('returns lower case without one dash at each end when the tag has capitals or edge underscores', () => {
    expect(createSEOFriendlyTagSlug('Stratagems')).toBe('stratagems');
    expect(createSEOFriendlyTagSlug('_x_')).toBe('x');
    expect(createSEOFriendlyTagSlug('__a__')).toBe('a');
  });

  it('returns an empty slug when the tag is empty', () => {
    expect(createSEOFriendlyTagSlug('')).toBe('');
  });

  it('returns a distinct slug for each tag of an image set when called with all its tags', () => {
    for (const [packageName, set] of Object.entries(imagesetConfig.packages)) {
      const tags = Object.keys(set.tags);
      const slugs = new Set(tags.map(createSEOFriendlyTagSlug));
      expect(slugs.size, packageName).toBe(tags.length);
    }
  });
});

describe('getTierGradient', () => {
  const gradients = (rows: number) =>
    Array.from({length: rows}, (_, index) => getTierGradient(index, rows));

  it('returns an empty string when the row is the last row (Unranked)', () => {
    for (const rows of [4, 6, 8, 9]) {
      expect(getTierGradient(rows - 1, rows)).toBe('');
    }
  });

  it('returns gradients 0, 2 and 4 when the list has 4 rows (3-row template)', () => {
    expect(gradients(4)).toEqual([
      'var(--tier-gradient-0)',
      'var(--tier-gradient-2)',
      'var(--tier-gradient-4)',
      '',
    ]);
  });

  it('returns gradients 0, 1, 3, 4 and 6 when the list has 6 rows (5-row template)', () => {
    expect(gradients(6)).toEqual([
      'var(--tier-gradient-0)',
      'var(--tier-gradient-1)',
      'var(--tier-gradient-3)',
      'var(--tier-gradient-4)',
      'var(--tier-gradient-6)',
      '',
    ]);
  });

  it('returns gradients 0 to 6 in order when the list has 8 rows (7-row template)', () => {
    expect(gradients(8)).toEqual([
      'var(--tier-gradient-0)',
      'var(--tier-gradient-1)',
      'var(--tier-gradient-2)',
      'var(--tier-gradient-3)',
      'var(--tier-gradient-4)',
      'var(--tier-gradient-5)',
      'var(--tier-gradient-6)',
      '',
    ]);
  });

  it('returns gradient 0 when the row index is 7 of 9 rows', () => {
    expect(getTierGradient(7, 9)).toBe('var(--tier-gradient-0)');
  });
});
