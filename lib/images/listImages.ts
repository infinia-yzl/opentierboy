/**
 * Which images of a tier list come from links or from the device, and which link image sites
 * wait for the visitor's consent. Pure helpers for contexts/CustomImagesContext.tsx.
 */
import type Item from '@/models/Item';
import type Tier from '@/models/Tier';
import {deviceImageIdForUpload, isDeviceImageId} from '@/lib/state/deviceId';
import {checkLinkImageUrl} from './linkImage';
import {isTrustedHost, TRUSTED_IMAGE_SITES, type TrustedImageSite} from './trustedSites';

/**
 * The device image store key of an item, or null when the item is not an upload.
 * - v3 device images (`source: 'device'`) use their id.
 * - Items from legacy links have no source: an id that names no image-set item is an upload
 *   from before the device store, kept under its device image id (`legacy-<id>` when too
 *   short, A42). Ids that no prefix makes valid (image-set ids with a dot) are not uploads.
 * - Link images and unknown image-set ids from v3 links (`source: 'package'`) are not uploads.
 */
export function deviceImageKey(item: Pick<Item, 'id' | 'source'>, isPackageItem: (id: string) => boolean): string | null {
  if (item.source === 'link' || item.source === 'package') return null;
  if (item.source === 'device') return isDeviceImageId(item.id) ? item.id : deviceImageIdForUpload(item.id);
  if (isPackageItem(item.id)) return null;
  return deviceImageIdForUpload(item.id);
}

/** The device image keys of a list, each once, in list order. */
export function deviceImageKeys(tiers: readonly Tier[], isPackageItem: (id: string) => boolean): string[] {
  const keys = new Set<string>();
  for (const tier of tiers) {
    for (const item of tier.items) {
      const key = deviceImageKey(item, isPackageItem);
      if (key !== null) keys.add(key);
    }
  }
  return Array.from(keys);
}

/**
 * What a shared link carries, for the share panel: the list's link images travel in the link (it
 * holds their addresses), its device images do not (it holds only their ids). Counts items in
 * every row, the Unranked row included, because the link holds every row.
 */
export function linkImageCounts(tiers: readonly Tier[], isPackageItem: (id: string) => boolean): {link: number; device: number} {
  let link = 0;
  let device = 0;
  for (const tier of tiers) {
    for (const item of tier.items) {
      if (item.source === 'link') link++;
      else if (deviceImageKey(item, isPackageItem) !== null) device++;
    }
  }
  return {link, device};
}

/** A link image of the list: its normalised address and host, or null when the address breaks the rules. */
export function linkImageOf(item: Pick<Item, 'source' | 'url'>): {url: string; host: string; domain: string} | null {
  if (item.source !== 'link') return null;
  const check = checkLinkImageUrl(item.url);
  return check.ok ? {url: check.url, host: check.host, domain: check.displayDomain} : null;
}

/**
 * The label to show and to read out for an item: its label, or for a link image without one,
 * the site's name (its display domain), so the tile never has an empty caption or name.
 */
export function itemDisplayLabel(item: Pick<Item, 'content' | 'source' | 'url'>): string {
  const content = typeof item.content === 'string' ? item.content : '';
  if (content.trim() !== '' || item.source !== 'link') return content;
  const check = checkLinkImageUrl(item.url);
  if (check.ok) return check.displayDomain;
  try {
    return new URL(String(item.url)).hostname;
  } catch {
    return '';
  }
}

/** True when images from `host` may load: a trusted site, or one this visitor allowed. */
export function isImageHostAllowed(host: string, allowedHosts: ReadonlySet<string>, sites: readonly TrustedImageSite[] = TRUSTED_IMAGE_SITES): boolean {
  return allowedHosts.has(host) || isTrustedHost(host, sites);
}

/**
 * The hosts of the list's link images that wait for consent: valid addresses whose host is
 * neither trusted nor allowed. Each host once, in list order.
 */
export function hostsAwaitingConsent(tiers: readonly Tier[], allowedHosts: ReadonlySet<string>, sites: readonly TrustedImageSite[] = TRUSTED_IMAGE_SITES): string[] {
  const hosts = new Set<string>();
  for (const tier of tiers) {
    for (const item of tier.items) {
      const link = linkImageOf(item);
      if (link && !isImageHostAllowed(link.host, allowedHosts, sites)) hosts.add(link.host);
    }
  }
  return Array.from(hosts);
}

/**
 * A label for a pasted image that no item of the list uses yet: the file name without its
 * extension, unless browsers made it up ("image.png"), else "Pasted image", "Pasted image 2"...
 */
export function pastedImageLabel(fileName: string, takenLabels: ReadonlySet<string>): string {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, '').trim();
  if (base !== '' && !/^image$/i.test(base) && !takenLabels.has(base)) return base;
  if (!takenLabels.has('Pasted image')) return 'Pasted image';
  for (let number = 2; ; number++) {
    const label = `Pasted image ${number}`;
    if (!takenLabels.has(label)) return label;
  }
}
