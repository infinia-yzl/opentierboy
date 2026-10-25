/**
 * Load check for a link image or a device image, in the browser, before the image joins a
 * list (amendment A11).
 *
 * The browser cannot cap the bytes of an image from another site without CORS, so the
 * check caps what it can: the time to load (10 s by default) and the decoded size (8,192
 * pixels per side and 32 megapixels by default). The image loads with
 * `referrerPolicy = "no-referrer"`, so the other site does not learn which list the
 * visitor is looking at.
 *
 * Every failure comes with label-fallback data: the text and domain to show on a label
 * tile instead of the picture. The OG preview route can use `labelFallback` too: it is pure
 * and only uses the standard URL class.
 *
 * `checkImage` touches no browser API when the module is imported. Tests inject an Image
 * factory.
 */
import {checkLinkImageUrl} from './linkImage';

export interface ImageCheckLimits {
  /** Widest accepted image, in pixels. */
  maxWidth: number;
  /** Tallest accepted image, in pixels. */
  maxHeight: number;
  /** Most pixels in total (width × height). */
  maxPixels: number;
  /** How long the image may take to load, in milliseconds. */
  timeoutMs: number;
}

export const DEFAULT_IMAGE_CHECK_LIMITS: Readonly<ImageCheckLimits> = Object.freeze({
  maxWidth: 8192,
  maxHeight: 8192,
  maxPixels: 32 * 1024 * 1024,
  timeoutMs: 10_000,
});

/** Longest label-fallback text, in characters. */
export const MAX_FALLBACK_TEXT_LENGTH = 80;

export type ImageCheckFailure =
  /** The address is neither a valid link image address nor a `blob:` URL. Nothing was loaded. */
  | 'invalid-url'
  /** No Image element here (for example on the server). */
  | 'unsupported'
  /** The image failed to load or to decode. */
  | 'error'
  /** The image took longer than `timeoutMs`. */
  | 'timeout'
  /** Wider, taller or larger than the limits. */
  | 'too-large'
  /** The image reports no size (0 × 0). */
  | 'no-size'
  /** The caller's AbortSignal fired. */
  | 'aborted';

/** What a label tile shows when the picture is missing. Render it as text, never as HTML. */
export interface LabelFallback {
  /** The item's label, or a name made from the file name, or the domain. May be empty. */
  text: string;
  /** The image's display domain, or empty for a device image. */
  domain: string;
}

export type ImageCheckResult =
  | {ok: true; src: string; width: number; height: number}
  | {ok: false; reason: ImageCheckFailure; fallback: LabelFallback};

/** The part of HTMLImageElement the check uses. */
export interface ImageLike {
  src: string;
  referrerPolicy: string;
  decoding: string;
  crossOrigin: string | null;
  onload: ((...args: never[]) => unknown) | null;
  onerror: ((...args: never[]) => unknown) | null;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

export interface CheckImageOptions {
  /** The item's label, for the fallback text. */
  label?: string;
  limits?: Partial<ImageCheckLimits>;
  /** Creates the image element. Defaults to `new Image()`. */
  createImage?: () => ImageLike;
  /** Stops the check, for example when the component unmounts. */
  signal?: AbortSignal;
  /** Set to "anonymous" when the image must be drawn on a canvas (Freeze Frame) without tainting it. */
  crossOrigin?: 'anonymous';
}

const BLOB_URL = /^blob:https?:\/\/[^\s]+$/i;

function shorten(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(collapsed);
  return characters.length > MAX_FALLBACK_TEXT_LENGTH ? characters.slice(0, MAX_FALLBACK_TEXT_LENGTH).join('').trimEnd() : collapsed;
}

/** A readable name from the last part of an image address: `.../74px-Abrams_vertical.png` → `Abrams vertical`. */
function nameFromPath(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean).pop() ?? '';
  let name = segment;
  try {
    name = decodeURIComponent(segment);
  } catch {
    // Keep the raw text when it is not valid percent-encoding.
  }
  return name
    .replace(/\.[a-z0-9]{1,5}$/i, '') // extension
    .replace(/^\d{1,5}px-/i, '') // MediaWiki thumbnail prefix
    .replace(/[-_+]+/g, ' ');
}

/**
 * The text and domain for a label tile. Uses the label when there is one, otherwise a name
 * from the file name, otherwise the domain. Never throws.
 */
export function labelFallback(src: unknown, label?: unknown): LabelFallback {
  const check = checkLinkImageUrl(src);
  const domain = check.ok ? check.displayDomain : '';
  const fromLabel = typeof label === 'string' ? shorten(label) : '';
  if (fromLabel !== '') return {text: fromLabel, domain};
  if (!check.ok) return {text: '', domain};
  const fromPath = shorten(nameFromPath(new URL(check.url).pathname));
  return {text: fromPath !== '' ? fromPath : domain, domain};
}

function resolveLimits(limits: Partial<ImageCheckLimits> = {}): ImageCheckLimits {
  const resolved = {...DEFAULT_IMAGE_CHECK_LIMITS, ...limits};
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Image check limit ${name} must be a positive number.`);
  }
  return resolved;
}

function defaultCreateImage(): ImageLike {
  if (typeof Image === 'undefined') throw new Error('No Image element here');
  return new Image();
}

/**
 * Loads an image to check it. `src` must be a link image address that passes
 * checkLinkImageUrl (it loads the normalised address) or a `blob:` URL of a device image.
 * Resolves with the image size, or with a reason and label-fallback data. Never rejects.
 */
export function checkImage(src: string, options: CheckImageOptions = {}): Promise<ImageCheckResult> {
  const limits = resolveLimits(options.limits);
  const fallback = labelFallback(src, options.label);
  const fail = (reason: ImageCheckFailure): ImageCheckResult => ({ok: false, reason, fallback});

  let url: string;
  if (typeof src === 'string' && BLOB_URL.test(src)) {
    url = src;
  } else {
    const check = checkLinkImageUrl(src);
    if (!check.ok) return Promise.resolve(fail('invalid-url'));
    url = check.url;
  }

  const {signal} = options;
  if (signal?.aborted) return Promise.resolve(fail('aborted'));

  let image: ImageLike;
  try {
    image = (options.createImage ?? defaultCreateImage)();
  } catch {
    return Promise.resolve(fail('unsupported'));
  }

  return new Promise<ImageCheckResult>((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => finish(fail('aborted'));
    function finish(result: ImageCheckResult) {
      if (done) return;
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      image.onload = null;
      image.onerror = null;
      if (!result.ok) {
        // Stop a download that is still running.
        try {
          image.src = '';
        } catch {
          // Nothing to stop.
        }
      }
      resolve(result);
    }

    timer = setTimeout(() => finish(fail('timeout')), limits.timeoutMs);
    signal?.addEventListener('abort', onAbort, {once: true});
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!(width > 0 && height > 0)) finish(fail('no-size'));
      else if (width > limits.maxWidth || height > limits.maxHeight || width * height > limits.maxPixels) finish(fail('too-large'));
      else finish({ok: true, src: url, width, height});
    };
    image.onerror = () => finish(fail('error'));
    try {
      // Both must be set before src, which starts the download.
      image.referrerPolicy = 'no-referrer';
      image.decoding = 'async';
      if (options.crossOrigin) image.crossOrigin = options.crossOrigin;
      image.src = url;
    } catch {
      finish(fail('error'));
    }
  });
}
