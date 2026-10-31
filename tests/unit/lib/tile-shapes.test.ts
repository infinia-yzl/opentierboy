import LZString from 'lz-string';
import {describe, expect, it} from 'vitest';
import {createTierCortex} from '@/lib/TierCortex';
import {encodeTierStateForURL} from '@/lib/listLink';
import imagesetConfig from '@/imageset.config.json';
import ImageSetConfig from '@/models/ImageSet';
import {DEFAULT_ITEM_SHAPE, isItemShape, itemShape} from '@/models/Item';
import {buildPackageEntry, imageShape, SHAPES, tagShape} from '@/scripts/lib/image-sets.mjs';

/**
 * Tile shapes (square, landscape, portrait) travel from the image set packages through
 * scripts/prepareImages.js and imageset.config.json to the items TierCortex resolves. No
 * published set uses a non-square shape yet, so these tests use a made-up config. Tiles render
 * at their shape since the drag and drop update (revamp Phase 5e, lib/tileSize.ts).
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

describe('createTierCortex with tile shapes', () => {
  const cortex = createTierCortex({imageSetConfig: CONFIG, aliases: {'image-mixed-old-map.webp': 'image-mixed-map.webp'}});

  it('returns the image shape, and square for uploads and unknown ids, when a link has image-set items', () => {
    const tiers = cortex.decodeTierStateFromURL(LINK)!.tiers;
    const shapes = tiers.map((tier) => tier.items.map((item) => [item.content, itemShape(item)]));
    expect(shapes).toEqual([
      [['Map', 'landscape'], ['Hero', 'portrait']],
      // The old id of Map points to Map, which is already in S, so it keeps only that place (A32).
      // Uploaded and unknown items are square.
      [['Icon', 'square'], ['my cat', 'square']],
    ]);
  });

  it('returns the shape of the alias target when a link names a renamed id', () => {
    const renamed = cortex.decodeTierStateFromURL(lz({tiers: [{i: 'tier-s', n: 'S', t: [{i: 'image-mixed-old-map.webp'}]}]}))!;
    expect(renamed.tiers[0].items.map((item) => [item.content, itemShape(item)])).toEqual([['Map', 'landscape']]);
  });

  it('returns shape only for landscape and portrait images when resolveItemsFromPackage runs', () => {
    const items = cortex.resolveItemsFromPackage('image-mixed', ['map.webp', 'icon.webp', 'boxed.webp', 'odd.webp']);
    expect(items.map((item) => item.shape)).toEqual(['landscape', undefined, undefined, undefined]);
    expect(items.map(itemShape)).toEqual(['landscape', 'square', 'square', 'square']);
  });

  it('returns the image shapes on items when getInitialTiers opens a template', () => {
    const tiers = cortex.getInitialTiers(undefined, {
      packageName: 'image-mixed', packageDisplayName: 'Mixed', tagName: 'all', tagTitle: 'All Items',
      images: ['hero.webp', 'icon.webp'],
    });
    expect(tiers.at(-1)!.items.map(itemShape)).toEqual(['portrait', 'square']);
  });

  it('returns a link with ids only and no shape when a list with shaped items is encoded', () => {
    const tiers = cortex.decodeTierStateFromURL(LINK)!.tiers;
    const encoded = encodeTierStateForURL('Shapes', tiers.map((tier) => ({
      ...tier,
      items: tier.items.map((item) => ({i: item.id, c: cortex.isCustomItem(item.id) ? item.content : undefined})),
    })));
    expect(LZString.decompressFromEncodedURIComponent(encoded)).not.toContain('shape');
    expect(LZString.decompressFromEncodedURIComponent(encoded)).not.toContain('landscape');
  });

  it('returns the shape and the PNG URL when getOgSafeItem gets a landscape item', () => {
    const [map] = cortex.resolveItemsFromPackage('image-mixed', ['map.webp']);
    expect(cortex.getOgSafeItem(map)).toMatchObject({shape: 'landscape', imageUrl: expect.stringMatching(/\/images\/image-mixed\/map\.png$/)});
  });

  it('returns the declared category shape when getCategoryShape runs, and square for none or unknown names', () => {
    expect(cortex.getCategoryShape('image-mixed', 'maps')).toBe('landscape');
    expect(cortex.getCategoryShape('image-mixed', 'heroes')).toBe('portrait');
    expect(cortex.getCategoryShape('image-mixed', 'icons')).toBe('square');
    expect(cortex.getCategoryShape('image-mixed', 'missing')).toBe('square');
    expect(cortex.getCategoryShape('image-mixed', 'constructor')).toBe('square');
    expect(cortex.getCategoryShape('image-unknown', 'maps')).toBe('square');
  });
});

describe('itemShape', () => {
  it('returns square when the shape is missing or unknown', () => {
    expect(DEFAULT_ITEM_SHAPE).toBe('square');
    expect(itemShape({})).toBe('square');
    expect(itemShape({shape: 'hexagon' as never})).toBe('square');
    expect(isItemShape('portrait')).toBe(true);
    expect(isItemShape('Portrait')).toBe(false);
  });

  it('returns true from isItemShape when called with each shape in SHAPES of scripts/lib/image-sets.mjs', () => {
    expect(SHAPES.filter(isItemShape)).toEqual(SHAPES);
  });
});

describe('buildPackageEntry, imageShape and tagShape (scripts/lib/image-sets.mjs)', () => {
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

// Guard test. Tiles render landscape and portrait shapes since revamp Phase 5e, but link
// previews (app/api/og) still draw every image as a square and crop it. Remove this block when
// the owner lets image sets publish other shapes (docs/setup-checklist.md).
describe('imageset.config.json while link previews draw squares', () => {
  // Image sets must not publish other shapes until then (docs/setup-checklist.md).
  it('returns no shaped image or category when imageset.config.json is read', () => {
    const packages = (imagesetConfig as ImageSetConfig).packages;
    const shaped = Object.entries(packages).flatMap(([name, set]) => [
      ...set.images.filter((image) => image.shape !== undefined).map((image) => `${name}-${image.filename}: ${image.shape}`),
      ...Object.entries(set.tags).filter(([, tag]) => tag.shape !== undefined).map(([tag, data]) => `${name} tag ${tag}: ${data.shape}`),
    ]);
    expect(shaped).toEqual([]);
  });
});
