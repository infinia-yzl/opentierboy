import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  buildContentSecurityPolicy,
  buildCspDirectives,
  contentSecurityPolicyHeader,
  serializeCsp,
} from '@/lib/security/csp';

describe('Content Security Policy', () => {
  it('builds the A11 policy, with script-src stated so inline scripts keep working', () => {
    expect(buildContentSecurityPolicy()).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' https: data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
  });

  it('allows images from any https site and local device images, and nothing over http', () => {
    const {'img-src': images} = buildCspDirectives();
    expect(images).toEqual(["'self'", 'https:', 'data:', 'blob:']);
    expect(images).not.toContain('http:');
    expect(images).not.toContain('*');
  });

  it('keeps fonts and connections on the site itself', () => {
    const directives = buildCspDirectives();
    // No font-src or connect-src: default-src 'self' applies to both.
    expect(directives['font-src']).toBeUndefined();
    expect(directives['connect-src']).toBeUndefined();
    expect(directives['default-src']).toEqual(["'self'"]);
  });

  it('never allows eval or other upgrades in production', () => {
    const policy = buildContentSecurityPolicy();
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('upgrade-insecure-requests');
    expect(policy).not.toContain('vercel');
  });

  it('allows eval for next dev', () => {
    expect(buildCspDirectives({dev: true})['script-src']).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
  });

  it('adds the Vercel Toolbar hosts for preview deployments', () => {
    const directives = buildCspDirectives({vercelToolbar: true});
    expect(directives['script-src']).toEqual(["'self'", "'unsafe-inline'", 'https://vercel.live']);
    expect(directives['style-src']).toEqual(["'self'", "'unsafe-inline'", 'https://vercel.live']);
    expect(directives['img-src']).toEqual(["'self'", 'https:', 'data:', 'blob:', 'https://vercel.live', 'https://vercel.com']);
    // Stating these directives replaces default-src for them, so they keep 'self'.
    expect(directives['connect-src']).toEqual(["'self'", 'https://vercel.live', 'wss://ws-us3.pusher.com']);
    expect(directives['frame-src']).toEqual(["'self'", 'https://vercel.live']);
    expect(directives['font-src']).toEqual(["'self'", 'https://vercel.live', 'https://assets.vercel.com']);
    expect(directives['frame-ancestors']).toEqual(["'none'"]);
  });

  it('extends directives without duplicates', () => {
    const directives = buildCspDirectives({extend: {'connect-src': ["'self'", 'https:'], 'img-src': ['https:'], 'upgrade-insecure-requests': []}});
    expect(directives['connect-src']).toEqual(["'self'", 'https:']);
    expect(directives['img-src']).toEqual(["'self'", 'https:', 'data:', 'blob:']);
    expect(serializeCsp(directives)).toMatch(/; upgrade-insecure-requests$/);
  });

  it('refuses unknown directives and sources that could break the header', () => {
    expect(() => buildCspDirectives({extend: {'img-scr': ['https:']}})).toThrow('Unknown CSP directive');
    expect(() => buildCspDirectives({extend: {constructor: ['https:']}})).toThrow('Unknown CSP directive');
    expect(() => buildCspDirectives({extend: {['__proto__']: ['https:']}})).toThrow('Unknown CSP directive');
    for (const source of ['https: ; script-src *', 'a,b', 'https://x.example\nSet-Cookie: x=1', '', 42]) {
      expect(() => buildCspDirectives({extend: {'img-src': [source as string]}}), String(source)).toThrow('Invalid CSP source');
    }
    expect(() => buildCspDirectives({extend: {'img-src': 'https:' as unknown as string[]}})).toThrow('needs an array');
  });

  it('gives the header for next.config, or a report-only header for a trial', () => {
    expect(contentSecurityPolicyHeader()).toEqual({key: 'Content-Security-Policy', value: buildContentSecurityPolicy()});
    expect(contentSecurityPolicyHeader({reportOnly: true})).toEqual({
      key: 'Content-Security-Policy-Report-Only',
      value: buildContentSecurityPolicy(),
    });
  });

  it('returns a new object each time', () => {
    const first = buildCspDirectives();
    first['img-src'].push('http:');
    expect(buildCspDirectives()['img-src']).not.toContain('http:');
  });

  it('has no imports, so next.config can load it without path aliases', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../lib/security/csp.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });
});
