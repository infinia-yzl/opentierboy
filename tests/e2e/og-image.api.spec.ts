import {expect, SHARED_LINKS, test} from '../support/test';
import {LEGACY_SETS, legacyItems, packageItemId, stateFromJson} from '../support/links';

/**
 * The preview image that chat apps and social sites show for a shared link.
 * These tests call the API directly, so they run once and need no browser.
 */
test.describe('Link preview images', () => {
  // The preview route loads item images from http://localhost:3000 when it runs outside
  // Vercel (TierCortex.baseUrl). A local server on any other port cannot draw a ranking.
  test.skip(({baseURL}) => isLocalServerNotOnPort3000(baseURL),
    'Preview images need the local server on port 3000, see TierCortex.baseUrl.');

  let defaultImage: Buffer;

  test.beforeAll(async ({request}) => {
    const response = await request.get('/api/og');
    expect(response.ok()).toBe(true);
    defaultImage = await response.body();
  });

  test('without a ranking, the default preview is a 1200×630 PNG', async ({request}) => {
    const response = await request.get('/api/og');

    expect(response.headers()['content-type']).toBe('image/png');
    expect(pngSize(await response.body())).toEqual({width: 1200, height: 630});
  });

  for (const link of SHARED_LINKS) {
    test(`${link.id} (${link.format}) renders its own preview`, async ({request}) => {
      const response = await request.get(`/api/og?state=${encodeURIComponent(link.state)}`);

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/png');
      const image = await response.body();
      expect(pngSize(image)).toEqual({width: 1200, height: 630});
      // A link that fails to decode falls back to the default image.
      expect(image.equals(defaultImage), 'preview should show the ranking').toBe(false);
    });
  }

  test('a link with items from the legacy sets draws their images', async ({request}) => {
    // Legacy images are committed in public/images/<package>/; the build makes the PNG copies the preview loads.
    const ids = LEGACY_SETS.flatMap((set) => legacyItems(set.packageName).slice(0, 2).map((label) => packageItemId(set.packageName, label)));
    const preview = async (itemIds: string[]) => {
      const json = {title: 'Legacy sets', tiers: [{i: 'tier-s', n: 'S', t: itemIds.map((i) => ({i}))}, {i: 'uncategorized', n: '', t: []}]};
      const response = await request.get(`/api/og?state=${encodeURIComponent(stateFromJson(json))}`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/png');
      return response.body();
    };

    const image = await preview(ids);
    expect(pngSize(image)).toEqual({width: 1200, height: 630});
    expect(image.equals(defaultImage), 'preview should show the ranking').toBe(false);
    // The same items in reverse order give a different picture only if the tiles show their
    // own images. Missing images would all be drawn as the same empty tile.
    const reversed = await preview([...ids].reverse());
    expect(image.equals(reversed), 'tiles should show the item images').toBe(false);
  });

  test('a link with an unknown item id gets a preview with a placeholder tile', async ({request}) => {
    const response = await request.get(previewPath(oddIdLink('unknown-item-x')));

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    const image = await response.body();
    expect(pngSize(image)).toEqual({width: 1200, height: 630});
    expect(image.equals(defaultImage), 'preview should show the ranking').toBe(false);
  });

  // Names that every JavaScript object has, used as item ids (see shared-links.spec.ts).
  for (const id of ['constructor', 'toString', '__proto__']) {
    test(`a link with an item with the id "${id}" gets the same preview as an unknown item`, async ({request}) => {
      const unknown = await request.get(previewPath(oddIdLink('unknown-item-x')));
      const odd = await request.get(previewPath(oddIdLink(id)), {timeout: 10_000});

      expect(odd.status()).toBe(200);
      expect((await odd.body()).equals(await unknown.body()), 'same preview as an unknown item').toBe(true);
    });
  }

  /**
   * Known bugs. Each test describes the correct behaviour and is marked `test.fail`, so the
   * suite stays green while the bug exists. When a fix lands, the test starts to pass,
   * Playwright reports "Expected to fail, but passed", and the marker must be removed.
   */
  test.describe('Known bugs', () => {
    test('a link with a tier name that is an object still gets a preview image', async ({request}) => {
      test.fail(true, 'The route draws the tier name as text, and an object there aborts the response.');
      const json = {title: 'Bad tier name', tiers: [{i: 'tier-s', n: {text: 'S'}, t: [{i: 'image-overwatch-mau.webp'}]}, UNRANKED]};
      const response = await request.get(previewPath(json), {timeout: 10_000});

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('image/png');
      expect(pngSize(await response.body())).toEqual({width: 1200, height: 630});
    });
  });
});

const UNRANKED = {i: 'uncategorized', n: '', t: [{i: 'image-overwatch-win.webp'}]};

/** A titled list with Mauga and one more item, labelled "Mystery", in S. */
function oddIdLink(itemId: string) {
  return {title: 'Odd item ids', tiers: [{i: 'tier-s', n: 'S', t: [{i: 'image-overwatch-mau.webp'}, {i: itemId, c: 'Mystery'}]}, UNRANKED]};
}

function previewPath(json: unknown) {
  return `/api/og?state=${encodeURIComponent(stateFromJson(json))}`;
}

function isLocalServerNotOnPort3000(baseURL: string | undefined) {
  if (!baseURL) return false;
  const url = new URL(baseURL);
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return isLocal && url.port !== '3000';
}

/** Reads the width and height from a PNG header. */
function pngSize(png: Buffer) {
  expect(png.subarray(1, 4).toString('ascii'), 'PNG signature').toBe('PNG');
  return {width: png.readUInt32BE(16), height: png.readUInt32BE(20)};
}
