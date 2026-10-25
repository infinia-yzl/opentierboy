/**
 * Content Security Policy header for OpenTierBoy (amendment A11). Not wired into
 * next.config yet.
 *
 * The policy:
 *   default-src 'self'
 *   script-src 'self' 'unsafe-inline'
 *   style-src 'self' 'unsafe-inline'
 *   img-src 'self' https: data: blob:
 *   object-src 'none'
 *   base-uri 'self'
 *   frame-ancestors 'none'
 *   form-action 'self'
 *
 * Why each part:
 * - script-src: A11 says to leave script-src out, because the App Router, next-themes and
 *   the JSON-LD block use inline scripts and nonces would force dynamic rendering. Without
 *   script-src, browsers use default-src 'self' for scripts, which blocks those inline
 *   scripts. So this policy states script-src 'self' 'unsafe-inline' to keep A11's intent.
 *   (The JSON-LD block is data, so it never needed this, but the other two do.) `next dev`
 *   also needs 'unsafe-eval' (option `dev`).
 * - No 'unsafe-eval' in production. zod 4 runs `new Function("")` when it builds an object
 *   schema, to test whether eval works. The policy blocks that, and the browser reports a
 *   violation even though zod catches the error. So app code imports `z` from lib/zod.ts,
 *   which turns zod's code generation and that test off (`jitless`, amendment A39).
 * - style-src 'unsafe-inline': React style attributes, Radix UI and sonner set inline styles.
 * - img-src: link images come from any https site, device images are blob: URLs, and the
 *   Freeze Frame preview and next/image placeholders use data: and blob:.
 * - Fonts: next/font/google downloads the fonts at build time and serves them from
 *   /_next/static/media, so default-src 'self' covers them. The OG route loads its font on
 *   the server, where no CSP applies.
 * - Connections: the app only talks to its own origin (page data, prefetching). html2canvas
 *   and html2canvas-pro load images through image elements and need no connections without
 *   their `proxy` option, which the app does not use. The `next dev` WebSocket is
 *   same-origin, which 'self' covers. If link images are ever loaded with fetch() (for
 *   example to read their bytes for a snapshot), connect-src must add https:.
 *   Reading a `data:` or `blob:` URL with fetch() also counts as a connection: connect-src
 *   must then list `data:` and `blob:`. That is common when snapshot images are re-encoded
 *   (the 5d wiring). Use `extend: {'connect-src': ["'self'", 'data:', 'blob:']}`, or decode
 *   through an image element and a canvas, which img-src already allows.
 * - No upgrade-insecure-requests: it would break the local http server that the end-to-end
 *   tests use.
 *
 * Option `vercelToolbar` adds the hosts that Vercel's documentation lists for the toolbar
 * and comments on preview deployments ("Using a Content Security Policy" in
 * https://vercel.com/docs/vercel-toolbar/managing-toolbar).
 *
 * This file has no imports, so next.config can import it (after a move to next.config.ts,
 * or through a relative import) without path aliases.
 */

export type CspDirectives = Record<string, string[]>;

export interface CspOptions {
  /** For `next dev`: allows 'unsafe-eval', which React and Next.js use in development. */
  dev?: boolean;
  /** For Vercel preview deployments: allows the Vercel Toolbar (vercel.live and friends). */
  vercelToolbar?: boolean;
  /** Use Content-Security-Policy-Report-Only, which reports violations and blocks nothing. */
  reportOnly?: boolean;
  /** Extra sources per directive, for example `{'connect-src': ['https:']}`. */
  extend?: CspDirectives;
}

const BASE_POLICY: Readonly<CspDirectives> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'https:', 'data:', 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
};

const VERCEL_TOOLBAR: Readonly<CspDirectives> = {
  'script-src': ['https://vercel.live'],
  'style-src': ['https://vercel.live'],
  'img-src': ['https://vercel.live', 'https://vercel.com'],
  'connect-src': ["'self'", 'https://vercel.live', 'wss://ws-us3.pusher.com'],
  'frame-src': ["'self'", 'https://vercel.live'],
  'font-src': ["'self'", 'https://vercel.live', 'https://assets.vercel.com'],
};

/** CSP Level 3 directives. A name outside this list is a typo, so it throws. */
const KNOWN_DIRECTIVES = new Set([
  'base-uri',
  'child-src',
  'connect-src',
  'default-src',
  'fenced-frame-src',
  'font-src',
  'form-action',
  'frame-ancestors',
  'frame-src',
  'img-src',
  'manifest-src',
  'media-src',
  'object-src',
  'report-to',
  'report-uri',
  'require-trusted-types-for',
  'sandbox',
  'script-src',
  'script-src-attr',
  'script-src-elem',
  'style-src',
  'style-src-attr',
  'style-src-elem',
  'trusted-types',
  'upgrade-insecure-requests',
  'worker-src',
]);
// A source must not end the directive (;), start a new policy (,) or break the header line.
const SOURCE = /^[^\s;,]+$/;

function merge(target: CspDirectives, extra: Readonly<CspDirectives>) {
  for (const [name, sources] of Object.entries(extra)) {
    if (!KNOWN_DIRECTIVES.has(name)) throw new Error(`Unknown CSP directive: ${JSON.stringify(name)}`);
    if (!Array.isArray(sources)) throw new Error(`CSP directive ${name} needs an array of sources.`);
    if (!Object.prototype.hasOwnProperty.call(target, name)) target[name] = [];
    const list = target[name];
    for (const source of sources) {
      if (typeof source !== 'string' || !SOURCE.test(source)) throw new Error(`Invalid CSP source for ${name}: ${JSON.stringify(source)}`);
      if (!list.includes(source)) list.push(source);
    }
  }
}

/** The directives and their sources, in a fixed order. */
export function buildCspDirectives(options: CspOptions = {}): CspDirectives {
  const directives: CspDirectives = {};
  merge(directives, BASE_POLICY);
  if (options.dev) merge(directives, {'script-src': ["'unsafe-eval'"]});
  if (options.vercelToolbar) merge(directives, VERCEL_TOOLBAR);
  if (options.extend) merge(directives, options.extend);
  return directives;
}

/** The header value: `name source source; name source`. */
export function serializeCsp(directives: Readonly<CspDirectives>): string {
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(' '))
    .join('; ');
}

/** The policy as one header value. */
export function buildContentSecurityPolicy(options: CspOptions = {}): string {
  return serializeCsp(buildCspDirectives(options));
}

/**
 * The header for next.config `headers()`, for example
 * `{source: '/(.*)', headers: [contentSecurityPolicyHeader({dev: process.env.NODE_ENV !== 'production'})]}`.
 */
export function contentSecurityPolicyHeader(options: CspOptions = {}): {key: string; value: string} {
  return {
    key: options.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    value: buildContentSecurityPolicy(options),
  };
}
