import {getDomain} from 'tldts';
import {describe, expect, it} from 'vitest';
import trustedSitesFile from '@/trusted-image-sites.json';
import {
  findTrustedSite,
  isTrustedHost,
  isTrustedImageUrl,
  parseTrustedSites,
  TRUSTED_IMAGE_SITES,
  type TrustedImageSite,
} from '@/lib/images/trustedSites';

const site = (host: string, subdomains = false): TrustedImageSite => ({host, subdomains, reason: 'test'});
/** The same public suffix check as scripts/check-trusted-sites.mjs. */
const isPublicSuffix = (host: string) => getDomain(host, {allowPrivateDomains: true}) === null;

describe('TRUSTED_IMAGE_SITES', () => {
  it('returns no errors when parseTrustedSites reads trusted-image-sites.json', () => {
    expect(parseTrustedSites(trustedSitesFile, {isPublicSuffix}).errors).toEqual([]);
  });

  it('returns exactly the agreed hosts, with subdomains only for thefinals.wiki, when TRUSTED_IMAGE_SITES is read', () => {
    expect(TRUSTED_IMAGE_SITES.map(({host, subdomains}) => ({host, subdomains}))).toEqual([
      {host: 'thefinals.wiki', subdomains: true},
      {host: 'cdn.deadlock.wiki', subdomains: false},
      {host: 'static.wikia.nocookie.net', subdomains: false},
      {host: 'upload.wikimedia.org', subdomains: false},
      {host: 'i.imgur.com', subdomains: false},
    ]);
  });

  it('returns a frozen array of frozen entries when TRUSTED_IMAGE_SITES is read', () => {
    expect(Object.isFrozen(TRUSTED_IMAGE_SITES)).toBe(true);
    expect(Object.isFrozen(TRUSTED_IMAGE_SITES[0])).toBe(true);
  });
});

describe('isTrustedHost and isTrustedImageUrl', () => {
  it('returns true when the host is a listed host', () => {
    for (const host of ['cdn.deadlock.wiki', 'static.wikia.nocookie.net', 'upload.wikimedia.org', 'i.imgur.com']) {
      expect(isTrustedHost(host), host).toBe(true);
    }
    expect(isTrustedImageUrl('https://i.imgur.com/abc.png')).toBe(true);
    expect(isTrustedImageUrl('https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg')).toBe(true);
    expect(isTrustedImageUrl('https://cdn.deadlock.wiki/thumb/Abrams_vertical.png/74px-Abrams_vertical.png')).toBe(true);
  });

  it('returns true for a subdomain only when the entry has subdomains: true', () => {
    expect(isTrustedHost('thefinals.wiki')).toBe(true);
    expect(isTrustedImageUrl('https://www.thefinals.wiki/w/images/f/f7/Arenas_S2-Icon.png')).toBe(true);
    expect(isTrustedHost('imgur.com')).toBe(false);
    expect(isTrustedHost('evil.i.imgur.com')).toBe(false);
    expect(isTrustedHost('deadlock.wiki')).toBe(false);
    expect(isTrustedHost('wikimedia.org')).toBe(false);
    expect(isTrustedHost('commons.wikimedia.org')).toBe(false);
    expect(isTrustedHost('vignette.wikia.nocookie.net')).toBe(false);
  });

  it('returns false when the host only resembles a listed host', () => {
    for (const url of [
      'https://i.imgur.com.evil.example/a.png',
      'https://xi.imgur.com/a.png',
      'https://i-imgur.com/a.png',
      'https://notthefinals.wiki/a.png',
      'https://thefinals.wiki.evil.example/a.png',
      'https://evil.example/i.imgur.com/a.png',
      'https://evil.example/?u=https://i.imgur.com/a.png',
      'https://evil.example/#https://i.imgur.com/a.png',
      'https://і.imgur.com/a.png', // Cyrillic і
    ]) {
      expect(isTrustedImageUrl(url), url).toBe(false);
    }
  });

  it('returns false when an address with a trusted host breaks the link image rules', () => {
    for (const url of [
      'http://i.imgur.com/a.png',
      'https://i.imgur.com:8443/a.png',
      'https://user@i.imgur.com/a.png',
      'https://i.imgur.com@evil.example/a.png',
      'data:image/png;base64,AAAA',
      'https://i.imgur.com/' + 'a'.repeat(2000),
      42,
      undefined,
    ]) {
      expect(isTrustedImageUrl(url), String(url)).toBe(false);
    }
  });

  it('returns true when the host has upper case or one trailing dot', () => {
    expect(isTrustedHost('I.IMGUR.COM')).toBe(true);
    expect(isTrustedHost('i.imgur.com.')).toBe(true);
    expect(isTrustedImageUrl('https://I.IMGUR.COM./a.png')).toBe(true);
    expect(isTrustedHost('')).toBe(false);
  });

  it('returns matches against the given sites when a list other than TRUSTED_IMAGE_SITES is passed', () => {
    const sites = [site('images.example.org'), site('example.net', true)];
    expect(findTrustedSite('images.example.org', sites)).toEqual(sites[0]);
    expect(isTrustedHost('cdn.images.example.org', sites)).toBe(false);
    expect(isTrustedHost('a.b.example.net', sites)).toBe(true);
    expect(isTrustedHost('example.net', sites)).toBe(true);
    expect(isTrustedHost('i.imgur.com', sites)).toBe(false);
  });
});

describe('parseTrustedSites', () => {
  it('returns an error for subdomains: true on a public suffix when an isPublicSuffix check is given', () => {
    const data = {
      sites: [
        {host: 'github.io', subdomains: true, reason: 'r'},
        {host: 'co.uk', subdomains: true, reason: 'r'},
        {host: 'blogspot.com', subdomains: true, reason: 'r'},
        {host: 'example.co.uk', subdomains: true, reason: 'r'},
        {host: 'someone.github.io', subdomains: true, reason: 'r'},
        {host: 'pages.dev', reason: 'r'},
      ],
    };
    const result = parseTrustedSites(data, {isPublicSuffix});
    expect(result.sites.map(({host}) => host)).toEqual(['example.co.uk', 'someone.github.io', 'pages.dev']);
    expect(result.errors).toEqual([
      'Entry 1: "github.io" is a public suffix. "subdomains": true would trust everyone\'s sites under it.',
      'Entry 2: "co.uk" is a public suffix. "subdomains": true would trust everyone\'s sites under it.',
      'Entry 3: "blogspot.com" is a public suffix. "subdomains": true would trust everyone\'s sites under it.',
    ]);
    // Without the check (the app at run time) the entry is read as written.
    expect(parseTrustedSites(data).errors).toEqual([]);
  });

  it('returns the sites, with subdomains false by default, when the file is valid', () => {
    expect(parseTrustedSites({$comment: 'x', sites: [{host: 'a.example.org', reason: 'r'}, {host: 'b.example.org', subdomains: true, reason: 'r'}]})).toEqual({
      sites: [{host: 'a.example.org', subdomains: false, reason: 'r'}, {host: 'b.example.org', subdomains: true, reason: 'r'}],
      errors: [],
    });
  });

  it('returns a shape error when the file is not an object with a sites array or has unknown keys', () => {
    for (const data of [null, [], 'sites', {}, {sites: {}}]) {
      expect(parseTrustedSites(data)).toEqual({sites: [], errors: ['The file must be an object with a "sites" array.']});
    }
    expect(parseTrustedSites({sites: [], extra: 1}).errors).toEqual(['Unknown top-level key "extra".']);
  });

  it('returns only the valid entries, and one error per invalid entry, when entries have problems', () => {
    const result = parseTrustedSites({
      sites: [
        {host: 'ok.example.org', reason: 'r'},
        'ok.example.org',
        {host: 'ok2.example.org'},
        {host: 'ok3.example.org', reason: '  '},
        {host: 42, reason: 'r'},
        {host: 'a.example.org', subdomains: 'yes', reason: 'r'},
        {host: 'b.example.org', reason: 'r', wildcard: true},
        {host: '127.0.0.1', reason: 'r'},
        {host: 'localhost', reason: 'r'},
        {host: 'printer.local', reason: 'r'},
        {host: '*.example.org', reason: 'r'},
        {host: 'example.org:8443', reason: 'r'},
        {host: 'user@example.org', reason: 'r'},
        {host: 'I.IMGUR.COM', reason: 'r'},
        {host: 'i.imgur.com.', reason: 'r'},
        {host: 'bücher.de', reason: 'r'},
        {host: 'example.org/path', reason: 'r'},
        {host: 'ok.example.org', reason: 'again'},
      ],
    });
    expect(result.sites).toEqual([{host: 'ok.example.org', subdomains: false, reason: 'r'}]);
    expect(result.errors).toHaveLength(17);
    expect(result.errors.join('\n')).toMatchInlineSnapshot(`
      "Entry 2 must be an object.
      Entry 3 (ok2.example.org) needs a "reason".
      Entry 4 (ok3.example.org) needs a "reason".
      Entry 5 needs a "host" string.
      Entry 6 (a.example.org): "subdomains" must be true or false.
      Entry 7 has unknown keys: wildcard.
      Entry 8: "127.0.0.1" is not an allowed image host (ip-address).
      Entry 9: "localhost" is not an allowed image host (localhost).
      Entry 10: "printer.local" is not an allowed image host (private-name).
      Entry 11: "*.example.org" is not an allowed image host (invalid-host).
      Entry 12: "example.org:8443" is not an allowed image host (port).
      Entry 13: "user@example.org" is not an allowed image host (credentials).
      Entry 14: write "I.IMGUR.COM" as "i.imgur.com" (lowercase punycode, no trailing dot).
      Entry 15: write "i.imgur.com." as "i.imgur.com" (lowercase punycode, no trailing dot).
      Entry 16: write "bücher.de" as "xn--bcher-kva.de" (lowercase punycode, no trailing dot).
      Entry 17: write "example.org/path" as "example.org" (lowercase punycode, no trailing dot).
      Entry 18: "ok.example.org" is listed twice."
    `);
  });
});
