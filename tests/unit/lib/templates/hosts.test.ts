import {describe, expect, it} from 'vitest';
import hostsFile from '@/trusted-template-hosts.json';
import {buildCspDirectives} from '@/lib/security/csp';
import {isTemplateHost, parseTemplateHosts, TEMPLATE_HOSTS, templateConnectSources} from '@/lib/templates/hosts';

describe('parseTemplateHosts', () => {
  it('returns the 2 GitHub hosts and no error when it reads trusted-template-hosts.json', () => {
    const parsed = parseTemplateHosts(hostsFile);
    expect(parsed.errors).toEqual([]);
    expect(parsed.hosts.map((entry) => entry.host)).toEqual(['raw.githubusercontent.com', 'gist.githubusercontent.com']);
    expect(TEMPLATE_HOSTS).toEqual(parsed.hosts);
  });

  it('returns an error and no host when an entry breaks a rule', () => {
    const cases: unknown[] = [
      {host: 'Raw.GitHubusercontent.com', reason: 'upper case'},
      {host: 'https://raw.githubusercontent.com', reason: 'a scheme'},
      {host: '*.githubusercontent.com', reason: 'a wildcard'},
      {host: 'localhost', reason: 'a single label'},
      {host: '127.0.0.1', reason: 'an IP address'},
      {host: 'example.org'},
      {host: 'example.org', reason: 'x', subdomains: true},
      'example.org',
    ];
    for (const entry of cases) {
      const parsed = parseTemplateHosts({hosts: [entry]});
      expect(parsed.hosts, JSON.stringify(entry)).toEqual([]);
      expect(parsed.errors, JSON.stringify(entry)).toHaveLength(1);
    }
  });

  it('returns an error when the file has another shape, an unknown key or a host twice', () => {
    expect(parseTemplateHosts(null).errors).toHaveLength(1);
    expect(parseTemplateHosts({hosts: 'x'}).errors).toHaveLength(1);
    expect(parseTemplateHosts({hosts: [], extra: 1}).errors).toEqual(['Unknown top-level key "extra".']);
    const twice = parseTemplateHosts({hosts: [{host: 'example.org', reason: 'a'}, {host: 'example.org', reason: 'b'}]});
    expect(twice.hosts).toHaveLength(1);
    expect(twice.errors).toEqual(['Entry 2 (example.org) is listed twice.']);
  });
});

describe('isTemplateHost', () => {
  it('returns true when the host is on the list, and false for a name under it or beside it', () => {
    expect(isTemplateHost('raw.githubusercontent.com')).toBe(true);
    expect(isTemplateHost('gist.githubusercontent.com')).toBe(true);
    expect(isTemplateHost('evil.raw.githubusercontent.com')).toBe(false);
    expect(isTemplateHost('githubusercontent.com')).toBe(false);
    expect(isTemplateHost('raw.githubusercontent.com.evil.example')).toBe(false);
  });
});

describe('templateConnectSources', () => {
  it("returns 'self' and one https source for each host when it builds the connect-src list", () => {
    expect(templateConnectSources()).toEqual(["'self'", 'https://raw.githubusercontent.com', 'https://gist.githubusercontent.com']);
    expect(templateConnectSources([])).toEqual(["'self'"]);
  });
});

describe('the Content Security Policy with the template hosts', () => {
  it('returns a connect-src of self and the 2 template hosts when next.config extends the policy', () => {
    const directives = buildCspDirectives({extend: {'connect-src': templateConnectSources()}});
    expect(directives['connect-src']).toEqual(["'self'", 'https://raw.githubusercontent.com', 'https://gist.githubusercontent.com']);
    expect(directives['default-src']).toEqual(["'self'"]);
  });

  it('returns a connect-src with the toolbar hosts too when the policy is for a Vercel preview', () => {
    const directives = buildCspDirectives({vercelToolbar: true, extend: {'connect-src': templateConnectSources()}});
    expect(directives['connect-src']).toEqual(["'self'", 'https://vercel.live', 'wss://ws-us3.pusher.com', 'https://raw.githubusercontent.com', 'https://gist.githubusercontent.com']);
  });
});
