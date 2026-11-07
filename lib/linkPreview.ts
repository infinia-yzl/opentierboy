import Item from "@/models/Item";
import {PLACEHOLDER_IMAGE_URL} from "@/lib/packageItems";

/**
 * What link previews (the edge OG route, app/api/og/) draw: tier gradients, the app's own
 * images at preview size with absolute URLs, and label tiles for link and device images.
 * Pure functions: the base URL comes in as an argument (createTierCortex in lib/TierCortex.ts
 * binds it). No Node or browser APIs.
 */

/** The placeholder at link preview size (made by scripts/prepareImages.js). */
const PLACEHOLDER_PREVIEW_URL = '/placeholder-image.preview.png';

const OG_TIER_GRADIENTS = [
  'linear-gradient(to right, #d21203, #c40a01)',
  'linear-gradient(to right, #ee1e1e, #f84a44)',
  'linear-gradient(to right, #dca414, #dc991d)',
  'linear-gradient(to right, #c98b17, #e8910f)',
  'linear-gradient(to right, #7ad21f, #1aea1d)',
  'linear-gradient(to right, #72b231, #0cd30e)',
  'linear-gradient(to right, #4d7e15, #01b004)',
];

/**
 * The address the app's own images load from in link previews: on the server the production
 * site on Vercel (VERCEL_PROJECT_PRODUCTION_URL), else http://localhost:3000; in the browser the
 * page's own origin. Read when called, never at import time.
 */
export function defaultBaseUrl(): string {
  return typeof window === 'undefined' ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'http://localhost:3000'
    : window.location.origin;
}

/** The background of a row in a link preview. The last row (Unranked) is light grey. */
export function getOgTierGradient(index: number, tiersLength: number): string {
  if (index === tiersLength - 1) return 'linear-gradient(to right, #f0f0f0, #f0f0f0)';
  return OG_TIER_GRADIENTS[index % OG_TIER_GRADIENTS.length];
}

/** An absolute URL for one of the app's own files, such as the logo. */
export function getAssetUrl(path: string, baseUrl: string): string {
  return new URL(path, baseUrl).toString();
}

/**
 * The image URL for link previews: the PNG copy of a WebP image, or the placeholder's copy.
 * These copies are made at preview size (scripts/prepareImages.js), so previews draw fast.
 */
export function getOgSafeImageUrl(url: string, baseUrl: string): string {
  if (url === PLACEHOLDER_IMAGE_URL) url = PLACEHOLDER_PREVIEW_URL;

  // Convert WebP to PNG
  if (url.toLowerCase().endsWith('.webp')) {
    url = url.substring(0, url.length - 5) + '.png';
  }

  // Make URL absolute if it's not already
  if (!url.startsWith('http')) {
    url = new URL(url, baseUrl).toString();
  }

  return url;
}

/**
 * The item as link previews draw it. Link images and device images get no image URL, so
 * previews draw them as label tiles: the server never loads a link image's address (A8,
 * A36), and device images exist only in someone's browser.
 */
export function getOgSafeItem(item: Item, baseUrl: string): Item {
  if (item.source === 'link' || item.source === 'device' || !item.imageUrl) {
    return {...item, imageUrl: undefined};
  }
  return {
    ...item,
    imageUrl: getOgSafeImageUrl(item.imageUrl, baseUrl)
  };
}
