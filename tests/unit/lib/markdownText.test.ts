import {describe, expect, it} from 'vitest';
import {markdownText} from '@/lib/markdownText';

describe('markdownText', () => {
  it('returns the text as it is when it has no Markdown characters, @ or web address', () => {
    expect(markdownText('OVERWATCH - Tank')).toBe('OVERWATCH - Tank');
    expect(markdownText('#1 picks (2026)')).toBe('#1 picks (2026)');
  });

  it('returns each Markdown character with a backslash when the text has links, code or formatting', () => {
    expect(markdownText('[free](https://evil.example)')).toBe('\\[free\\](https:​//evil.example)');
    expect(markdownText('**bold** _it_ ~~no~~ `code` <b> a|b \\')).toBe('\\*\\*bold\\*\\* \\_it\\_ \\~\\~no\\~\\~ \\`code\\` \\<b\\> a\\|b \\\\');
  });

  it('returns a zero-width space after each @ when the text has a mention', () => {
    expect(markdownText('@everyone look')).toBe('@​everyone look');
  });

  it('returns a zero-width space inside :// when the text has a web address', () => {
    expect(markdownText('see https://evil.example')).toBe('see https:​//evil.example');
  });

  it('returns one line when the text has line breaks', () => {
    expect(markdownText('Top\n-# small\r\nprint')).toBe('Top -# small print');
  });
});
