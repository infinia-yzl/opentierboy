import {describe, expect, it} from 'vitest';
import {
  checkLinkImageUrl,
  LINK_IMAGE_REFUSALS,
  type LinkImageRefusal,
  MAX_LINK_IMAGE_URL_LENGTH,
} from '@/lib/images/linkImage';

function refusal(input: unknown): LinkImageRefusal | 'accepted' {
  const result = checkLinkImageUrl(input);
  return result.ok ? 'accepted' : result.reason;
}

function expectRefused(inputs: unknown[], reason: LinkImageRefusal) {
  for (const input of inputs) expect(refusal(input), JSON.stringify(input)).toBe(reason);
}

describe('checkLinkImageUrl with accepted addresses', () => {
  it('returns ok with url, host and displayDomain when the address is https', () => {
    expect(checkLinkImageUrl('https://i.imgur.com/abc123.png')).toEqual({
      ok: true,
      url: 'https://i.imgur.com/abc123.png',
      host: 'i.imgur.com',
      displayDomain: 'i.imgur.com',
    });
  });

  it('returns the path, query and fragment unchanged when the address has them', () => {
    const url = 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg?width=200#top';
    expect(checkLinkImageUrl(url)).toMatchObject({ok: true, url});
  });

  it('returns displayDomain without a leading www. when the host starts with www. and has two more labels', () => {
    expect(checkLinkImageUrl('https://www.thefinals.wiki/w/images/a.png')).toMatchObject({
      ok: true,
      host: 'www.thefinals.wiki',
      displayDomain: 'thefinals.wiki',
    });
    // "www.com" keeps its www: without it there would be no domain left.
    expect(checkLinkImageUrl('https://www.com/a.png')).toMatchObject({ok: true, displayDomain: 'www.com'});
  });

  it('returns the trimmed address when the input has surrounding spaces', () => {
    expect(checkLinkImageUrl('  https://i.imgur.com/a.png \n'.replace(/\n/g, ' '))).toMatchObject({
      ok: true,
      url: 'https://i.imgur.com/a.png',
    });
  });

  it('returns a lower-case host without port 443 or a trailing dot when the address has them', () => {
    expect(checkLinkImageUrl('HTTPS://I.IMGUR.COM:443/A.png')).toMatchObject({ok: true, url: 'https://i.imgur.com/A.png'});
    expect(checkLinkImageUrl('https://example.com:0443/a.png')).toMatchObject({ok: true, url: 'https://example.com/a.png'});
    expect(checkLinkImageUrl('https://i.imgur.com./a.png')).toMatchObject({
      ok: true,
      url: 'https://i.imgur.com/a.png',
      host: 'i.imgur.com',
    });
  });

  it('returns punycode in host and displayDomain when the host has non-ASCII characters', () => {
    expect(checkLinkImageUrl('https://bücher.de/x.png')).toMatchObject({
      ok: true,
      url: 'https://xn--bcher-kva.de/x.png',
      host: 'xn--bcher-kva.de',
      displayDomain: 'xn--bcher-kva.de',
    });
    // A Cyrillic "а" that looks like a Latin "a" stays visible as punycode.
    expect(checkLinkImageUrl('https://аpple.com/logo.png')).toMatchObject({ok: true, host: 'xn--pple-43d.com'});
    // Full-width letters and ideographic full stops map to their usual forms.
    expect(checkLinkImageUrl('https://ＥＸＡＭＰＬＥ。com/a.png')).toMatchObject({ok: true, host: 'example.com'});
  });

  it('returns ok when the host only resembles a local name', () => {
    for (const url of [
      'https://localhost.example.com/a.png',
      'https://local.example.com/a.png',
      'https://internal.example.org/a.png',
      'https://127-0-0-1.example.com/a.png',
      'https://my_site.example.org/a.png',
      'https://a.png.example.com/a.png',
    ]) {
      expect(refusal(url), url).toBe('accepted');
    }
  });

  it('returns ok when the address has exactly MAX_LINK_IMAGE_URL_LENGTH (2,000) characters', () => {
    const base = 'https://example.com/';
    const url = base + 'a'.repeat(MAX_LINK_IMAGE_URL_LENGTH - base.length);
    expect(url).toHaveLength(MAX_LINK_IMAGE_URL_LENGTH);
    expect(checkLinkImageUrl(url)).toMatchObject({ok: true, url});
  });

  it('returns the same result when checkLinkImageUrl gets the url it returned', () => {
    for (const input of ['HTTPS://Bücher.DE.:443/a b.png', 'https:\\\\example.com\\a.png', 'https://i.imgur.com/a.png']) {
      const first = checkLinkImageUrl(input);
      expect(first.ok, input).toBe(true);
      if (first.ok) expect(checkLinkImageUrl(first.url)).toEqual(first);
    }
  });
});

describe('checkLinkImageUrl with refused addresses', () => {
  it('returns reason \'not-a-string\' when the input is not a string', () => {
    expectRefused([undefined, null, 42, true, {}, ['https://i.imgur.com/a.png'], {toString: () => 'https://i.imgur.com/a.png'}], 'not-a-string');
  });

  it('returns reason \'empty\' when the input is empty or only spaces', () => {
    expectRefused(['', '   ', ' '], 'empty');
  });

  it('returns reason \'too-long\' when the address is over 2,000 characters before or after normalising', () => {
    const base = 'https://example.com/';
    expect(refusal(base + 'a'.repeat(MAX_LINK_IMAGE_URL_LENGTH - base.length + 1))).toBe('too-long');
    expect(refusal('https://example.com/' + 'a'.repeat(5_000_000))).toBe('too-long');
    // A space in the path becomes %20 when normalised, so the normalised address is longer.
    const spaces = base + ' '.repeat(MAX_LINK_IMAGE_URL_LENGTH - base.length - 1) + 'a';
    expect(spaces).toHaveLength(MAX_LINK_IMAGE_URL_LENGTH);
    expect(refusal(spaces)).toBe('too-long');
  });

  it('returns reason \'not-https\' when the scheme is http', () => {
    expectRefused(['http://i.imgur.com/a.png', 'HTTP://i.imgur.com/a.png', 'http:i.imgur.com/a.png'], 'not-https');
  });

  it('returns reason \'unsupported-scheme\' when the scheme is data, javascript or another non-https scheme', () => {
    expectRefused([
      'data:image/png;base64,iVBORw0KGgo=',
      'DATA:image/svg+xml,<svg onload=alert(1)>',
      'javascript:alert(1)',
      ' javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'vbscript:msgbox(1)',
      'blob:https://opentierboy.com/7d1c0a52-1b8e-4a4e-9c6f-0f3e0e2f3b1a',
      'file:///etc/passwd',
      'ftp://example.com/a.png',
      'ws://example.com/',
      'wss://example.com/',
      'about:blank',
      'chrome://settings',
      'filesystem:https://example.com/temporary/a.png',
      'example.com:443/a.png',
      'httpss://example.com/a.png',
    ], 'unsupported-scheme');
  });

  it('returns reason \'invalid-url\' when the address is relative, malformed or has control characters', () => {
    expectRefused([
      '//example.com/a.png',
      '/images/a.png',
      'images/a.png',
      'example.com/a.png',
      'https://',
      'https://ex ample.com/a.png',
      'https://exa%00mple.com/a.png',
      'https://xn--a.com/a.png',
      'https://[fe80::1%25eth0]/a.png',
      'https://1.2.3.4.5/a.png',
      'https://example.123/a.png',
      'https://example.0x7f/a.png',
      'java\tscript:alert(1)',
      'https://exa\nmple.com/a.png',
      'https://example.com/a\u0000.png',
      'https://example.com/a\u007f.png',
    ], 'invalid-url');
  });

  it('returns reason \'credentials\' when the address has a user name or password', () => {
    expectRefused([
      'https://user:pass@example.com/a.png',
      'https://user@example.com/a.png',
      'https://:pass@example.com/a.png',
      'https://i.imgur.com@evil.example.net/a.png',
      'https://example.com%2f@evil.example.net/a.png',
      'https://example.com@127.0.0.1/a.png',
    ], 'credentials');
  });

  it('returns reason \'port\' when the port is not 443', () => {
    expectRefused(['https://example.com:8443/a.png', 'https://example.com:80/a.png', 'https://example.com:1/a.png', 'https://i.imgur.com:444/a.png'], 'port');
  });

  it('returns reason \'ip-address\' when the host is an IPv4 address in any notation', () => {
    expectRefused([
      'https://127.0.0.1/a.png',
      'https://8.8.8.8/a.png',
      'https://10.0.0.1/a.png',
      'https://172.16.0.1/a.png',
      'https://192.168.1.1/a.png',
      'https://100.64.0.1/a.png',
      'https://169.254.169.254/latest/meta-data/',
      'https://0.0.0.0/a.png',
      'https://255.255.255.255/a.png',
      'https://224.0.0.1/a.png',
      // Decimal, hex, octal and short forms.
      'https://2130706433/a.png',
      'https://0x7f000001/a.png',
      'https://0x7f.0.0.1/a.png',
      'https://0177.0.0.1/a.png',
      'https://0177.0000.0000.0001/a.png',
      'https://127.1/a.png',
      'https://127.0.1/a.png',
      'https://0/a.png',
      'https://0x/a.png',
      // Percent-encoded, full-width, circled and ideographic forms.
      'https://%31%32%37.0.0.1/a.png',
      'https://１２７.０.０.１/a.png',
      'https://①②⑦.0.0.1/a.png',
      'https://127。0。0。1/a.png',
      'https://127.0.0.1./a.png',
    ], 'ip-address');
  });

  it('returns reason \'ip-address\' when the host is an IPv6 address in any notation', () => {
    expectRefused([
      'https://[::1]/a.png',
      'https://[::]/a.png',
      'https://[0:0:0:0:0:0:0:1]/a.png',
      'https://[::ffff:127.0.0.1]/a.png',
      'https://[::ffff:7f00:1]/a.png',
      'https://[0:0:0:0:0:ffff:7f00:1]/a.png',
      'https://[::127.0.0.1]/a.png',
      'https://[fe80::1]/a.png',
      'https://[fc00::1]/a.png',
      'https://[fd12:3456:789a::1]/a.png',
      'https://[2001:db8::1]/a.png',
      'https://[2606:4700:4700::1111]/a.png',
      'https://[64:ff9b::7f00:1]/a.png',
      'https://[::1]:443/a.png',
    ], 'ip-address');
  });

  it('returns reason \'localhost\' when the host is localhost or a name under it', () => {
    expectRefused([
      'https://localhost/a.png',
      'https://LOCALHOST/a.png',
      'https://localhost./a.png',
      'https://localhost%2e/a.png',
      'https://LOCALHOST．/a.png',
      'https://local­host/a.png',
      'https://foo.localhost/a.png',
      'https://foo.bar.localhost./a.png',
    ], 'localhost');
  });

  it('returns reason \'private-name\' when the host is a single label, a reserved top-level name or an IP echo service', () => {
    expectRefused([
      'https://router/a.png',
      'https://intranet/a.png',
      'https://png/a.png',
      'https://printer.local/a.png',
      'https://nas.LOCAL./a.png',
      'https://db.internal/a.png',
      'https://metadata.google.internal/computeMetadata/v1/',
      'https://router.lan/a.png',
      'https://nas.home/a.png',
      'https://router.home.arpa/a.png',
      'https://1.0.0.127.in-addr.arpa/a.png',
      'https://server.corp/a.png',
      'https://box.localdomain/a.png',
      'https://site.test/a.png',
      'https://www.example/a.png',
      'https://nothing.invalid/a.png',
      'https://hidden.onion/a.png',
      'https://name.alt/a.png',
      'https://127.0.0.1.nip.io/a.png',
      'https://10-0-0-1.sslip.io/a.png',
      'https://nip.io/a.png',
      'https://anything.localtest.me/a.png',
      'https://lvh.me/a.png',
      'https://7f000001.c0a80001.rbndr.us/a.png',
      'https://localho.st/a.png',
      'https://app.localho.st/a.png',
      'https://fuf.me/a.png',
      'https://anything.fuf.me/a.png',
      'https://local.gd/a.png',
      'https://sub.local.gd/a.png',
    ], 'private-name');
  });

  it('returns reason \'invalid-host\' when the host breaks DNS name rules', () => {
    expectRefused([
      'https://example.com../a.png',
      'https://a..b.com/a.png',
      'https://.example.com/a.png',
      'https://*.example.com/a.png',
      `https://${'a'.repeat(64)}.com/a.png`,
      `https://${Array.from({length: 64}, () => 'abc').join('.')}.com/a.png`,
    ], 'invalid-host');
  });

  it('returns ok: false, without throwing, when the input is a Symbol, BigInt, function, URL or lone surrogate', () => {
    const inputs: unknown[] = [Symbol('x'), BigInt(1), () => 'https://i.imgur.com/a.png', new URL('https://i.imgur.com/a.png'), Object.create(null), '\ud800', 'https://\ud800.com/', '%', 'https://%/'];
    for (const input of inputs) {
      expect(() => checkLinkImageUrl(input)).not.toThrow();
      expect(checkLinkImageUrl(input).ok).toBe(false);
    }
  });

  it('returns each LINK_IMAGE_REFUSALS reason, listed once, when given one sample address per reason', () => {
    // One address for each reason. The Record type makes the compiler ask for a new reason here.
    const samples: Record<LinkImageRefusal, unknown> = {
      'not-a-string': 42,
      'empty': '   ',
      'too-long': 'https://example.com/' + 'a'.repeat(MAX_LINK_IMAGE_URL_LENGTH),
      'invalid-url': 'https://exa\nmple.com/a.png',
      'not-https': 'http://i.imgur.com/a.png',
      'unsupported-scheme': 'data:image/png;base64,AAAA',
      'credentials': 'https://user@i.imgur.com/a.png',
      'port': 'https://example.com:8443/a.png',
      'ip-address': 'https://127.0.0.1/a.png',
      'localhost': 'https://localhost/a.png',
      'private-name': 'https://intranet/a.png',
      'invalid-host': 'https://a..b.com/a.png',
    };
    expect([...LINK_IMAGE_REFUSALS].sort()).toEqual(Object.keys(samples).sort());
    expect(new Set(LINK_IMAGE_REFUSALS).size).toBe(LINK_IMAGE_REFUSALS.length);
    for (const [reason, input] of Object.entries(samples)) expect(refusal(input), reason).toBe(reason);
  });
});
