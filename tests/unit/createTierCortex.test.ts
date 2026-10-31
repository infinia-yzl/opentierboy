import {afterEach, describe, expect, it, vi} from 'vitest';
import {createTierCortex} from '@/lib/TierCortex';
import {isCustomItem, packageItemLookup, resolveItemsFromPackage} from '@/lib/packageItems';
import {getOgTierGradient} from '@/lib/linkPreview';
import imagesetConfig from '@/imageset.config.json';
import ImageSetConfig from '@/models/ImageSet';

/**
 * TierCortex is a factory (A47): createTierCortex binds the functions of lib/packageItems.ts,
 * lib/listLink.ts and lib/linkPreview.ts to one configuration (aliases, image-set config, base
 * URL). The item lookup is built once per image-set config and shared by every TierCortex.
 */

const APP_CONFIG = imagesetConfig as ImageSetConfig;
const TINY_CONFIG = {
  packages: {
    'image-tiny': {
      displayName: 'Tiny',
      images: [{filename: 'one.webp', label: 'One', tags: ['all']}],
      tags: {all: {title: 'All', description: 'All', category: 'general'}},
    },
  },
} as unknown as ImageSetConfig;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('createTierCortex', () => {
  it('builds the item lookup once per image-set config and shares it', () => {
    expect(packageItemLookup(APP_CONFIG)).toBe(packageItemLookup(APP_CONFIG));
    expect(packageItemLookup(TINY_CONFIG)).toBe(packageItemLookup(TINY_CONFIG));
    // Another config object, even with the same content, gets its own lookup.
    const copy = structuredClone(TINY_CONFIG);
    expect(packageItemLookup(copy)).not.toBe(packageItemLookup(TINY_CONFIG));
    expect(packageItemLookup(copy).get('image-tiny-one.webp')).toEqual(packageItemLookup(TINY_CONFIG).get('image-tiny-one.webp'));

    const [first] = createTierCortex().resolveItemsFromPackage('image-overwatch', ['mau.webp']);
    const [second] = createTierCortex().resolveItemsFromPackage('image-overwatch', ['mau.webp']);
    expect(first).toEqual({id: 'image-overwatch-mau.webp', content: 'Mauga', imageUrl: '/images/image-overwatch/mau.webp'});
    expect(second).toBe(first);
  });

  it('hands out the shared lookup read-only, with get and has only', () => {
    const lookup = packageItemLookup(TINY_CONFIG);
    expect(Object.keys(lookup).sort()).toEqual(['get', 'has']);
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(lookup.has('image-tiny-one.webp')).toBe(true);
    expect(lookup.get('image-tiny-one.webp')).toEqual({id: 'image-tiny-one.webp', content: 'One', imageUrl: '/images/image-tiny/one.webp'});
    // Ids named like built-in object members find nothing, like any unknown id.
    for (const id of ['constructor', '__proto__', 'toString', 'set', 'clear']) {
      expect(lookup.has(id), id).toBe(false);
      expect(lookup.get(id), id).toBeUndefined();
    }
  });

  it('freezes the shared items and the TierCortex itself', () => {
    const cortex = createTierCortex();
    const [item] = cortex.resolveItemsFromPackage('image-overwatch', ['mau.webp']);
    expect(Object.isFrozen(item)).toBe(true);
    expect(Object.isFrozen(cortex)).toBe(true);
    expect(() => {
      (item as {content: string}).content = 'changed';
    }).toThrow(TypeError);
    expect(createTierCortex().resolveItemsFromPackage('image-overwatch', ['mau.webp'])[0].content).toBe('Mauga');
  });

  it('keeps injected aliases and configs to the TierCortex that received them', () => {
    const aliased = createTierCortex({aliases: {'image-overwatch-old-mauga.webp': 'image-overwatch-mau.webp'}});
    const plain = createTierCortex();
    expect(aliased.resolveItemsFromPackage('image-overwatch', ['old-mauga.webp'])[0].content).toBe('Mauga');
    expect(plain.resolveItemsFromPackage('image-overwatch', ['old-mauga.webp'])[0]).toEqual(
      {id: 'image-overwatch-old-mauga.webp', content: 'old-mauga', imageUrl: '/placeholder-image.png'});

    const tiny = createTierCortex({imageSetConfig: TINY_CONFIG});
    expect(tiny.isCustomItem('image-tiny-one.webp')).toBe(false);
    expect(tiny.isCustomItem('image-overwatch-mau.webp')).toBe(true);
    expect(plain.isCustomItem('image-tiny-one.webp')).toBe(true);
  });

  it('binds the plain functions to its configuration', () => {
    const aliases = {'image-tiny-old.webp': 'image-tiny-one.webp'};
    const catalog = {items: packageItemLookup(TINY_CONFIG), aliases};
    const cortex = createTierCortex({imageSetConfig: TINY_CONFIG, aliases});
    const files = ['one.webp', 'old.webp', 'gone.webp'];
    expect(cortex.resolveItemsFromPackage('image-tiny', files)).toStrictEqual(resolveItemsFromPackage(catalog, 'image-tiny', files));
    expect(cortex.isCustomItem('image-tiny-old.webp')).toBe(isCustomItem(catalog, 'image-tiny-old.webp'));
  });
});

describe('createTierCortex base URL', () => {
  const logo = 'brand/otb-logo-wide.png';

  it('uses http://localhost:3000 on a server outside Vercel', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    expect(createTierCortex().getAssetUrl(logo)).toBe('http://localhost:3000/brand/otb-logo-wide.png');
  });

  it('uses the production site on Vercel', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'opentierboy.com');
    const cortex = createTierCortex();
    expect(cortex.getAssetUrl(logo)).toBe('https://opentierboy.com/brand/otb-logo-wide.png');
    expect(cortex.getOgSafeImageUrl('/images/image-overwatch/mau.webp')).toBe('https://opentierboy.com/images/image-overwatch/mau.png');
  });

  it('uses the page origin in the browser', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'opentierboy.com');
    vi.stubGlobal('window', {location: {origin: 'https://preview.example'}});
    expect(createTierCortex().getAssetUrl(logo)).toBe('https://preview.example/brand/otb-logo-wide.png');
  });

  it('reads the base URL once, when the TierCortex is made, and takes one from the options', () => {
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'opentierboy.com');
    const cortex = createTierCortex();
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'elsewhere.example');
    expect(cortex.getAssetUrl(logo)).toBe('https://opentierboy.com/brand/otb-logo-wide.png');
    expect(createTierCortex({baseUrl: 'https://given.example'}).getOgSafeItem({id: 'x', content: 'X', imageUrl: '/placeholder-image.png'}))
      .toEqual({id: 'x', content: 'X', imageUrl: 'https://given.example/placeholder-image.preview.png'});
  });

  it('reads no browser global when the modules load (the edge OG route imports them)', async () => {
    vi.resetModules();
    vi.stubGlobal('window', new Proxy({}, {get: () => {
      throw new Error('window was read');
    }}));
    const fresh = await import('@/lib/TierCortex');
    await import('@/lib/listLink');
    await import('@/lib/linkPreview');
    await import('@/lib/packageItems');
    // With a base URL in the options, making a TierCortex reads no global either.
    expect(fresh.createTierCortex({baseUrl: 'https://given.example'}).getAssetUrl(logo)).toBe('https://given.example/brand/otb-logo-wide.png');
    expect(() => fresh.createTierCortex()).toThrow('window was read');
  });
});

describe('getOgTierGradient', () => {
  it('colours the rows of a preview, with a light grey Unranked row', () => {
    const gradients = Array.from({length: 9}, (_, index) => getOgTierGradient(index, 9));
    expect(gradients[8]).toBe('linear-gradient(to right, #f0f0f0, #f0f0f0)');
    expect(gradients[0]).toBe('linear-gradient(to right, #d21203, #c40a01)');
    expect(gradients[7]).toBe(gradients[0]);
    expect(new Set(gradients.slice(0, 7)).size).toBe(7);
  });
});
