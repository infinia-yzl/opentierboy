/**
 * Editor page paths (`/rank`, `/rank/<set>`, `/rank/<set>/<tag>`) as Recently viewed and
 * snapshot files store them. Both read paths from untrusted places (local storage, a file), and
 * the app later uses them as links, so only plain /rank paths pass.
 *
 * Plain code: no imports, no browser APIs.
 */

export const MAX_RANK_PATH_CHARS = 512;

/**
 * `/rank` and its sub-paths. Segments use the characters slugs and percent-encoding use.
 * No `//`, `\`, `?`, `#`, spaces or a scheme, so the path can never point to another site or run
 * script when used as a link.
 */
const RANK_PATH = /^\/rank(?:\/[A-Za-z0-9._~%-]+)*$/;

/** A segment of dots only, plain or percent-encoded ('..', '%2e%2e', '.%2E'): it would leave /rank. */
const DOT_SEGMENT = /^(?:\.|%2e)+$/i;

/**
 * The path with trailing slashes removed (`/rank/` becomes `/rank`), or null when it is not a
 * plain /rank path of at most MAX_RANK_PATH_CHARS characters.
 */
export function normalizeRankPath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length > MAX_RANK_PATH_CHARS + 16) return null;
  const trimmed = path.length > 5 ? path.replace(/\/+$/, '') : path;
  if (trimmed.length > MAX_RANK_PATH_CHARS || !RANK_PATH.test(trimmed)) return null;
  if (trimmed.split('/').some(segment => DOT_SEGMENT.test(segment))) return null;
  return trimmed;
}
