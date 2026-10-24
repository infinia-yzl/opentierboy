/**
 * next/og in Next.js 16 refuses to load images from local addresses such as localhost (its
 * protection against server-side request forgery). Outside Vercel, TierCortex builds the
 * preview's image URLs on http://localhost:3000, so the preview route loads those images
 * itself and hands them to next/og as data URLs. On Vercel the URLs are public, and next/og
 * keeps loading them itself.
 *
 * Only URLs that TierCortex builds for the app's own assets reach this code.
 */

const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1'];

/** A transparent 1×1 PNG. next/og draws nothing for an image it cannot load; neither does this. */
export const BLANK_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTNAMES.includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function toDataUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) return BLANK_IMAGE;
    const type = response.headers.get('content-type') ?? 'image/png';
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let start = 0; start < bytes.length; start += chunk) {
      binary += String.fromCharCode(...Array.from(bytes.subarray(start, start + chunk)));
    }
    return `data:${type};base64,${btoa(binary)}`;
  } catch {
    return BLANK_IMAGE;
  }
}

/**
 * Loads the images on local addresses among `urls`, and returns a function that gives the
 * `src` to use for each URL: a data URL for a local image, the URL itself otherwise.
 */
export async function inlineLocalImages(urls: string[]): Promise<(url: string) => string> {
  const localUrls = Array.from(new Set(urls.filter(isLocalUrl)));
  const dataUrls = await Promise.all(localUrls.map(toDataUrl));
  const sources = new Map<string, string>();
  localUrls.forEach((url, index) => sources.set(url, dataUrls[index]));
  return (url: string) => sources.get(url) ?? url;
}
