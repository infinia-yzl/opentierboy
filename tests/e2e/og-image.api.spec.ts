import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {expect, SHARED_LINKS, test} from '../support/test';
import {LEGACY_SETS, legacyItemIds, legacyItems, packageItemId, stateFromJson, v3State} from '../support/links';
import {lzBomb, lzWithRun} from '../unit/support/lzStream';

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

  test('a v3 link draws link and device images as label tiles and never loads their addresses (A8, A36)', async ({request}) => {
    // A server on a free port that counts every request it gets.
    const requests: string[] = [];
    const server = http.createServer((req, res) => {
      requests.push(`${req.headers.host}${req.url}`);
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const {port} = server.address() as AddressInfo;
    try {
      const preview = async (addresses: string[]) => {
        const json = {t: 'Link images', tp: 3, r: [
          ['S', [packageItemId('image-overwatch', 'Mauga'), ...addresses.map((u, index) => ({u, c: `Link ${index + 1}`}))]],
          ['A', [{d: 'k3j9x0a1b', c: 'Upload'}]], ['B', []], ['', []],
        ]};
        const response = await request.get(`/api/og?state=${encodeURIComponent(v3State(json))}`, {timeout: 10_000});
        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toBe('image/png');
        return response.body();
      };

      const local = await preview([
        `http://127.0.0.1:${port}/a36.png`,
        `http://localhost:${port}/a36.png`,
        // A real image of the app, on the address the preview route loads the app's own images from.
        'http://localhost:3000/images/image-overwatch/win.png',
      ]);
      const unreachable = await preview(['https://unreachable.invalid/1.png', 'https://unreachable.invalid/2.png', 'https://unreachable.invalid/3.png']);

      expect(pngSize(unreachable)).toEqual({width: 1200, height: 630});
      expect(unreachable.equals(defaultImage), 'preview should show the ranking').toBe(false);
      // A label tile shows only the label, so the same labels give the same picture whatever the
      // address. Had the route loaded the app's own Winston image, the first preview would differ.
      expect(local.equals(unreachable), 'link images are label tiles').toBe(true);
      expect(requests, 'no request reaches a link image address').toEqual([]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  /** The preview of a 3-row v3 list with Mauga and the given link images in S. */
  async function linkImagePreview(request: import('@playwright/test').APIRequestContext, images: {u: string; c?: string}[]) {
    const json = {t: 'Link images', tp: 3, r: [['S', [packageItemId('image-overwatch', 'Mauga'), ...images]], ['A', []], ['B', []], ['', []]]};
    const response = await request.get(`/api/og?state=${encodeURIComponent(v3State(json))}`, {timeout: 15_000});
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    return response.body();
  }

  test('an image from a site that is not trusted is a label tile, whatever its address (A8)', async ({request}) => {
    const first = await linkImagePreview(request, [{u: 'https://images.example.org/a.png', c: 'Cat'}]);
    const second = await linkImagePreview(request, [{u: 'https://cdn.example.net/b.jpg', c: 'Cat'}]);
    expect(first.equals(defaultImage), 'preview should show the ranking').toBe(false);
    expect(first.equals(second), 'only the label is drawn').toBe(true);
    // A link image without a label shows its site's name: another picture than with a label.
    const unlabelled = await linkImagePreview(request, [{u: 'https://images.example.org/a.png'}]);
    expect(unlabelled.equals(first)).toBe(false);
  });

  test('a link with a tier name that is an object still gets a preview image', async ({request}) => {
    const json = {title: 'Bad tier name', tiers: [{i: 'tier-s', n: {text: 'S'}, t: [{i: 'image-overwatch-mau.webp'}]}, UNRANKED]};
    const response = await request.get(previewPath(json), {timeout: 10_000});

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    const image = await response.body();
    expect(pngSize(image)).toEqual({width: 1200, height: 630});
    // The link breaks the type checks (A29), so it gets the preview of a link that does not decode.
    expect(image.equals(defaultImage), 'default preview').toBe(true);
  });

  // Links made to hang or crash the server (A29). Each one must get the default preview quickly,
  // and the server must keep answering other requests. The links are built here in milliseconds
  // (tests/unit/support/lzStream.ts); lz-string itself would take seconds to compress them.
  const HOSTILE_TIMEOUT = 5_000;
  const hostileLinks = [
    {name: 'a 5-million-character tier name', state: () => lzWithRun(HUGE_NAME_JSON, 'x', 5_000_000).input},
    {name: 'data that expands to 12 million characters', state: () => lzBomb(5_000).input},
    {name: 'no tiers', state: () => stateFromJson({tiers: []})},
    {name: 'a title that is an object', state: () => stateFromJson({title: {text: 'x'}, tiers: [UNRANKED]})},
    // The same id 5,001 times keeps the link short (the item cap counts before duplicates go).
    {name: 'more items than any list can hold', state: () => stateFromJson({tiers: [
      {i: 'tier-s', n: 'S', t: Array.from({length: 5_001}, () => ({i: 'x'}))}, UNRANKED,
    ]})},
  ];
  for (const link of hostileLinks) {
    test(`a link with ${link.name} gets the default preview quickly`, async ({request}) => {
      const response = await request.get(`/api/og?state=${encodeURIComponent(link.state())}`, {timeout: HOSTILE_TIMEOUT});

      expect(response.status()).toBe(200);
      expect((await response.body()).equals(defaultImage), 'default preview').toBe(true);
      const next = await request.get(previewPath(oddIdLink('unknown-item-x')), {timeout: HOSTILE_TIMEOUT});
      expect(next.status(), 'the server still answers').toBe(200);
    });
  }
});

/**
 * Lists at the limits that a link may hold (lib/legacyLinkLimits.ts: 100 rows, text of any
 * length within 1,000,000 characters of JSON). Each one must get its preview quickly, while
 * a plain preview request at the same time answers quickly too (A43). The texts repeat, so
 * the links stay short enough for a URL.
 *
 * Image tiles: the preview draws at most 7 rows of 10 tiles (an 8th row made it take about 9 s),
 * from PNG copies made at preview size (scripts/prepareImages.js), so even rows full of the
 * largest legacy images (up to 4 megapixels as WebP) stay fast.
 */
const ROWS_AT_LIMIT = 99; // plus the Unranked row: 100 rows
const listAtLimit = (title: string, row: (index: number) => object) => ({
  title,
  tiers: [...Array.from({length: ROWS_AT_LIMIT}, (_, index) => row(index)), UNRANKED_FOR_LIMITS],
});
const listsAtLimits = [
  {name: '100 short, empty rows', json: () => listAtLimit('Many rows', (index) => ({i: `t${index}`, n: `R${index}`, t: []}))},
  {
    name: '100 rows, each with an item with a 4,800-character label',
    json: () => listAtLimit('Long labels', (index) => ({i: `t${index}`, n: `R${index}`, t: [{i: `r${index}`, c: 'Label '.repeat(800)}]})),
  },
  {
    // The legacy sets with the largest images first: all their tiles that the preview draws.
    name: '100 rows, the first ones full of the largest legacy images',
    json: () => {
      const ids = ['image-set', 'image-webdev', 'image-helldivers2'].flatMap(legacyItemIds);
      return listAtLimit('Large images', (index) => ({i: `t${index}`, n: `R${index}`, t: ids.slice(index * 11, index * 11 + 11).map((i) => ({i}))}));
    },
  },
  {
    name: '100 rows of 10 unknown items, drawn as placeholder tiles',
    json: () => listAtLimit('Unknown items', (index) => ({i: `t${index}`, n: `R${index}`, t: Array.from({length: 11}, (_, item) => ({i: `r${index}i${item}`}))})),
  },
  {
    name: '100 rows with 5,000-character names and a 90,000-character title',
    json: () => listAtLimit('Title '.repeat(15_000), (index) => ({i: `t${index}`, n: 'Name '.repeat(1_000), t: [{i: 'image-overwatch-mau.webp'}]})),
  },
];

test.describe('Link previews at the limits', () => {
  test.skip(({baseURL}) => isLocalServerNotOnPort3000(baseURL),
    'Preview images need the local server on port 3000, see TierCortex.baseUrl.');

  for (const list of listsAtLimits) {
    test(`a list with ${list.name} gets its preview quickly`, async ({request}) => {
      const [preview, plain] = await Promise.all([
        request.get(previewPath(list.json()), {timeout: 5_000}),
        request.get('/api/og', {timeout: 5_000}),
      ]);

      expect(preview.status()).toBe(200);
      expect(preview.headers()['content-type']).toBe('image/png');
      const image = await preview.body();
      expect(pngSize(image)).toEqual({width: 1200, height: 630});
      expect(image.equals(await plain.body()), 'preview should show the ranking').toBe(false);
      expect(plain.status(), 'a plain preview at the same time').toBe(200);
    });
  }
});

const UNRANKED_FOR_LIMITS = {i: 'uncategorized', n: '', t: []};

/** A list whose tier name is the run of characters that lzWithRun() writes in place of {run}. */
const HUGE_NAME_JSON = '{"tiers":[{"i":"tier-s","n":"{run}","t":[]},{"i":"uncategorized","n":"","t":[]}]}';

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
