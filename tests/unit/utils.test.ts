import {describe, expect, it} from 'vitest';
import imagesetConfig from '@/imageset.config.json';
import {createSEOFriendlyTagSlug, getTierGradient, slugify} from '@/lib/utils';

/**
 * These helpers build public URLs (/rank/<set>/<tag>) and the tier row colours.
 * Shared links and search engines point at these URLs, so their output must not change.
 */

describe('slugify', () => {
  it('turns every image set display name into the slug used in /rank links', () => {
    const slugs = Object.values(imagesetConfig.packages).map((set) => slugify(set.displayName));

    expect(slugs).toEqual([
      'example-items-template',
      'the-finals',
      'wuthering-waves',
      'overwatch',
      'web-development-technologies',
      'supervive',
      'helldivers-2',
    ]);
  });

  it('collapses spaces and dashes and trims them from both ends', () => {
    expect(slugify('  Hello,  World!  ')).toBe('hello-world');
    expect(slugify('a--b')).toBe('a-b');
    expect(slugify('--tier list--')).toBe('tier-list');
  });

  it('drops characters outside A-Z, 0-9, underscore and dash', () => {
    expect(slugify('C++ & C#')).toBe('c-c');
    expect(slugify('Déjà vu')).toBe('dj-vu');
    expect(slugify('émoji 🎮 list')).toBe('moji-list');
    expect(slugify('snake_case')).toBe('snake_case');
  });

  it('returns an empty slug for empty text', () => {
    expect(slugify('')).toBe('');
  });
});

describe('createSEOFriendlyTagSlug', () => {
  it('turns underscores in tag names into dashes', () => {
    expect(createSEOFriendlyTagSlug('h_all')).toBe('h-all');
    expect(createSEOFriendlyTagSlug('c_rarity_4')).toBe('c-rarity-4');
    expect(createSEOFriendlyTagSlug('4_0_0')).toBe('4-0-0');
  });

  it('lower-cases the tag and trims one dash from each end', () => {
    expect(createSEOFriendlyTagSlug('Stratagems')).toBe('stratagems');
    expect(createSEOFriendlyTagSlug('_x_')).toBe('x');
    expect(createSEOFriendlyTagSlug('__a__')).toBe('a');
  });

  it('returns an empty slug for an empty tag', () => {
    expect(createSEOFriendlyTagSlug('')).toBe('');
  });

  it('gives every tag of an image set its own slug', () => {
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

  it('leaves the last row (Unranked) without a gradient', () => {
    for (const rows of [4, 6, 8, 9]) {
      expect(getTierGradient(rows - 1, rows)).toBe('');
    }
  });

  it('spreads the colours over the 3-row template', () => {
    expect(gradients(4)).toEqual([
      'var(--tier-gradient-0)',
      'var(--tier-gradient-2)',
      'var(--tier-gradient-4)',
      '',
    ]);
  });

  it('skips two colours for the 5-row template', () => {
    expect(gradients(6)).toEqual([
      'var(--tier-gradient-0)',
      'var(--tier-gradient-1)',
      'var(--tier-gradient-3)',
      'var(--tier-gradient-4)',
      'var(--tier-gradient-6)',
      '',
    ]);
  });

  it('uses every colour in order for the 7-row template', () => {
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

  it('starts the colours again after seven rows', () => {
    expect(getTierGradient(7, 9)).toBe('var(--tier-gradient-0)');
  });
});
