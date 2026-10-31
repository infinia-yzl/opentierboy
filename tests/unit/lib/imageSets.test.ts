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
  it('lists the official sets only, in config order', () => {
    expect(visibleImageSets().map(([packageName]) => packageName)).toEqual(['image-reachthefinals', 'image-overwatch']);
  });
});

describe('rankPageTitle with rankPageNames', () => {
  const names = rankPageNames();

  it('names a page as the editor does: "<set> - <tag>", by package name or display name slug', () => {
    expect(rankPageTitle('/rank/overwatch/tank', names)).toBe('OVERWATCH - Tank');
    expect(rankPageTitle('/rank/image-overwatch/tank/', names)).toBe('OVERWATCH - Tank');
    expect(rankPageTitle('/rank/the-finals/all', names)).toBe('THE FINALS - All Items');
    expect(rankPageTitle('/rank/wuthering-waves/c-all', names)).toMatch(/^WUTHERING WAVES - /);
  });

  it('falls back to the set name, then to "Custom Tier List"', () => {
    expect(rankPageTitle('/rank/overwatch/unknown-tag', names)).toBe('OVERWATCH');
    expect(rankPageTitle('/rank/overwatch', names)).toBe('OVERWATCH');
    expect(rankPageTitle('/rank', names)).toBe('Custom Tier List');
    expect(rankPageTitle('/rank/constructor/__proto__', names)).toBe('Custom Tier List');
    expect(rankPageTitle('javascript:alert(1)', names)).toBe('Custom Tier List');
  });
});

describe('sitemap', () => {
  const urls = sitemap().map((entry) => entry.url);

  it('lists the pages of the official sets', () => {
    expect(urls).toContain('https://opentierboy.com/rank/the-finals/all');
    expect(urls).toContain('https://opentierboy.com/rank/image-reachthefinals/light');
    expect(urls).toContain('https://opentierboy.com/overwatch');
  });

  it('leaves the legacy sets out', () => {
    for (const [packageName, slug] of LEGACY) {
      const found = urls.filter((url) => url.includes(`/${packageName}/`) || url.includes(`/${slug}/`) || url.endsWith(`/${slug}`));
      expect(found, packageName).toEqual([]);
    }
  });
});
