import {expect, test} from '../support/test';
import {LEGACY_SETS, rankingState} from '../support/links';

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
