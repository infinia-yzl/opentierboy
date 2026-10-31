import {describe, expect, it} from 'vitest';
import {decodeState, encodeState, type EncodableState} from '@/lib/state';
import {readSnapshotFile, writeSnapshotFile} from '@/lib/snapshot';
import {snapshotLinkAfterImport, snapshotToOpen} from '@/lib/snapshot/open';
import {makePng} from '../../support/pngHelpers';

const pngDataUrl = (bytes: Uint8Array) => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;

/** A list with every kind of item, two device images, and one device image used twice. */
const LIST: EncodableState = {
  title: 'Tanks with a cat 🐈',
  rowTemplate: 'custom',
  labelPosition: 'top',
  showLabels: false,
  tiers: [
    {id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-mau.webp'}, {kind: 'device', id: 'h3Kx9_Tq2LmZ-a8B', content: 'My cat'}]},
    {id: 'tier-a', name: 'Great', items: [{kind: 'link', id: 'https://i.imgur.com/a.png', url: 'https://i.imgur.com/a.png', content: 'From a link'}]},
    {id: 'tier-b', name: 'B', items: [{kind: 'device', id: 'Zq8-3LmA_9xTk2Pw', content: 'My dog'}, {kind: 'device', id: 'h3Kx9_Tq2LmZ-a8B', content: 'My cat again'}]},
    {id: 'uncategorized', name: '', items: [{id: 'image-overwatch-win.webp'}]},
  ],
};

const CAT = pngDataUrl(makePng(8, 8, 3));
const DOG = pngDataUrl(makePng(6, 9, 7));
const UNUSED = pngDataUrl(makePng(5, 5, 11));

describe('writeSnapshotFile, readSnapshotFile and snapshotToOpen', () => {
  it('returns the same list, the path and each used device image once when a written snapshot file is read and opened', async () => {
    const state = encodeState(LIST);
    const written = await writeSnapshotFile(makePng(40, 30, 1), {
      state,
      path: '/rank/overwatch/tank',
      images: [
        {id: 'h3Kx9_Tq2LmZ-a8B', label: 'My cat', dataUrl: CAT},
        {id: 'Zq8-3LmA_9xTk2Pw', label: 'My dog', dataUrl: DOG},
        {id: 'Unused_Image-123', label: 'Not in the list', dataUrl: UNUSED},
      ],
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const read = await readSnapshotFile(written.png);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const opened = snapshotToOpen(read.payload);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const {list, path, images, state: openedState} = opened.snapshot;
    expect(path).toBe('/rank/overwatch/tank');
    expect(openedState).toBe(state);
    expect(list).toEqual(decodeState(state));
    expect(list).toMatchObject({version: 3, title: LIST.title, rowTemplate: 'custom', labelPosition: 'top', showLabels: false});
    expect(list.tiers).toEqual(LIST.tiers);
    expect(images).toEqual([
      {id: 'h3Kx9_Tq2LmZ-a8B', label: 'My cat', dataUrl: CAT},
      {id: 'Zq8-3LmA_9xTk2Pw', label: 'My dog', dataUrl: DOG},
    ]);
  });

  it('returns a link with the new device image ids, and the rest unchanged, when snapshotLinkAfterImport gets new ids', async () => {
    const state = encodeState(LIST);
    const written = await writeSnapshotFile(makePng(40, 30, 1), {state, images: [
      {id: 'h3Kx9_Tq2LmZ-a8B', label: 'My cat', dataUrl: CAT},
      {id: 'Zq8-3LmA_9xTk2Pw', label: 'My dog', dataUrl: DOG},
    ]});
    if (!written.ok) throw new Error(written.reason);
    const read = await readSnapshotFile(written.png);
    if (!read.ok) throw new Error(read.reason);
    const opened = snapshotToOpen(read.payload);
    if (!opened.ok) throw new Error(opened.message);
    expect(opened.snapshot.path).toBe('/rank');

    // Ids unchanged: the file's own link comes back as it is.
    const sameIds = new Map([['h3Kx9_Tq2LmZ-a8B', 'h3Kx9_Tq2LmZ-a8B'], ['Zq8-3LmA_9xTk2Pw', 'Zq8-3LmA_9xTk2Pw']]);
    expect(snapshotLinkAfterImport(opened.snapshot, sameIds)).toBe(state);

    // New ids in this browser: every {d} item follows, both uses of the cat included.
    const newIds = new Map([['h3Kx9_Tq2LmZ-a8B', 'snap-catcatcatcatcatcatcat'], ['Zq8-3LmA_9xTk2Pw', 'snap-dogdogdogdogdogdogdo']]);
    const relinked = decodeState(snapshotLinkAfterImport(opened.snapshot, newIds));
    const deviceItems = relinked?.tiers.flatMap((tier) => tier.items.filter((item) => item.kind === 'device'));
    expect(deviceItems).toEqual([
      {kind: 'device', id: 'snap-catcatcatcatcatcatcat', content: 'My cat'},
      {kind: 'device', id: 'snap-dogdogdogdogdogdogdo', content: 'My dog'},
      {kind: 'device', id: 'snap-catcatcatcatcatcatcat', content: 'My cat again'},
    ]);
    const withoutDevice = (tiers: typeof LIST.tiers) => tiers.map((tier) => ({...tier, items: tier.items.filter((item) => item.kind !== 'device')}));
    expect(withoutDevice(relinked!.tiers)).toEqual(withoutDevice(LIST.tiers));
    expect(relinked?.title).toBe(LIST.title);
  });
});
