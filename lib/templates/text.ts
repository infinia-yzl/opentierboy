const FORBIDDEN_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x00ad, 0x00ad],
  [0x034f, 0x034f],
  [0x061c, 0x061c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f],
  [0x200b, 0x200b],
  [0x200e, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0x2800, 0x2800],
  [0x3164, 0x3164],
  [0xfeff, 0xfeff],
  [0xffa0, 0xffa0],
  [0xfff9, 0xfffb],
  [0xe0000, 0xe0fff],
];

const isForbidden = (codePoint: number): boolean => FORBIDDEN_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);

export function cleanTemplateText(value: unknown, maxCharacters: number): string | null {
  if (typeof value !== 'string' || value.length > maxCharacters * 4) return null;
  const characters = Array.from(value.normalize('NFC'));
  if (characters.some((character) => isForbidden(character.codePointAt(0) ?? 0))) return null;
  const collapsed = characters.join('').replace(/\s+/gu, ' ').trim();
  const length = Array.from(collapsed).length;
  return length >= 1 && length <= maxCharacters ? collapsed : null;
}
