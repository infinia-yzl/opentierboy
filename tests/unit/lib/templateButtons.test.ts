import {describe, expect, it} from 'vitest';
import imagesetConfig from '@/imageset.config.json';
import type ImageSetConfig from '@/models/ImageSet';
import type {ImageSetPackage} from '@/models/ImageSet';
import {roundedItemCount, templateButton, templateImages, templateTitle} from '@/lib/templateButtons';

const packages = (imagesetConfig as ImageSetConfig).packages;

/** A small image set: 3 tanks, 1 support, and a tag without images. */
const SET: Pick<ImageSetPackage, 'displayName' | 'images' | 'tags'> = {
  displayName: 'Test Heroes',
  images: [
    {filename: 'rei.webp', label: 'Reinhardt', tags: ['tank']},
    {filename: 'win.webp', label: 'Winston', tags: ['tank']},
    {filename: 'ana.webp', label: 'Ana', tags: ['sup']},
    {filename: 'dva.webp', label: '', tags: ['tank']},
  ],
  tags: {
    tank: {title: 'Tank', description: '', category: 'Role'},
    sup: {title: 'Support', description: '', category: 'Role'},
    none: {title: 'Nobody', description: '', category: 'Role'},
  },
};

describe('roundedItemCount', () => {
  it.each([
    [0, '0', '0 items'],
    [1, '1', '1 item'],
    [9, '9', '9 items'],
    [10, '10+', 'about 10 items'],
    [13, '10+', 'about 10 items'],
    [19, '10+', 'about 10 items'],
    [20, '20+', 'about 20 items'],
    [29, '20+', 'about 20 items'],
    [77, '70+', 'about 70 items'],
    [100, '100+', 'about 100 items'],
  ])('returns the text and label for %i items when the count is rounded down to the nearest 10', (count, text, label) => {
    expect(roundedItemCount(count)).toEqual({text, label});
  });

  it.each([-1, 2.5, Number.NaN])('throws RangeError when the count is %s', (count) => {
    expect(() => roundedItemCount(count)).toThrow(RangeError);
  });
});

describe('templateImages', () => {
  it('returns every image when the tag is all', () => {
    expect(templateImages(SET, 'all')).toHaveLength(4);
  });

  it('returns the images with the tag, in config order, when the tag is tank', () => {
    expect(templateImages(SET, 'tank').map((image) => image.filename)).toEqual(['rei.webp', 'win.webp', 'dva.webp']);
  });

  it('returns no image when no image has the tag', () => {
    expect(templateImages(SET, 'none')).toEqual([]);
    expect(templateImages(SET, 'unknown')).toEqual([]);
  });
});

describe('templateTitle', () => {
  it('returns All Items, the tag title, or the tag itself when the tag is all, known or unknown', () => {
    expect(templateTitle(SET, 'all')).toBe('All Items');
    expect(templateTitle(SET, 'sup')).toBe('Support');
    expect(templateTitle(SET, 'unknown')).toBe('unknown');
  });
});

describe('templateButton', () => {
  it('returns the title, editor path, count and accessible name when the tag is tank', () => {
    expect(templateButton('image-test', SET, 'tank')).toMatchObject({
      tag: 'tank',
      title: 'Tank',
      href: '/rank/test-heroes/tank',
      count: 3,
      countText: '3',
      ariaLabel: 'Tank, 3 items',
    });
  });

  it('returns the picture of the item the preview id names when the template has that item', () => {
    expect(templateButton('image-test', SET, 'tank', 'image-test-win.webp').preview).toEqual({src: '/images/image-test/win.webp', alt: 'Winston'});
  });

  it('returns the picture of the first item when the preview id names no item of the template', () => {
    expect(templateButton('image-test', SET, 'tank', 'image-test-gone.webp').preview).toEqual({src: '/images/image-test/rei.webp', alt: 'Reinhardt'});
    expect(templateButton('image-test', SET, 'tank', 'image-test-ana.webp').preview?.alt).toBe('Reinhardt');
    expect(templateButton('image-test', SET, 'all').preview?.alt).toBe('Reinhardt');
  });

  it('returns the file name as the picture text when the item has no label', () => {
    expect(templateButton('image-test', SET, 'tank', 'image-test-dva.webp').preview?.alt).toBe('dva');
  });

  it('returns no picture and 0 items when the template has no items', () => {
    expect(templateButton('image-test', SET, 'none')).toMatchObject({count: 0, countText: '0', ariaLabel: 'Nobody, 0 items', preview: null});
  });

  it('returns the count of the tag images in imageset.config.json when the set is an installed image set', () => {
    const finals = packages['image-reachthefinals'];
    const all = templateButton('image-reachthefinals', finals, 'all');
    expect(all.count).toBe(finals.images.length);
    expect(all.href).toBe('/rank/the-finals/all');
    const tank = templateButton('image-overwatch', packages['image-overwatch'], 'tank');
    expect(tank.count).toBe(packages['image-overwatch'].images.filter((image) => image.tags.includes('tank')).length);
    expect(tank.ariaLabel).toBe(`Tank, ${roundedItemCount(tank.count).label}`);
  });
});
