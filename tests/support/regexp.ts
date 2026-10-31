/** Escapes the characters that have a meaning in a regular expression, so the text matches as it is. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
