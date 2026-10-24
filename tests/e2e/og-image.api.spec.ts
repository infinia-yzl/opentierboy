import {expect, SHARED_LINKS, test} from '../support/test';

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
});

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
