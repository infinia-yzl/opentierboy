import fs from 'node:fs';
import path from 'node:path';
import {expect, test} from '../support/test';
import {LEGACY_SETS, legacyFiles} from '../support/links';

const publicImages = path.join(__dirname, '..', '..', 'public', 'images');

/**
 * The images of the legacy sets are committed in public/images/<package>/, and the build makes
 * their PNG copies next to them. They keep the URLs they always had: tiles load the WebP files,
 * and link previews load the PNG copies.
 */
test.describe('Legacy image files', () => {
  for (const set of LEGACY_SETS) {
    test(`${set.displayName}: every image and its PNG copy is served at its old URL`, async ({request}) => {
      const files = legacyFiles(set.packageName);
      expect(files.length).toBeGreaterThan(0);
      for (let start = 0; start < files.length; start += 20) {
        await Promise.all(files.slice(start, start + 20).map(async (file) => {
          const response = await request.get(encodeURI(`/images/${set.packageName}/${file}`));
          expect(response.status(), file).toBe(200);
          expect(response.headers()['content-type'], file).toBe(file.endsWith('.png') ? 'image/png' : 'image/webp');
          const onDisk = fs.readFileSync(path.join(publicImages, set.packageName, file));
          expect((await response.body()).equals(onDisk), `${file} is the file in public/images`).toBe(true);
        }));
      }
    });
  }
});

test.describe('Sitemap', () => {
  test('lists the official image sets and leaves the legacy sets out', async ({request}) => {
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
