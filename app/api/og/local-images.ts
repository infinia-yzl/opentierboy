/**
 * next/og in Next.js 16 refuses to load images from local addresses such as localhost (its
 * protection against server-side request forgery). Outside Vercel, TierCortex builds the
 * preview's image URLs on http://localhost:3000, so the preview route loads those images
 * itself and hands them to next/og as data URLs. On Vercel the URLs are public, and next/og
 * keeps loading them itself.
 *
 * Only URLs that TierCortex builds for the app's own assets reach this code. Each image is
 * still capped in size and time, and must be served as an image.
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

/** Limits for each local image: anything larger, slower or not an image draws nothing. */
export interface LocalImageLimits {
  maxBytes: number;
  timeoutMs: number;
}

export const DEFAULT_LIMITS: LocalImageLimits = {maxBytes: 2 * 1024 * 1024, timeoutMs: 5_000};

export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/** Reads the body, or returns null as soon as it grows past `maxBytes`. */
export async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (let index = 0; index < chunks.length; index++) {
    bytes.set(chunks[index], offset);
    offset += chunks[index].byteLength;
  }
  return bytes;
}

/** A `data:` URL of the bytes, base64-encoded. */
export function toBase64DataUrl(type: string, bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let start = 0; start < bytes.length; start += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(start, start + chunk)));
  }
  return `data:${type};base64,${btoa(binary)}`;
}

async function toDataUrl(url: string, limits: LocalImageLimits): Promise<string> {
  try {
    const response = await fetch(url, {signal: timeoutSignal(limits.timeoutMs)});
    if (!response.ok) return BLANK_IMAGE;
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!/^image\/[a-z0-9.+-]+$/.test(type)) return BLANK_IMAGE;
    const bytes = await readCapped(response, limits.maxBytes);
    if (!bytes || bytes.byteLength === 0) return BLANK_IMAGE;
    return toBase64DataUrl(type, bytes);
  } catch {
    return BLANK_IMAGE;
  }
}

/**
 * Loads the images on local addresses among `urls`, and returns a function that gives the
 * `src` to use for each URL: a data URL for a local image, the URL itself otherwise.
 */
export async function inlineLocalImages(
  urls: string[],
  limits: LocalImageLimits = DEFAULT_LIMITS,
): Promise<(url: string) => string> {
  const localUrls = Array.from(new Set(urls.filter(isLocalUrl)));
  const dataUrls = await Promise.all(localUrls.map((url) => toDataUrl(url, limits)));
  const sources = new Map<string, string>();
  localUrls.forEach((url, index) => sources.set(url, dataUrls[index]));
  return (url: string) => sources.get(url) ?? url;
}
