import {describe, expect, it} from 'vitest';
import sitemap from '@/app/sitemap';
import {visibleImageSets} from '@/lib/imageSets';

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
