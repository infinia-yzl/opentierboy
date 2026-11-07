import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import LZString from 'lz-string';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {makePng} from '../../../support/png-helpers';

/**
 * The preview route as chat apps call it, with fetch stubbed: the route's own files (its fonts)
 * come from disk, `data:` URLs (next/og's own code) load as usual, and every other address is
 * recorded and answers with a picture. So a test sees every request the route makes, and any
 * image it loaded would show in the preview.
 *
 * Owner decision (2026-11-01): link previews draw only image-set pictures. Everything else is
 * a placeholder or label tile, and the server never fetches a user's address.
 */

const v3 = (json: unknown) => `3.${LZString.compressToEncodedURIComponent(JSON.stringify(json))}`;
const PICTURE = makePng(8, 8, 7);

const realFetch = globalThis.fetch;
let requests: string[];

beforeEach(() => {
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith('file:')) return new Response(new Uint8Array(await fs.readFile(fileURLToPath(url))));
    if (url.startsWith('data:')) return realFetch(url);
    requests.push(url);
    return new Response(PICTURE as BodyInit, {headers: {'content-type': 'image/png'}});
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The preview PNG of a v3 list with Mauga and the given items in S. */
async function preview(items: unknown[]): Promise<Buffer> {
  const {GET} = await import('@/app/api/og/route');
  const state = v3({t: 'Preview', tp: 3, r: [['S', ['image-overwatch-mau.webp', ...items]], ['A', []], ['B', []], ['', []]]});
  const response = await GET(new Request(`http://localhost:3000/api/og?state=${encodeURIComponent(state)}`));
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  return Buffer.from(await response.arrayBuffer());
}

describe('GET /api/og', () => {
  it('writes no request to a link image address and renders label tiles when the list has Imgur and other link images', async () => {
    const linked = await preview([
      {u: 'https://i.imgur.com/trusted.png', c: 'Imgur'},
      {u: 'https://images.example.org/other.png', c: 'Other'},
    ]);
    const linkRequests = [...requests];

    requests = [];
    // Device images are label tiles: the server never has them.
    const labelTiles = await preview([{d: 'abcdef0123456789', c: 'Imgur'}, {d: 'fedcba9876543210', c: 'Other'}]);

    expect(linkRequests.filter((url) => !url.startsWith('http://localhost:3000/')), 'requests to user addresses').toEqual([]);
    expect(linked.equals(labelTiles), 'link images are drawn as label tiles').toBe(true);
  }, 60_000);

  it('writes requests only for the logo and the image-set pictures when the list has only image-set items', async () => {
    await preview(['image-overwatch-win.webp']);

    expect(requests.sort()).toEqual([
      'http://localhost:3000/brand/otb-logo-wide.png',
      'http://localhost:3000/images/image-overwatch/mau.png',
      'http://localhost:3000/images/image-overwatch/win.png',
    ]);
  }, 60_000);
});
