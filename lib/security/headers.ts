/**
 * Security headers that next.config.ts sends on every page, beside the Content Security Policy
 * (lib/security/csp.ts).
 *
 * - Referrer-Policy: no-referrer. No request from the site names the page it came from. Link
 *   images already load with referrerPolicy="no-referrer"; this also covers the image requests
 *   html2canvas makes for Freeze Frame, and links people follow (PRIVACY.md).
 * - X-Content-Type-Options: nosniff. Browsers use the type the server states.
 * - Permissions-Policy: the site uses no camera, microphone, location or interest topics, so it
 *   turns them off, for itself and for anything it might embed.
 * - Cross-Origin-Opener-Policy: same-origin-allow-popups. A page from another site that opens
 *   this one gets no handle to it. Popups this site opens keep working (the Vercel Toolbar's
 *   sign-in on preview deployments).
 *
 * This file has no imports, so next.config.ts can import it with a relative path.
 */

export interface Header {
  key: string;
  value: string;
}

export const SECURITY_HEADERS: readonly Header[] = Object.freeze([
  {key: 'Referrer-Policy', value: 'no-referrer'},
  {key: 'X-Content-Type-Options', value: 'nosniff'},
  {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()'},
  {key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups'},
]);
