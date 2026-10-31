import {describe, expect, it} from 'vitest';
import {decodeState, encodeState, type CanonicalState} from '@/lib/state';
import {dataUrlFromImageBytes, imageBytesFromDataUrl, snapshotImageTypeOf} from '@/lib/snapshot/dataUrl';
import {
  deviceItemIds,
  deviceImagesOfLink,
  SNAPSHOT_MESSAGES,
  MAX_SNAPSHOT_LINK_CHARS,
  OPENED_IMAGE_ID_CHARS,
  snapshotFileName,
  snapshotLinkAfterImport,
  snapshotLinkTooLong,
  snapshotLinkWorstCase,
  snapshotOpenedLinkLength,
  snapshotOpenOutcome,
  snapshotToOpen,
} from '@/lib/snapshot/open';
import {snapshotImageId} from '@/lib/snapshot/imageId';
import {heicStart} from '../../support/avif';
import type {SnapshotPayload} from '@/lib/snapshot/payload';
import {makePng} from '../../support/pngHelpers';

const CAT = 'catImage0001';
const DOG = 'dogImage0002';

const list: Omit<CanonicalState, 'version'> = {
  title: 'Pets',
  rowTemplate: '3rows',
  labelPosition: 'top',
  showLabels: false,
  tiers: [
    {id: 'S', name: 'S', items: [{kind: 'device', id: CAT, content: 'Cat'}, {id: 'image-overwatch-ana.webp'}]},
    {id: 'A', name: 'A', items: [{kind: 'link', id: 'https://i.imgur.com/a.png', url: 'https://i.imgur.com/a.png', content: 'Link'}]},
    {id: 'B', name: 'B', items: [{kind: 'device', id: DOG, content: 'Dog'}, {kind: 'device', id: CAT, content: 'Cat again'}]},
    {id: 'unranked', name: '', items: []},
  ],
};
const STATE = encodeState(list, {format: 3});
const png = dataUrlFromImageBytes(makePng(2, 2))!;

function payload(overrides: Partial<SnapshotPayload> = {}): SnapshotPayload {
  return {version: 1, state: STATE, images: [], ...overrides};
}

/** Seeded random ids and labels, so every run builds the same lists. */
function randomText(seed: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let state = seed;
  return (length: number) => Array.from({length}, () => {
    // A 32-bit linear congruential generator; its high bits are the random ones.
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return alphabet[state >>> 26];
  }).join('');
}

/**
 * A list with `images` device items (16-character ids, as the store makes them) and `filler`
 * items of random text, which compress badly, as a long list near the link cap does.
 */
function bigList(images: number, filler: number, seed = 7): {state: string; list: CanonicalState; ids: string[]} {
  const text = randomText(seed);
  const ids = Array.from({length: images}, () => text(16));
  const state = encodeState({
    ...list,
    tiers: [
      {id: 'S', name: 'S', items: ids.map((id, index) => ({kind: 'device' as const, id, content: `Image ${index}`}))},
      {id: 'A', name: 'A', items: Array.from({length: filler}, () => ({id: `x-${text(14)}`, content: text(12)}))},
      {id: 'B', name: 'B', items: []},
      {id: 'unranked', name: '', items: []},
    ],
  }, {format: 3});
  return {state, list: decodeState(state)!, ids};
}

function open(snapshot: SnapshotPayload) {
  const result = snapshotToOpen(snapshot);
  if (!result.ok) throw new Error(result.message);
  return result.snapshot;
}

describe('snapshotOpenOutcome', () => {
  it('returns {action: \'add-as-image\'} when the reason is no-snapshot, not-png, bad-structure or bad-crc', () => {
    for (const reason of ['no-snapshot', 'not-png', 'bad-structure', 'bad-crc'] as const) {
      expect(snapshotOpenOutcome(reason)).toEqual({action: 'add-as-image'});
    }
  });

  it('returns {action: \'message\'} with a SNAPSHOT_MESSAGES text when the reason is any other code', () => {
    expect(snapshotOpenOutcome('file-too-large')).toEqual({action: 'message', message: SNAPSHOT_MESSAGES.tooLarge});
    expect(snapshotOpenOutcome('payload-too-large')).toEqual({action: 'message', message: SNAPSHOT_MESSAGES.tooLarge});
    expect(snapshotOpenOutcome('text-too-large')).toEqual({action: 'message', message: SNAPSHOT_MESSAGES.tooLarge});
    expect(snapshotOpenOutcome('unsupported-version')).toEqual({action: 'message', message: SNAPSHOT_MESSAGES.newer});
    expect(snapshotOpenOutcome('unsupported')).toEqual({action: 'message', message: SNAPSHOT_MESSAGES.unsupported});
    for (const reason of ['truncated', 'chunk-too-large', 'too-many-chunks', 'duplicate-snapshot', 'bad-snapshot-chunk', 'bad-compression', 'bad-utf8', 'bad-json', 'invalid-payload'] as const) {
      expect(snapshotOpenOutcome(reason), reason).toEqual({action: 'message', message: SNAPSHOT_MESSAGES.damaged});
    }
  });
});

describe('snapshotToOpen', () => {
  it('returns the decoded list, only the images its device items use, and path /rank when the payload has no path', () => {
    const images = [{id: CAT, label: 'Cat', dataUrl: png}, {id: 'unusedImage1', label: 'Unused', dataUrl: png}];
    const opened = open(payload({images}));
    expect(opened.path).toBe('/rank');
    expect(opened.state).toBe(STATE);
    expect(opened.images.map(image => image.id)).toEqual([CAT]);
    expect(opened.list.title).toBe('Pets');
    expect(open(payload({path: '/rank/overwatch/tank'})).path).toBe('/rank/overwatch/tank');
  });

  it('returns SNAPSHOT_MESSAGES.damaged when the state does not decode as a v3 link', () => {
    expect(snapshotToOpen(payload({state: '3.notAList'}))).toEqual({ok: false, message: SNAPSHOT_MESSAGES.damaged});
    expect(snapshotToOpen(payload({state: '9.abc'}))).toEqual({ok: false, message: SNAPSHOT_MESSAGES.damaged});
  });

  it('returns SNAPSHOT_MESSAGES.tooLarge when the state is over MAX_SNAPSHOT_LINK_CHARS (13,000)', () => {
    expect(MAX_SNAPSHOT_LINK_CHARS).toBe(13_000);
    // 13,000 characters of state, a 512-character path, "?state=" and a long site address stay under 14,000.
    expect(MAX_SNAPSHOT_LINK_CHARS + 512 + '?state='.length + 'https://www.opentierboy.com'.length).toBeLessThan(14_000);
    const long = `3.${'A'.repeat(MAX_SNAPSHOT_LINK_CHARS - 1)}`;
    expect(snapshotLinkTooLong(long)).toBe(true);
    expect(snapshotLinkTooLong(long.slice(1))).toBe(false);
    expect(snapshotToOpen(payload({state: long}))).toEqual({ok: false, message: SNAPSHOT_MESSAGES.tooLarge});
  });
});

describe('snapshotLinkWorstCase and snapshotOpenedLinkLength', () => {
  it('returns a link with one placeholder id per given image, the same on every call, when given a set of ids', () => {
    const decoded = decodeState(STATE)!;
    const worst = snapshotLinkWorstCase(decoded, new Set([CAT]));
    expect(worst).toBe(snapshotLinkWorstCase(decoded, new Set([CAT])));
    const items = decodeState(worst)!.tiers.flatMap(tier => tier.items);
    const devices = items.filter(item => 'kind' in item && item.kind === 'device').map(item => item.id);
    // The cat (twice, one placeholder) changed; the dog, which the file does not hold, kept its id.
    expect(devices).toHaveLength(3);
    expect(devices[0]).toHaveLength(OPENED_IMAGE_ID_CHARS);
    expect(devices[2]).toBe(devices[0]);
    expect(devices[1]).toBe(DOG);
    expect(snapshotLinkWorstCase(decoded, new Set())).toBe(encodeState(decoded, {format: 3}));
    expect(snapshotOpenedLinkLength(decoded, new Set())).toBe(encodeState(decoded, {format: 3}).length);
  });

  it('returns a length no shorter than the link after import when given 40 random lists', async () => {
    // Over 2,100 random lists, a real link came out at most 15 characters longer than its
    // placeholder link: snapshotOpenedLinkLength adds room for that.
    const text = randomText(99);
    for (let trial = 0; trial < 40; trial++) {
      const {state, list: decoded, ids} = bigList(1 + trial * 3, trial * 5, trial + 1);
      const kept = new Set(ids.filter((_, index) => index % 4 !== 3));
      const opened = new Map<string, string>();
      for (const id of kept) {
        // Some images this browser holds already (their id stays), the others get a hash id.
        opened.set(id, trial % 3 === 0 && id < 'M' ? id : await snapshotImageId(new TextEncoder().encode(text(40))));
      }
      const after = snapshotLinkAfterImport({list: decoded, state}, opened);
      expect(after.length, `trial ${trial}`).toBeLessThanOrEqual(snapshotOpenedLinkLength(decoded, kept));
    }
  });

  it('returns SNAPSHOT_MESSAGES.tooLarge from snapshotToOpen when the link passes the cap once its images get new ids', () => {
    // Fill until the link itself is just under the cap: with 50 images, it would grow past it.
    let filler = 0;
    let found = bigList(50, filler);
    for (let next = bigList(50, filler + 10); next.state.length <= MAX_SNAPSHOT_LINK_CHARS; next = bigList(50, filler + 10)) {
      filler += 10;
      found = next;
    }
    expect(found.state.length).toBeGreaterThan(MAX_SNAPSHOT_LINK_CHARS - 400);
    const images = found.ids.map(id => ({id, label: id, dataUrl: png}));
    expect(snapshotOpenedLinkLength(found.list, new Set(found.ids))).toBeGreaterThan(MAX_SNAPSHOT_LINK_CHARS);
    expect(snapshotToOpen({version: 1, state: found.state, images})).toEqual({ok: false, message: SNAPSHOT_MESSAGES.tooLarge});
    // Without its images (it holds none), the same list opens: its ids stay as they are.
    expect(snapshotToOpen({version: 1, state: found.state, images: []}).ok).toBe(true);
  });
});

describe('deviceItemIds, deviceImagesOfLink and snapshotLinkAfterImport', () => {
  it('returns each device image once, in list order, when the list repeats a device item', () => {
    expect(deviceItemIds(list)).toEqual([CAT, DOG]);
    expect(deviceImagesOfLink(STATE)).toEqual([{id: CAT, label: 'Cat'}, {id: DOG, label: 'Dog'}]);
    expect(deviceImagesOfLink('not a link')).toEqual([]);
  });

  it('returns the file\'s state unchanged when no id changed', () => {
    const opened = open(payload());
    expect(snapshotLinkAfterImport(opened, new Map([[CAT, CAT], [DOG, DOG]]))).toBe(STATE);
    expect(snapshotLinkAfterImport(opened, new Map())).toBe(STATE);
  });

  it('returns a link with the new ids and everything else unchanged when an id changed', () => {
    const opened = open(payload());
    const link = snapshotLinkAfterImport(opened, new Map([[CAT, 'newCatId0001'], [DOG, DOG]]));
    const decoded = decodeState(link)!;
    expect(deviceItemIds(decoded)).toEqual(['newCatId0001', DOG]);
    expect(decoded.tiers[0].items[1]).toEqual({id: 'image-overwatch-ana.webp'});
    expect(decoded.tiers[2].items).toEqual([{kind: 'device', id: DOG, content: 'Dog'}, {kind: 'device', id: 'newCatId0001', content: 'Cat again'}]);
    expect({...decoded, tiers: []}).toEqual({...decodeState(STATE)!, tiers: []});
  });
});

describe('snapshotFileName', () => {
  it('returns the letters and digits of any script, joined by dashes, when the title has other characters', () => {
    expect(snapshotFileName('Tanks with a cat')).toBe('tanks-with-a-cat.png');
    expect(snapshotFileName('  Ünïcödé — 名前 / Ελληνικά!! ')).toBe('ünïcödé-名前-ελληνικά.png');
    expect(snapshotFileName('Ｆｕｌｌ　Ｗｉｄｔｈ')).toBe('full-width.png');
    expect(snapshotFileName('../../etc/passwd')).toBe('etc-passwd.png');
  });

  it('returns tier-list.png when the title has no letters or digits, and at most 80 characters for a long title', () => {
    for (const title of ['', '   ', '!!!', '🧪🧪']) expect(snapshotFileName(title), title).toBe('tier-list.png');
    const long = snapshotFileName('名'.repeat(200));
    expect(Array.from(long.replace(/\.png$/, ''))).toHaveLength(80);
  });
});

describe('snapshotImageTypeOf, dataUrlFromImageBytes and imageBytesFromDataUrl', () => {
  it('returns the type from the first bytes, and the same bytes after a data URL round trip, when given PNG bytes', () => {
    const bytes = makePng(3, 3);
    expect(snapshotImageTypeOf(bytes)).toBe('image/png');
    const url = dataUrlFromImageBytes(bytes)!;
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(imageBytesFromDataUrl(url)).toEqual({type: 'image/png', bytes});
    expect(snapshotImageTypeOf(Uint8Array.from([0xff, 0xd8, 0xff, 0]))).toBe('image/jpeg');
    expect(snapshotImageTypeOf(new TextEncoder().encode('GIF89a......'))).toBe('image/gif');
    expect(snapshotImageTypeOf(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('returns AVIF bytes with their declared type from imageBytesFromDataUrl, and null when encoding them', () => {
    const avif = new Uint8Array(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypavif\0\0\0\0mif1avif', 'latin1'), Buffer.alloc(40)]));
    const base64 = Buffer.from(avif).toString('base64');
    expect(imageBytesFromDataUrl(`data:image/avif;base64,${base64}`)).toEqual({type: 'image/avif', bytes: avif});
    expect(imageBytesFromDataUrl(`data:image/png;base64,${base64}`)).toEqual({type: 'image/png', bytes: avif});
    // The app never writes one.
    expect(snapshotImageTypeOf(avif)).toBeNull();
    expect(dataUrlFromImageBytes(avif)).toBeNull();
  });

  it('returns HEIC bytes with their declared type from imageBytesFromDataUrl, and null when encoding them', () => {
    const heic = heicStart();
    const base64 = Buffer.from(heic).toString('base64');
    expect(imageBytesFromDataUrl(`data:image/heic;base64,${base64}`)).toEqual({type: 'image/heic', bytes: heic});
    expect(snapshotImageTypeOf(heic)).toBeNull();
    expect(dataUrlFromImageBytes(heic)).toBeNull();
  });

  it('returns null when the bytes or the data URL are not a raster image', () => {
    expect(dataUrlFromImageBytes(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(dataUrlFromImageBytes(new Uint8Array())).toBeNull();
    expect(imageBytesFromDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(imageBytesFromDataUrl('https://example.com/a.png')).toBeNull();
  });

  it('returns a data URL of every byte when the image is 300,000 bytes', () => {
    const bytes = new Uint8Array(300_000);
    bytes.set(makePng(1, 1).subarray(0, 8));
    const url = dataUrlFromImageBytes(bytes)!;
    expect(Buffer.from(url.split(',')[1], 'base64').equals(Buffer.from(bytes))).toBe(true);
  });
});
