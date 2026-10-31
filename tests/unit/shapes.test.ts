import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import TierCortex from '@/lib/TierCortex';
import imagesetConfig from '@/imageset.config.json';
import ImageSetConfig from '@/models/ImageSet';
import {DEFAULT_ITEM_SHAPE, isItemShape, itemShape} from '@/models/Item';
import {buildPackageEntry, imageShape, SHAPES, tagShape} from '@/scripts/lib/image-sets.mjs';

/**
 * Tile shapes (square, landscape, portrait) travel from the image set packages through
 * scripts/prepareImages.js and imageset.config.json to the items TierCortex resolves. No
 * published set uses a non-square shape yet, so these tests use a made-up config. Tiles still
 * render square until the drag and drop update (revamp Phase 5e).
 */

const CONFIG = {
  packages: {
    'image-mixed': {
      displayName: 'Mixed',
      images: [
        {filename: 'map.webp', label: 'Map', tags: ['maps'], shape: 'landscape'},
        {filename: 'hero.webp', label: 'Hero', tags: ['heroes'], shape: 'portrait'},
        {filename: 'icon.webp', label: 'Icon', tags: ['icons']},
        {filename: 'boxed.webp', label: 'Boxed', tags: ['icons'], shape: 'square'},
        {filename: 'odd.webp', label: 'Odd', tags: ['icons'], shape: 'hexagon'},
      ],
      tags: {
        maps: {title: 'Maps', description: 'Maps', category: 'general', shape: 'landscape'},
        heroes: {title: 'Heroes', description: 'Heroes', category: 'general', shape: 'portrait'},
        icons: {title: 'Icons', description: 'Icons', category: 'general'},
      },
    },
  },
} as unknown as ImageSetConfig;

const lz = (value: unknown) => LZString.compressToEncodedURIComponent(JSON.stringify(value));
const LINK = lz({title: 'Shapes', tiers: [
  {i: 'tier-s', n: 'S', t: [{i: 'image-mixed-map.webp'}, {i: 'image-mixed-hero.webp'}]},
  {i: 'uncategorized', n: '', t: [{i: 'image-mixed-icon.webp'}, {i: 'image-mixed-old-map.webp'}, {i: 'k3j9x0a1b', c: 'my cat'}]},
]});

describe('TierCortex with tile shapes', () => {
  const cortex = new TierCortex({imageSetConfig: CONFIG, aliases: {'image-mixed-old-map.webp': 'image-mixed-map.webp'}});

  it('gives package items the shape of their image, and square by default', () => {
    const tiers = cortex.decodeTierStateFromURL(LINK)!.tiers;
    const shapes = tiers.map((tier) => tier.items.map((item) => [item.content, itemShape(item)]));
    expect(shapes).toEqual([
      [['Map', 'landscape'], ['Hero', 'portrait']],
      // A renamed item takes the shape of the image it now points to. Uploaded and unknown items are square.
      [['Icon', 'square'], ['Map', 'landscape'], ['my cat', 'square']],
    ]);
  });

  it('stores only shapes other than square on items, and ignores unknown shapes', () => {
    const items = cortex.resolveItemsFromPackage('image-mixed', ['map.webp', 'icon.webp', 'boxed.webp', 'odd.webp']);
    expect(items.map((item) => item.shape)).toEqual(['landscape', undefined, undefined, undefined]);
    expect(items.map(itemShape)).toEqual(['landscape', 'square', 'square', 'square']);
  });

  it('keeps shapes when a template opens', () => {
    const tiers = cortex.getInitialTiers(undefined, {
      packageName: 'image-mixed', packageDisplayName: 'Mixed', tagName: 'all', tagTitle: 'All Items',
      images: ['hero.webp', 'icon.webp'],
    });
    expect(tiers.at(-1)!.items.map(itemShape)).toEqual(['portrait', 'square']);
  });

  it('keeps shapes out of links: a link holds item ids only', () => {
    const tiers = cortex.decodeTierStateFromURL(LINK)!.tiers;
    const encoded = TierCortex.encodeTierStateForURL('Shapes', tiers.map((tier) => ({
      ...tier,
      items: tier.items.map((item) => ({i: item.id, c: cortex.isCustomItem(item.id) ? item.content : undefined})),
    })));
    expect(LZString.decompressFromEncodedURIComponent(encoded)).not.toContain('shape');
    expect(LZString.decompressFromEncodedURIComponent(encoded)).not.toContain('landscape');
  });

  it('keeps the shape on the item that link previews draw', () => {
    const [map] = cortex.resolveItemsFromPackage('image-mixed', ['map.webp']);
    expect(cortex.getOgSafeItem(map)).toMatchObject({shape: 'landscape', imageUrl: expect.stringMatching(/\/images\/image-mixed\/map\.png$/)});
  });

  it('reports the shape a category declares, and square otherwise', () => {
    expect(cortex.getCategoryShape('image-mixed', 'maps')).toBe('landscape');
    expect(cortex.getCategoryShape('image-mixed', 'heroes')).toBe('portrait');
    expect(cortex.getCategoryShape('image-mixed', 'icons')).toBe('square');
    expect(cortex.getCategoryShape('image-mixed', 'missing')).toBe('square');
    expect(cortex.getCategoryShape('image-mixed', 'constructor')).toBe('square');
    expect(cortex.getCategoryShape('image-unknown', 'maps')).toBe('square');
  });
});

describe('itemShape', () => {
  it('treats a missing or unknown shape as square', () => {
    expect(DEFAULT_ITEM_SHAPE).toBe('square');
    expect(itemShape({})).toBe('square');
    expect(itemShape({shape: 'hexagon' as never})).toBe('square');
    expect(isItemShape('portrait')).toBe(true);
    expect(isItemShape('Portrait')).toBe(false);
  });

  it('knows the same shapes as scripts/prepareImages.js', () => {
    expect(SHAPES.filter(isItemShape)).toEqual(SHAPES);
  });
});

describe('scripts/prepareImages.js shapes (scripts/lib/image-sets.mjs)', () => {
  const tags = {
    maps: {name: 'maps', title: 'Maps', description: 'Maps', shape: 'landscape'},
    heroes: {name: 'heroes', title: 'Heroes', description: 'Heroes', shape: 'portrait'},
    icons: {name: 'icons', title: 'Icons', description: 'Icons', shape: 'square'},
    plain: {name: 'plain', title: 'Plain', description: 'Plain'},
  };

  it('writes the shape of each image (image-set 2.2.0 resolves it per image), omitting square', () => {
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

  it('falls back to the first tag with a shape when the package has no per-image shapes', () => {
    expect(imageShape('image-mixed', {filename: 'a.webp', tags: [tags.plain, tags.heroes, tags.maps]})).toBe('portrait');
    expect(imageShape('image-mixed', {filename: 'a.webp', tags: [tags.icons, tags.maps]})).toBeUndefined();
    expect(imageShape('image-mixed', {filename: 'a.webp', tags: [tags.plain]})).toBeUndefined();
    expect(imageShape('image-mixed', undefined)).toBeUndefined();
  });

  it('stops on an unknown shape', () => {
    expect(() => imageShape('image-mixed', {filename: 'a.webp', shape: 'round', tags: []})).toThrow('image "a.webp" has the unknown shape "round"');
    expect(() => tagShape('image-mixed', {name: 'maps', shape: 'wide'})).toThrow('tag "maps" has the unknown shape "wide"');
  });
});

// Guard test: revamp Phase 5e removes this describe block when tiles render landscape and portrait shapes.
describe('imageset.config.json before the drag and drop update', () => {
  // Tiles and link previews draw every image as a square until revamp Phase 5e. Image sets
  // must not publish other shapes before then (docs/setup-checklist.md).
  it('has only square images and categories', () => {
    const packages = (imagesetConfig as ImageSetConfig).packages;
    const shaped = Object.entries(packages).flatMap(([name, set]) => [
      ...set.images.filter((image) => image.shape !== undefined).map((image) => `${name}-${image.filename}: ${image.shape}`),
      ...Object.entries(set.tags).filter(([, tag]) => tag.shape !== undefined).map(([tag, data]) => `${name} tag ${tag}: ${data.shape}`),
    ]);
    expect(shaped).toEqual([]);
  });
});
