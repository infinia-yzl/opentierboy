export const FALLBACK_NAME = 'Item';

export function nameBase(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, '').trim();
  return base === '' ? FALLBACK_NAME : base;
}

export function automaticName(fileName: string, number: number): string {
  return `${nameBase(fileName)} ${number}`;
}

export function cleanName(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function pastedNames(text: string): string[] {
  return text.split(/\r\n|\r|\n/).map(cleanName).filter((line) => line !== '');
}

export function fillNames(names: readonly string[], from: number, lines: readonly string[]): {names: string[]; last: number} {
  const out = [...names];
  let last = from;
  lines.forEach((line, offset) => {
    const index = from + offset;
    if (index >= out.length) return;
    out[index] = line;
    last = index;
  });
  return {names: out, last};
}

export function itemNames(typed: readonly string[], fileName: string): string[] {
  return typed.map((name, index) => cleanName(name) || automaticName(fileName, index + 1));
}
