import {describe, expect, it} from 'vitest';
import {cleanTemplateText} from '@/lib/templates/text';

const at = (codePoint: number) => String.fromCodePoint(codePoint);

describe('cleanTemplateText', () => {
  it('returns the text with single spaces and without outer spaces when the text is plain', () => {
    expect(cleanTemplateText('  Overwatch   heroes  ', 100)).toBe('Overwatch heroes');
    expect(cleanTemplateText('THE FINALS', 10)).toBe('THE FINALS');
  });

  it('returns markup unchanged as text when the text has markup', () => {
    const markup = '<img src=x onerror="alert(1)">';
    expect(cleanTemplateText(markup, 100)).toBe(markup);
  });

  it('returns the composed form when the text has a letter and a separate accent', () => {
    expect(cleanTemplateText(`e${at(0x301)}`, 10)).toBe(at(0xe9));
  });

  it('returns the text unchanged when an emoji uses a joiner and a variation selector', () => {
    const family = [0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467].map(at).join('');
    const heart = `${at(0x2764)}${at(0xfe0f)}`;
    expect(cleanTemplateText(`${family} ${heart}`, 20)).toBe(`${family} ${heart}`);
  });

  it('returns null when the value is not a string, is empty or is too long', () => {
    for (const value of [undefined, null, 7, {}, ['a'], '', '   ']) expect(cleanTemplateText(value, 10), String(value)).toBeNull();
    expect(cleanTemplateText('a'.repeat(11), 10)).toBeNull();
    expect(cleanTemplateText('a'.repeat(10), 10)).toBe('a'.repeat(10));
    expect(cleanTemplateText(at(0x1f600).repeat(10), 10)).toBe(at(0x1f600).repeat(10));
    expect(cleanTemplateText(at(0x1f600).repeat(11), 10)).toBeNull();
  });

  it('returns null when the text has a control character, a direction mark or an invisible character', () => {
    const forbidden = [0x00, 0x09, 0x0a, 0x0d, 0x1b, 0x7f, 0x85, 0xad, 0x034f, 0x061c, 0x115f, 0x1160, 0x17b4, 0x180e, 0x200b, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2060, 0x2061, 0x2064, 0x2066, 0x2069, 0x206a, 0x206f, 0x2800, 0x3164, 0xfeff, 0xffa0, 0xfffa, 0xe0001, 0xe0041, 0xe007f, 0xe0100];
    for (const codePoint of forbidden) expect(cleanTemplateText(`a${at(codePoint)}b`, 10), codePoint.toString(16)).toBeNull();
  });
});
