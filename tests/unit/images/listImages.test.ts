import {describe, expect, it} from 'vitest';
import type Item from '@/models/Item';
import type Tier from '@/models/Tier';
import {deviceImageKey, deviceImageKeys, hostsAwaitingConsent, isImageHostAllowed, itemDisplayLabel, linkImageOf, pastedImageLabel} from '@/lib/images/listImages';
import {itemLabel} from '@/lib/dragAnnouncements';

const isPackageItem = (id: string) => id.startsWith('image-overwatch-');
const tier = (id: string, items: Item[]): Tier => ({id, name: id, items});
const link = (url: string, content = 'label'): Item => ({id: url, content, source: 'link', url});

describe('deviceImageKey', () => {
  it('uses the id of a v3 device image', () => {
    expect(deviceImageKey({id: 'Abcdefgh12345678', source: 'device'}, isPackageItem)).toBe('Abcdefgh12345678');
    expect(deviceImageKey({id: 'legacy-ab3c9', source: 'device'}, isPackageItem)).toBe('legacy-ab3c9');
  });

  it('maps legacy upload ids to their device id (A42), and leaves image-set ids alone', () => {
    expect(deviceImageKey({id: 'k3j9x0a1b'}, isPackageItem)).toBe('k3j9x0a1b');
    expect(deviceImageKey({id: 'ab3c9'}, isPackageItem)).toBe('legacy-ab3c9');
    expect(deviceImageKey({id: 'image-overwatch-mau.webp'}, isPackageItem)).toBeNull();
    expect(deviceImageKey({id: 'image-overwatch-gone.webp'}, () => false)).toBeNull();
    expect(deviceImageKey({id: '__proto__'}, isPackageItem)).toBe('legacy-__proto__');
  });

  it('is null for link images and unknown image-set ids from v3 links', () => {
    expect(deviceImageKey({id: 'https://i.imgur.com/a.png', source: 'link'}, isPackageItem)).toBeNull();
    expect(deviceImageKey({id: 'abcdefghij', source: 'package'}, isPackageItem)).toBeNull();
  });

  it('lists the keys of a list once each', () => {
    const tiers = [
      tier('s', [{id: 'k3j9x0a1b', content: 'a'}, {id: 'image-overwatch-mau.webp', content: 'Mauga'}, link('https://i.imgur.com/a.png')]),
      tier('u', [{id: 'legacy-ab3c9', content: 'b', source: 'device'}, {id: 'ab3c9', content: 'b again'}]),
    ];
    expect(deviceImageKeys(tiers, isPackageItem)).toEqual(['k3j9x0a1b', 'legacy-ab3c9']);
  });
});

describe('link images of a list', () => {
  it('normalises valid addresses and refuses the rest', () => {
    expect(linkImageOf(link('HTTPS://WWW.Example.org./a.png'))).toEqual({url: 'https://www.example.org/a.png', host: 'www.example.org', domain: 'example.org'});
    expect(linkImageOf(link('http://localhost:3000/a.png'))).toBeNull();
    expect(linkImageOf({source: 'device', url: 'https://i.imgur.com/a.png'})).toBeNull();
  });

  it('lists the hosts that wait for consent: valid, not trusted, not allowed, each once', () => {
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
  it('uses the label, and for a link image without one, the site name', () => {
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

  it('names link images without a label by their site in drag announcements', () => {
    expect(itemLabel(link('https://images.example.org/a.png', ''))).toBe('images.example.org');
    expect(itemLabel({content: ''})).toBe('Unnamed item');
  });
});

describe('pastedImageLabel', () => {
  it('uses the file name, unless the browser made it up or the list has it', () => {
    expect(pastedImageLabel('My cat.png', new Set())).toBe('My cat');
    expect(pastedImageLabel('image.png', new Set())).toBe('Pasted image');
    expect(pastedImageLabel('', new Set(['Pasted image']))).toBe('Pasted image 2');
    expect(pastedImageLabel('Image.PNG', new Set(['Pasted image', 'Pasted image 2']))).toBe('Pasted image 3');
    expect(pastedImageLabel('My cat.png', new Set(['My cat']))).toBe('Pasted image');
  });
});
