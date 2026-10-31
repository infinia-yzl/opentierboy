/**
 * Link images in link previews (amendments A8, A36).
 *
 * The server never fetches an address that a user chose, with one exception: images on the
 * trusted sites of trusted-image-sites.json (wiki image servers and Imgur). Those it loads
 * itself, with caps, and hands to next/og as data URLs. Every other link image, and every
 * device image, is drawn as a label tile.
 *
 * For each trusted image:
 * - the address must pass checkLinkImageUrl and match a trusted site exactly as listed (the
 *   sites a visitor allowed in their own browser do not count here);
 * - no redirects: a redirect could lead to any other address, so it counts as a failure;
 * - at most 1 MB and 4 seconds, and at most 24 images per preview;
 * - the reply must be a PNG, JPEG or GIF image, by its type header and by its first bytes
 *   (next/og cannot draw other formats).
 *
 * Link image addresses never reach inlineLocalImages: that function only loads the app's own
 * assets on local addresses, and link image addresses are never local (checkLinkImageUrl).
 */
import {checkLinkImageUrl} from '@/lib/images/linkImage';
import {isTrustedHost, TRUSTED_IMAGE_SITES, type TrustedImageSite} from '@/lib/images/trustedSites';
import {sniffImageType} from '@/lib/images/imageType';
import {readCapped, timeoutSignal, toBase64DataUrl} from './local-images';

export interface LinkImageLimits {
  maxBytes: number;
  timeoutMs: number;
  maxImages: number;
}

export const DEFAULT_LINK_IMAGE_LIMITS: Readonly<LinkImageLimits> = Object.freeze({
  maxBytes: 1024 * 1024,
  timeoutMs: 4_000,
  maxImages: 24,
});

const DRAWABLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif']);
const USER_AGENT = 'OpenTierBoy link preview (+https://opentierboy.com)';

export interface InlineLinkImagesOptions {
  limits?: Partial<LinkImageLimits>;
  sites?: readonly TrustedImageSite[];
  fetchImpl?: typeof fetch;
}

/** The normalised address of a link image the preview may load, or null. */
export function trustedPreviewUrl(url: unknown, sites: readonly TrustedImageSite[] = TRUSTED_IMAGE_SITES): string | null {
  const check = checkLinkImageUrl(url);
  return check.ok && isTrustedHost(check.host, sites) ? check.url : null;
}

async function loadTrustedImage(url: string, limits: LinkImageLimits, fetchImpl: typeof fetch): Promise<string | undefined> {
  try {
    const response = await fetchImpl(url, {
      redirect: 'manual',
      credentials: 'omit',
      signal: timeoutSignal(limits.timeoutMs),
      headers: {'User-Agent': USER_AGENT, Accept: 'image/png,image/jpeg,image/gif'},
    });
    if (response.status !== 200) return undefined;
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!DRAWABLE_TYPES.has(type)) return undefined;
    const bytes = await readCapped(response, limits.maxBytes);
    if (!bytes || bytes.byteLength === 0) return undefined;
    const sniffed = sniffImageType(bytes.subarray(0, 64));
    if (!sniffed || !DRAWABLE_TYPES.has(sniffed)) return undefined;
    return toBase64DataUrl(sniffed, bytes);
  } catch {
    return undefined;
  }
}

/**
 * Loads the trusted images among the link image addresses, and returns a function that gives
 * each address's data URL, or undefined (draw a label tile). Never rejects.
 */
export async function inlineTrustedLinkImages(
  urls: readonly string[],
  {limits: limitOverrides = {}, sites = TRUSTED_IMAGE_SITES, fetchImpl = fetch}: InlineLinkImagesOptions = {},
): Promise<(url: string | undefined) => string | undefined> {
  const limits = {...DEFAULT_LINK_IMAGE_LIMITS, ...limitOverrides};
  const wanted = new Map<string, string>(); // address as stored -> normalised address
  for (const url of urls) {
    if (wanted.size >= limits.maxImages) break;
    const normalised = trustedPreviewUrl(url, sites);
    if (normalised !== null && !wanted.has(url)) wanted.set(url, normalised);
  }
  const unique = Array.from(new Set(wanted.values()));
  const loaded = await Promise.all(unique.map((url) => loadTrustedImage(url, limits, fetchImpl)));
  const byNormalised = new Map(unique.map((url, index) => [url, loaded[index]]));
  return (url) => {
    if (url === undefined) return undefined;
    const normalised = wanted.get(url);
    return normalised === undefined ? undefined : byNormalised.get(normalised);
  };
}
