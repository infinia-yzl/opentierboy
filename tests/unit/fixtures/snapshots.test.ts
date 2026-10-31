import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {readSnapshotFile} from '@/lib/snapshot';
import {snapshotToOpen} from '@/lib/snapshot/open';
import {rasterDataUrlInfo} from '@/lib/snapshot/payload';
import {createTierCortex} from '@/lib/TierCortex';
import golden from '../../fixtures/snapshots/snapshots.json';

/** Freeze Frame files people saved must keep opening (tests/fixtures/snapshots/README.md). */
const DIR = path.resolve(__dirname, '../../fixtures/snapshots');

describe('golden Freeze Frame files', () => {
  it('lists at least one file, and every file in the folder', () => {
    expect(golden.length).toBeGreaterThan(0);
    const files = fs.readdirSync(DIR).filter((name) => name.endsWith('.png')).sort();
    expect(files).toEqual(golden.map((entry) => entry.file).sort());
  });

  for (const entry of golden) {
    it(`${entry.file} is unchanged and opens the list it was saved with`, async () => {
      const bytes = fs.readFileSync(path.join(DIR, entry.file));
      expect(createHash('sha256').update(bytes).digest('hex'), 'the file was changed').toBe(entry.sha256);

      const read = await readSnapshotFile(bytes);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      const opened = snapshotToOpen(read.payload);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      expect(opened.snapshot.path).toBe(entry.path);

      // The list as the editor would show it: the title, the row names and the item labels.
      const list = createTierCortex().decodeTierStateFromURL(opened.snapshot.state);
      expect(list?.title).toBe(entry.title);
      expect(list?.tiers.map((tier, index, all) => ({
        name: index === all.length - 1 && tier.name === '' ? 'Unranked' : tier.name,
        items: tier.items.map((item) => item.content),
      }))).toEqual(entry.tiers);
      expect(list?.tiers.flatMap((tier) => tier.items.filter((item) => item.source === 'link').map((item) => item.url))).toEqual(entry.linkImages);

      // Each device picture once, as a raster image the opener can draw again.
      expect(opened.snapshot.images.map((image) => image.label)).toEqual(entry.pictures);
      for (const image of opened.snapshot.images) expect(rasterDataUrlInfo(image.dataUrl), image.label).not.toBeNull();
    });
  }
});
