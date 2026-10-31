import {describe, expect, it} from 'vitest';
import type Item from '@/models/Item';
import type Tier from '@/models/Tier';
import {
  deviceImageKey,
  deviceImageKeys,
  hostsAwaitingConsent,
  isImageHostAllowed,
  itemDisplayLabel,
  linkImageCounts,
  linkImageOf,
  pastedImageLabel,
} from '@/lib/images/listImages';
import {itemLabel} from '@/lib/dnd/labels';

const isPackageItem = (id: string) => id.startsWith('image-overwatch-');
const tier = (id: string, items: Item[]): Tier => ({id, name: id, items});
const link = (url: string, content = 'label'): Item => ({id: url, content, source: 'link', url});

describe('deviceImageKey and deviceImageKeys', () => {
  it('returns the item id when the item is a v3 device image', () => {
    expect(deviceImageKey({id: 'Abcdefgh12345678', source: 'device'}, isPackageItem)).toBe('Abcdefgh12345678');
    expect(deviceImageKey({id: 'legacy-ab3c9', source: 'device'}, isPackageItem)).toBe('legacy-ab3c9');
  });

  it('returns the device id (legacy-<id> when short) when the item is a legacy upload, and null for image-set ids (A42)', () => {
    expect(deviceImageKey({id: 'k3j9x0a1b'}, isPackageItem)).toBe('k3j9x0a1b');
    expect(deviceImageKey({id: 'ab3c9'}, isPackageItem)).toBe('legacy-ab3c9');
    expect(deviceImageKey({id: 'image-overwatch-mau.webp'}, isPackageItem)).toBeNull();
    expect(deviceImageKey({id: 'image-overwatch-gone.webp'}, () => false)).toBeNull();
    expect(deviceImageKey({id: '__proto__'}, isPackageItem)).toBe('legacy-__proto__');
  });

  it('returns null when the item is a link image or a v3 image-set item', () => {
    expect(deviceImageKey({id: 'https://i.imgur.com/a.png', source: 'link'}, isPackageItem)).toBeNull();
    expect(deviceImageKey({id: 'abcdefghij', source: 'package'}, isPackageItem)).toBeNull();
  });

  it('returns each device id once when deviceImageKeys gets a list', () => {
    const tiers = [
      tier('s', [{id: 'k3j9x0a1b', content: 'a'}, {id: 'image-overwatch-mau.webp', content: 'Mauga'}, link('https://i.imgur.com/a.png')]),
      tier('u', [{id: 'legacy-ab3c9', content: 'b', source: 'device'}, {id: 'ab3c9', content: 'b again'}]),
    ];
    expect(deviceImageKeys(tiers, isPackageItem)).toEqual(['k3j9x0a1b', 'legacy-ab3c9']);
  });
});

describe('linkImageCounts', () => {
  it('returns the link images and the device images of every row, Unranked included, when the list has both', () => {
    const tiers = [
      tier('s', [{id: 'image-overwatch-mau.webp', content: 'Mauga'}, link('https://i.imgur.com/a.png'), {id: 'k3j9x0a1b', content: 'old upload'}]),
      tier('a', [link('https://i.imgur.com/b.png'), link('not an address')]),
      tier('u', [{id: 'Abcdefgh12345678', content: 'pasted', source: 'device'}, {id: 'abcdefghij', content: 'gone', source: 'package'}]),
    ];
    expect(linkImageCounts(tiers, isPackageItem)).toEqual({link: 3, device: 2});
  });

  it('returns 0 link images and 0 device images when the list has only image-set items', () => {
    expect(linkImageCounts([tier('s', [{id: 'image-overwatch-mau.webp', content: 'Mauga'}]), tier('u', [])], isPackageItem))
      .toEqual({link: 0, device: 0});
  });
});

describe('linkImageOf and hostsAwaitingConsent', () => {
  it('returns the normalised url, host and domain when linkImageOf gets a valid link image, and null otherwise', () => {
    expect(linkImageOf(link('HTTPS://WWW.Example.org./a.png'))).toEqual({url: 'https://www.example.org/a.png', host: 'www.example.org', domain: 'example.org'});
    expect(linkImageOf(link('http://localhost:3000/a.png'))).toBeNull();
    expect(linkImageOf({source: 'device', url: 'https://i.imgur.com/a.png'})).toBeNull();
  });

  it('returns each valid, untrusted and not allowed host once when hostsAwaitingConsent gets a list', () => {
    const tiers = [
      tier('s', [link('https://images.example.org/1.png'), link('https://i.imgur.com/a.png'), link('https://images.example.org/2.png')]),
      tier('u', [link('https://cdn.example.net/x.png'), link('http://127.0.0.1/x.png'), link('https://www.thefinals.wiki/w/images/a.png')]),
    ];
    expect(hostsAwaitingConsent(tiers, new Set())).toEqual(['images.example.org', 'cdn.example.net']);
    expect(hostsAwaitingConsent(tiers, new Set(['cdn.example.net']))).toEqual(['images.example.org']);
    expect(isImageHostAllowed('i.imgur.com', new Set())).toBe(true);
    expect(isImageHostAllowed('x.i.imgur.com', new Set())).toBe(false);
  });
});

describe('itemDisplayLabel', () => {
  it('returns the label, or the site name when a link image has no label', () => {
    expect(itemDisplayLabel(link('https://www.example.org/cat.png', 'My cat'))).toBe('My cat');
    expect(itemDisplayLabel(link('https://www.example.org/cat.png', ''))).toBe('example.org');
    expect(itemDisplayLabel(link('https://i.imgur.com/cat.png', '   '))).toBe('i.imgur.com');
    // An address that breaks the rules still names its host; it never loads.
    expect(itemDisplayLabel(link('http://localhost:3000/cat.png', ''))).toBe('localhost');
    expect(itemDisplayLabel(link('not a url', ''))).toBe('');
    // Other items keep their label as it is, also an empty one.
    expect(itemDisplayLabel({content: '', source: 'device'})).toBe('');
    expect(itemDisplayLabel({content: 'Mauga'})).toBe('Mauga');
  });

  it('returns the site name as the itemLabel drag announcement label when a link image has no label', () => {
    // The editor hands lib/dnd the display label of each item (components/DragDropTierList.tsx).
    expect(itemLabel({content: itemDisplayLabel(link('https://images.example.org/a.png', ''))})).toBe('images.example.org');
    expect(itemLabel({content: ''})).toBe('Unnamed item');
  });
});

describe('pastedImageLabel', () => {
  it('returns the file name, or Pasted image <n> when the name is image.png or already in the list', () => {
    expect(pastedImageLabel('My cat.png', new Set())).toBe('My cat');
    expect(pastedImageLabel('image.png', new Set())).toBe('Pasted image');
    expect(pastedImageLabel('', new Set(['Pasted image']))).toBe('Pasted image 2');
    expect(pastedImageLabel('Image.PNG', new Set(['Pasted image', 'Pasted image 2']))).toBe('Pasted image 3');
    expect(pastedImageLabel('My cat.png', new Set(['My cat']))).toBe('Pasted image');
  });
});
