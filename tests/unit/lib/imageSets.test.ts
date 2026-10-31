import {describe, expect, it} from 'vitest';
import sitemap from '@/app/sitemap';
import {rankPageNames, visibleImageSets} from '@/lib/imageSets';
import {rankPageTitle} from '@/lib/rankPath';

const LEGACY = [
  ['image-set', 'example-items-template'],
  ['image-wutheringwaves', 'wuthering-waves'],
  ['image-webdev', 'web-development-technologies'],
  ['image-supervive', 'supervive'],
  ['image-helldivers2', 'helldivers-2'],
];

describe('visibleImageSets', () => {
  it('returns only image-reachthefinals and image-overwatch, in config order, when called', () => {
    expect(visibleImageSets().map(([packageName]) => packageName)).toEqual(['image-reachthefinals', 'image-overwatch']);
  });
});

describe('rankPageTitle with rankPageNames', () => {
  const names = rankPageNames();

  it('returns <set> - <tag> when the path names a set by package name or display-name slug and a tag', () => {
    expect(rankPageTitle('/rank/overwatch/tank', names)).toBe('OVERWATCH - Tank');
    expect(rankPageTitle('/rank/image-overwatch/tank/', names)).toBe('OVERWATCH - Tank');
    expect(rankPageTitle('/rank/the-finals/all', names)).toBe('THE FINALS - All Items');
    expect(rankPageTitle('/rank/wuthering-waves/c-all', names)).toMatch(/^WUTHERING WAVES - /);
  });

  it('returns the set name, or Custom Tier List, when the tag or the set is unknown', () => {
    expect(rankPageTitle('/rank/overwatch/unknown-tag', names)).toBe('OVERWATCH');
    expect(rankPageTitle('/rank/overwatch', names)).toBe('OVERWATCH');
    expect(rankPageTitle('/rank', names)).toBe('Custom Tier List');
    expect(rankPageTitle('/rank/constructor/__proto__', names)).toBe('Custom Tier List');
    expect(rankPageTitle('javascript:alert(1)', names)).toBe('Custom Tier List');
  });
});

describe('sitemap', () => {
  const urls = sitemap().map((entry) => entry.url);

  it('returns the /rank pages and the landing pages of the official sets when called', () => {
    expect(urls).toContain('https://opentierboy.com/rank/the-finals/all');
    expect(urls).toContain('https://opentierboy.com/rank/image-reachthefinals/light');
    expect(urls).toContain('https://opentierboy.com/overwatch');
  });

  it('returns no URL of a legacy set when called', () => {
    for (const [packageName, slug] of LEGACY) {
      const found = urls.filter((url) => url.includes(`/${packageName}/`) || url.includes(`/${slug}/`) || url.endsWith(`/${slug}`));
      expect(found, packageName).toEqual([]);
    }
  });
});
