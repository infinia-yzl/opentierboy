import fs from 'node:fs';
import path from 'node:path';
import {expect, test} from '../support/test';
import {LEGACY_SETS, legacyFiles} from '../support/links';

const repoRoot = path.join(__dirname, '..', '..');
const publicImages = path.join(repoRoot, 'public', 'images');

/**
 * The legacy sets come from npm packages pinned to an exact version. The build copies their
 * images into public/images/<package>/ and makes their PNG copies next to them. They keep the
 * URLs they always had: tiles load the WebP files (the bytes of the pinned package), and link
 * previews load the PNG copies.
 */
test.describe('legacy sets', () => {
  test.describe('image files', () => {
    for (const set of LEGACY_SETS) {
      test(`returns 200, the image type and the package bytes when the request has a ${set.displayName} image path`, async ({request}) => {
        const files = legacyFiles(set.packageName);
        expect(files.length).toBeGreaterThan(0);
        for (let start = 0; start < files.length; start += 20) {
          await Promise.all(files.slice(start, start + 20).map(async (file) => {
            const response = await request.get(encodeURI(`/images/${set.packageName}/${file}`));
            expect(response.status(), file).toBe(200);
            expect(response.headers()['content-type'], file).toBe(file.endsWith('.png') ? 'image/png' : 'image/webp');
            // WebP files are the pinned package's files; PNG copies are the ones the build made.
            const source = file.endsWith('.png')
              ? path.join(publicImages, set.packageName, file)
              : path.join(repoRoot, 'node_modules', set.packageName, 'public', 'images', file);
            expect((await response.body()).equals(fs.readFileSync(source)), `${file} is the file at ${path.relative(repoRoot, source)}`).toBe(true);
          }));
        }
      });
    }
  });

  test.describe('app manifest and search data', () => {
    test('returns the active image sets and no legacy set in shortcuts when the request has /manifest.webmanifest', async ({request}) => {
      const response = await request.get('/manifest.webmanifest');
      expect(response.status()).toBe(200);
      const manifest = await response.json() as {shortcuts: {url: string}[]};

      expect(manifest.shortcuts.map(({url}) => url)).toEqual(['/about', '/blog', '/rank', '/rank/the-finals/all', '/rank/overwatch/h-all']);
    });

    test('returns the active image sets and no legacy set in the JSON-LD potentialAction when the request has /', async ({request}) => {
      const response = await request.get('/');
      expect(response.status()).toBe(200);
      const html = await response.text();
      // The layout's JSON-LD (potentialAction) travels in the page payload, with absolute URLs.
      const rankTargets = [...html.matchAll(/https?:\/\/[^"\\\s]+?(\/rank[^"\\\s]*)/g)].map((match) => match[1]);

      expect(html).toContain('potentialAction');
      expect([...new Set(rankTargets)].sort()).toEqual(['/rank', '/rank/overwatch/h-all', '/rank/the-finals/all']);
      for (const set of LEGACY_SETS) {
        expect(html, set.displayName).not.toContain(`/rank/${set.slug}`);
        expect(html, set.displayName).not.toContain(`/rank/${set.packageName}/`);
      }
    });
  });

  test.describe('sitemap', () => {
    test('returns the active image sets and no legacy set when the request has /sitemap.xml', async ({request}) => {
      const response = await request.get('/sitemap.xml');
      expect(response.status()).toBe(200);
      const sitemap = await response.text();

      expect(sitemap).toContain('https://opentierboy.com/rank/the-finals/all</loc>');
      expect(sitemap).toContain('https://opentierboy.com/rank/image-overwatch/all</loc>');
      expect(sitemap).toContain('https://opentierboy.com/overwatch</loc>');
      for (const set of LEGACY_SETS) {
        expect(sitemap, set.displayName).not.toContain(`/rank/${set.slug}/`);
        expect(sitemap, set.displayName).not.toContain(`/rank/${set.packageName}/`);
        expect(sitemap, set.displayName).not.toContain(`https://opentierboy.com/${set.slug}</loc>`);
      }
    });
  });
});
