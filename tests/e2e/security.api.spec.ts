/**
 * Security headers on every kind of route: the Content Security Policy (lib/security/csp.ts, A11)
 * and the other headers (lib/security/headers.ts), which next.config.ts sends for every path.
 * These tests call the site directly, so they run once and need no browser.
 */
import {expect, test} from '../support/test';
import {rankingState} from '../support/links';

/** One address of each kind of route, and the status it answers with. */
const ROUTES: {kind: string; path: string; status: number}[] = [
  {kind: 'the home page', path: '/', status: 200},
  {kind: 'the empty editor', path: '/rank', status: 200},
  {kind: 'a shared list', path: `/rank/overwatch/tank?state=${rankingState('image-overwatch', {S: ['Mauga']})}`, status: 200},
  {kind: 'About', path: '/about', status: 200},
  {kind: 'a blog article', path: '/blog/overwatch-2-karq-tier-list-season-11', status: 200},
  {kind: 'the link preview image', path: '/api/og', status: 200},
  {kind: 'a page that does not exist', path: '/no-such-page', status: 404},
  {kind: 'an image set picture', path: '/images/image-overwatch/ana.webp', status: 200},
  {kind: 'the web app manifest', path: '/manifest.webmanifest', status: 200},
];

test.describe('security', () => {
  test.describe('headers', () => {
    for (const {kind, path, status} of ROUTES) {
      test(`returns the Content-Security-Policy and the other security headers when the request has ${kind}`, async ({request}) => {
        const response = await request.get(path, {maxRedirects: 0});
        expect(response.status(), path).toBe(status);
        const headers = response.headers();

        const policy = headers['content-security-policy'] ?? '';
        expect(policy).toContain("default-src 'self'");
        expect(policy).toContain("img-src 'self' https: data: blob:");
        expect(policy).toContain("object-src 'none'");
        expect(policy).toContain("frame-ancestors 'none'");
        expect(policy).not.toContain('unsafe-eval');

        expect(headers['referrer-policy']).toBe('no-referrer');
        expect(headers['x-content-type-options']).toBe('nosniff');
        expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(), browsing-topics=()');
        expect(headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
      });
    }
  });
});
