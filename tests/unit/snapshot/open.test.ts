import {describe, expect, it} from 'vitest';
import {decodeState, encodeState, type CanonicalState} from '@/lib/state';
import {dataUrlFromImageBytes, imageBytesFromDataUrl, snapshotImageTypeOf} from '@/lib/snapshot/dataUrl';
import {
  deviceItemIds,
  deviceImagesOfLink,
  SNAPSHOT_MESSAGES,
  snapshotLinkAfterImport,
  snapshotOpenOutcome,
  snapshotToOpen,
} from '@/lib/snapshot/open';
import type {SnapshotPayload} from '@/lib/snapshot/payload';
import {makePng} from './pngHelpers';

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

describe('snapshotOpenOutcome', () => {
  it('offers ordinary and slightly broken pictures as images', () => {
    for (const reason of ['no-snapshot', 'not-png', 'bad-structure', 'bad-crc'] as const) {
      expect(snapshotOpenOutcome(reason)).toEqual({action: 'add-as-image'});
    }
  });

  it('shows a plain message for everything else', () => {
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
  it('decodes the list, keeps only the images its device items use, and defaults the path to /rank', () => {
    const images = [{id: CAT, label: 'Cat', dataUrl: png}, {id: 'unusedImage1', label: 'Unused', dataUrl: png}];
    const opened = snapshotToOpen(payload({images}));
    expect(opened?.path).toBe('/rank');
    expect(opened?.state).toBe(STATE);
    expect(opened?.images.map(image => image.id)).toEqual([CAT]);
    expect(opened?.list.title).toBe('Pets');
    expect(snapshotToOpen(payload({path: '/rank/overwatch/tank'}))?.path).toBe('/rank/overwatch/tank');
  });

  it('refuses a link value that does not decode, or a legacy list', () => {
    expect(snapshotToOpen(payload({state: '3.notAList'}))).toBeNull();
    expect(snapshotToOpen(payload({state: '9.abc'}))).toBeNull();
  });
});

describe('device image ids', () => {
  it('lists each device image of a list once, in list order', () => {
    expect(deviceItemIds(list)).toEqual([CAT, DOG]);
    expect(deviceImagesOfLink(STATE)).toEqual([{id: CAT, label: 'Cat'}, {id: DOG, label: 'Dog'}]);
    expect(deviceImagesOfLink('not a link')).toEqual([]);
  });

  it('keeps the file\'s link value when no id changed', () => {
    const opened = snapshotToOpen(payload())!;
    expect(snapshotLinkAfterImport(opened, new Map([[CAT, CAT], [DOG, DOG]]))).toBe(STATE);
    expect(snapshotLinkAfterImport(opened, new Map())).toBe(STATE);
  });

  it('writes the list again with the new ids, and changes nothing else', () => {
    const opened = snapshotToOpen(payload())!;
    const link = snapshotLinkAfterImport(opened, new Map([[CAT, 'newCatId0001'], [DOG, DOG]]));
    const decoded = decodeState(link)!;
    expect(deviceItemIds(decoded)).toEqual(['newCatId0001', DOG]);
    expect(decoded.tiers[0].items[1]).toEqual({id: 'image-overwatch-ana.webp'});
    expect(decoded.tiers[2].items).toEqual([{kind: 'device', id: DOG, content: 'Dog'}, {kind: 'device', id: 'newCatId0001', content: 'Cat again'}]);
    expect({...decoded, tiers: []}).toEqual({...decodeState(STATE)!, tiers: []});
  });
});

describe('snapshot image data URLs', () => {
  it('types images by their first bytes and round-trips them', () => {
    const bytes = makePng(3, 3);
    expect(snapshotImageTypeOf(bytes)).toBe('image/png');
    const url = dataUrlFromImageBytes(bytes)!;
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(imageBytesFromDataUrl(url)).toEqual({type: 'image/png', bytes});
    expect(snapshotImageTypeOf(Uint8Array.from([0xff, 0xd8, 0xff, 0]))).toBe('image/jpeg');
    expect(snapshotImageTypeOf(new TextEncoder().encode('GIF89a......'))).toBe('image/gif');
    expect(snapshotImageTypeOf(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('refuses other bytes and bad data URLs', () => {
    expect(dataUrlFromImageBytes(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(dataUrlFromImageBytes(new Uint8Array())).toBeNull();
    expect(imageBytesFromDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(imageBytesFromDataUrl('https://example.com/a.png')).toBeNull();
  });

  it('encodes large images in pieces', () => {
    const bytes = new Uint8Array(300_000);
    bytes.set(makePng(1, 1).subarray(0, 8));
    const url = dataUrlFromImageBytes(bytes)!;
    expect(Buffer.from(url.split(',')[1], 'base64').equals(Buffer.from(bytes))).toBe(true);
  });
});
