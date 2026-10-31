import fs from 'node:fs';
import path from 'node:path';
import {expect, expectTierList, test} from '../support/test';
import {serveImageSite} from '../support/imageSites';
import {pngFile} from '../support/snapshotFiles';
import golden from '../fixtures/snapshots/snapshots.json';

/**
 * Freeze Frame files that earlier versions saved keep opening (tests/fixtures/snapshots). Each
 * golden file opens in an empty editor, as for a friend who receives it.
 */
const DIR = path.resolve(__dirname, '../fixtures/snapshots');

test.describe('Golden Freeze Frame files', () => {
  for (const entry of golden) {
    test(`${entry.file} opens with its list, its pictures and its link images`, async ({openAsVisitor}) => {
      const friend = await openAsVisitor('/rank');
      for (const site of new Set(entry.linkImages.map((url) => new URL(url).hostname))) await serveImageSite(friend.page, site);

      await friend.openFile(pngFile(entry.file, fs.readFileSync(path.join(DIR, entry.file))));
      await friend.confirmOpenList();

      await expect(friend.page).toHaveURL(new RegExp(`${entry.path}\\?state=3\\.`));
      await expectTierList(friend, {title: entry.title, tiers: entry.tiers});
      for (const label of entry.pictures) {
        await expect.poll(() => friend.itemImageHasLoaded(label), {message: `the picture ${label} shows`}).toBe(true);
      }
      // The pictures are saved in this browser: they still show after a reload.
      await friend.reload();
      for (const label of entry.pictures) {
        await expect.poll(() => friend.itemImageHasLoaded(label)).toBe(true);
      }
    });
  }
});
