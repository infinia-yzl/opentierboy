/**
 * Shortening text that comes from shared links before it goes where its length costs: link
 * preview images (app/api/og) and page metadata (app/rank). A link may hold a title of up to a
 * million characters (A43), which repeated in <title>, og:title, twitter:title and JSON-LD made
 * a 9 MB page. Pure: runs on the server, in the edge runtime and in the browser.
 */

/** Titles in page metadata and link previews. No real list reaches it (golden titles: 53). */
export const MAX_TITLE_LENGTH = 100;

/**
 * The text, or its first characters and an ellipsis, `maxLength` characters in all. Counts
 * code points, so an emoji or another character outside the Basic Multilingual Plane is never
 * cut in half.
 */
export function shorten(text: string, maxLength: number): string {
  const characters = Array.from(text);
  return characters.length <= maxLength ? text : `${characters.slice(0, maxLength - 1).join('')}…`;
}
