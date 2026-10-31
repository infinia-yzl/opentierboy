/** HTTP answers of /rank paths: status codes, redirects and the page the server sends. */
import {expect, test} from '../support/test';
import {LEGACY_SETS, rankingState} from '../support/links';
import {lzWithRun} from '../unit/support/lzStream';

/**
 * The HTTP answers of /rank paths (proxy.ts, lib/rankRoute.ts). The editor page streams, and a
 * streamed page answers 200 whatever it renders, so these tests check the status itself: a
 * browser test would pass with a client-side redirect too.
 */
test.describe('/rank status codes', () => {
  test('templates and /rank answer 200', async ({request}) => {
    for (const path of ['/rank', '/rank/overwatch/tank', '/rank/image-overwatch/all', '/rank/the-finals/all']) {
      const response = await request.get(path, {maxRedirects: 0});
      expect(response.status(), path).toBe(200);
      expect(response.headers()['x-robots-tag'], path).toBeUndefined();
    }
  });

  test('an old tag path answers 308 to its URL form and keeps the link', async ({request}) => {
    const response = await request.get('/rank/overwatch/h_all?state=this-state-must-survive', {maxRedirects: 0});
    expect(response.status()).toBe(308);
    expect(response.headers()['location']).toMatch(/\/rank\/overwatch\/h-all\?state=this-state-must-survive$/);
  });

  test('a template that does not exist answers 404', async ({request}) => {
    for (const path of ['/rank/nope/nope', '/rank/nope', '/rank/overwatch', '/rank/overwatch/nope', '/rank/constructor/all']) {
      const response = await request.get(path, {maxRedirects: 0});
      expect(response.status(), path).toBe(404);
      expect(await response.text(), path).toContain('This page could not be found');
    }
  });

  test('a link with a list opens with 200, even when its set or tag is unknown', async ({request}) => {
    const state = rankingState('image-overwatch', {S: ['Mauga']});
    for (const path of ['/rank/overwatch/tank', '/rank/overwatch/nope', '/rank/nope/nope']) {
      const response = await request.get(`${path}?state=${state}`, {maxRedirects: 0});
      expect(response.status(), path).toBe(200);
    }
  });

  test('legacy set pages answer 200 and ask search engines to drop them', async ({request}) => {
    for (const set of LEGACY_SETS) {
      for (const path of [`/rank/${set.packageName}/all`, `/rank/${set.slug}/${set.tagPath}`]) {
        const response = await request.get(path, {maxRedirects: 0});
        expect(response.status(), path).toBe(200);
        expect(response.headers()['x-robots-tag'], path).toBe('noindex');
      }
    }
  });

  test('a path with a malformed escape answers 400', async ({request}) => {
    const response = await request.get('/rank/%E0%A4%A/all', {maxRedirects: 0});
    expect(response.status()).toBe(400);
  });
});

/**
 * The tier list page as search engines and chat apps fetch it. These tests call the page
 * directly, so they run once and need no browser.
 */
test.describe('The tier list page', () => {
  test('a link with a huge title gets a page with a short title in its metadata, fast', async ({request}) => {
    // A link of under 3,000 characters with a 999,000-character title (A43). Its title used to
    // repeat in <title>, og:title, twitter:title and the JSON-LD: a 9 MB page.
    const title = 'x'.repeat(999_000);
    const link = lzWithRun('{"tiers":[{"i":"tier-s","n":"S","t":[]},{"i":"uncategorized","n":"","t":[]}],"title":"{run}"}', 'x', title.length).input;
    expect(link.length).toBeLessThan(3_000);

    // The time bound is generous on purpose: CI runners and the agents' sandbox can be slow and
    // busy. It still catches a page that takes many seconds to build a 9 MB response.
    const started = Date.now();
    const response = await request.get(`/rank/overwatch/tank?state=${link}`, {timeout: 15_000});
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(Date.now() - started).toBeLessThan(15_000);

    const short = `${'x'.repeat(99)}…`;
    expect(html).toContain(`<title>${short}</title>`);
    expect(html).toContain(`<meta property="og:title" content="${short}"/>`);
    // The editor shows the whole title once (it is the list's own text); nothing repeats it.
    expect(html.split(title).length - 1).toBe(1);
    // The page stays small: the title once (about 1 MB) and the rest of the page, not 9 MB.
    expect(html.length, 'page size in characters').toBeLessThan(title.length + 200_000);
    expect(Buffer.byteLength(html), 'page size in bytes').toBeLessThan(1_500_000);
  });
});
