/**
 * Trusted image sites: link images from these hosts load without asking the visitor first.
 * Images from any other site wait until the visitor agrees (the privacy banner).
 *
 * The list lives in trusted-image-sites.json at the repository root. A host matches
 * exactly. An entry with `"subdomains": true` also matches every name under it.
 * `npm run check:trusted-sites` checks the list against a tracker blocklist.
 *
 * Pure code: no browser or Node APIs, so the edge OG route may use it (amendment A8: the
 * preview draws trusted-site images and label tiles for everything else).
 */
import trustedSitesFile from '@/trusted-image-sites.json';
import {checkLinkImageUrl} from './linkImage';

export interface TrustedImageSite {
  /** Lowercase punycode host name, without a trailing dot. */
  host: string;
  /** True when names under the host match too (`www.thefinals.wiki` for `thefinals.wiki`). */
  subdomains: boolean;
  /** Why the site is trusted, for people who read the list. */
  reason: string;
}

export interface TrustedSitesParseResult {
  sites: TrustedImageSite[];
  /** One message per problem. A valid file gives none. */
  errors: string[];
}

const ENTRY_KEYS = new Set(['host', 'subdomains', 'reason']);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface TrustedSitesParseOptions {
  /**
   * True when a host is a public suffix (`co.uk`, `github.io`). An entry with
   * `subdomains: true` must not be one: it would trust everyone's sites under it. The app
   * passes nothing, to keep the Public Suffix List out of the page; the unit tests and
   * scripts/check-trusted-sites.mjs pass a check built on tldts.
   */
  isPublicSuffix?: (host: string) => boolean;
}

/**
 * Reads the contents of trusted-image-sites.json. Entries with problems are left out and
 * reported in `errors`. Never throws (unless `isPublicSuffix` throws).
 */
export function parseTrustedSites(data: unknown, options: TrustedSitesParseOptions = {}): TrustedSitesParseResult {
  const sites: TrustedImageSite[] = [];
  const errors: string[] = [];
  if (!isPlainObject(data) || !Array.isArray(data.sites)) {
    return {sites, errors: ['The file must be an object with a "sites" array.']};
  }
  for (const key of Object.keys(data)) {
    if (key !== 'sites' && key !== '$comment') errors.push(`Unknown top-level key "${key}".`);
  }
  const seen = new Set<string>();
  data.sites.forEach((entry: unknown, index: number) => {
    const where = `Entry ${index + 1}`;
    if (!isPlainObject(entry)) {
      errors.push(`${where} must be an object.`);
      return;
    }
    const unknownKeys = Object.keys(entry).filter((key) => !ENTRY_KEYS.has(key));
    if (unknownKeys.length > 0) {
      errors.push(`${where} has unknown keys: ${unknownKeys.join(', ')}.`);
      return;
    }
    const {host, subdomains = false, reason} = entry;
    if (typeof host !== 'string') {
      errors.push(`${where} needs a "host" string.`);
      return;
    }
    if (typeof subdomains !== 'boolean') {
      errors.push(`${where} (${host}): "subdomains" must be true or false.`);
      return;
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      errors.push(`${where} (${host}) needs a "reason".`);
      return;
    }
    // A trusted host must itself pass the link image rules, written in its normal form.
    const check = checkLinkImageUrl(`https://${host}/`);
    if (!check.ok) {
      errors.push(`${where}: "${host}" is not an allowed image host (${check.reason}).`);
      return;
    }
    if (check.host !== host) {
      errors.push(`${where}: write "${host}" as "${check.host}" (lowercase punycode, no trailing dot).`);
      return;
    }
    if (subdomains && options.isPublicSuffix?.(host)) {
      errors.push(`${where}: "${host}" is a public suffix. "subdomains": true would trust everyone's sites under it.`);
      return;
    }
    if (seen.has(host)) {
      errors.push(`${where}: "${host}" is listed twice.`);
      return;
    }
    seen.add(host);
    sites.push({host, subdomains, reason});
  });
  return {sites, errors};
}

/** The trusted sites from trusted-image-sites.json. */
export const TRUSTED_IMAGE_SITES: readonly TrustedImageSite[] = Object.freeze(
  parseTrustedSites(trustedSitesFile).sites.map((site) => Object.freeze(site)),
);

function normaliseHost(host: string): string {
  const lower = host.toLowerCase();
  return lower.endsWith('.') ? lower.slice(0, -1) : lower;
}

/**
 * The trusted site entry that matches `host`, or undefined. Pass the `host` that
 * checkLinkImageUrl returned. Uppercase letters and one trailing dot are tolerated.
 */
export function findTrustedSite(
  host: string,
  sites: readonly TrustedImageSite[] = TRUSTED_IMAGE_SITES,
): TrustedImageSite | undefined {
  if (typeof host !== 'string' || host === '') return undefined;
  const name = normaliseHost(host);
  return sites.find((site) => name === site.host || (site.subdomains && name.endsWith(`.${site.host}`)));
}

/** True when images from `host` load without asking. */
export function isTrustedHost(host: string, sites: readonly TrustedImageSite[] = TRUSTED_IMAGE_SITES): boolean {
  return findTrustedSite(host, sites) !== undefined;
}

/** True when `url` passes checkLinkImageUrl and its host is trusted. Never throws. */
export function isTrustedImageUrl(url: unknown, sites: readonly TrustedImageSite[] = TRUSTED_IMAGE_SITES): boolean {
  const check = checkLinkImageUrl(url);
  return check.ok && isTrustedHost(check.host, sites);
}
