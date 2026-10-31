/**
 * User text made safe to put into Markdown that people paste into chat apps (Copy Markdown in
 * the share panel). A list title comes from a shared link, so anyone can choose it.
 *
 * - Markdown characters get a backslash, so a title cannot add links, code or formatting of
 *   its own. The title sits inside a line, so line-start markers (#, -, >) need nothing.
 * - "://" gets a zero-width space, so a web address in a title does not become a link.
 * - An @ gets a zero-width space after it, so "@everyone", "@here" or "@name" cannot notify
 *   anyone in Discord and similar apps. The text still reads the same.
 * - Line breaks become spaces, so the title stays on its line.
 */
const MARKDOWN_CHARACTERS = /[\\`*_~[\]<>|]/g;
const ZERO_WIDTH_SPACE = '\u200b';

export function markdownText(text: string): string {
  return String(text)
    .replace(/[\r\n]+/g, ' ')
    .replace(MARKDOWN_CHARACTERS, (character) => `\\${character}`)
    .replace(/:\/\//g, `:${ZERO_WIDTH_SPACE}//`)
    .replace(/@/g, `@${ZERO_WIDTH_SPACE}`);
}
