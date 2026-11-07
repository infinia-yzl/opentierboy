import {describe, expect, it} from 'vitest';
import {MAX_TITLE_LENGTH, shorten} from '@/lib/text';
import sharedLinks from '../../fixtures/shared-links.json';

describe('shorten', () => {
  it('returns text cut to the length with an ellipsis when it is longer, and unchanged otherwise', () => {
    expect(shorten('abc', 3)).toBe('abc');
    expect(shorten('abcd', 3)).toBe('ab…');
    expect(shorten('x'.repeat(999_000), MAX_TITLE_LENGTH)).toBe(`${'x'.repeat(99)}…`);
    expect(Array.from(shorten('x'.repeat(999_000), MAX_TITLE_LENGTH))).toHaveLength(MAX_TITLE_LENGTH);
  });

  it('returns no half emoji when the text is cut at an emoji', () => {
    expect(shorten('😀😀😀😀', 3)).toBe('😀😀…');
    expect(shorten('😀😀😀', 3)).toBe('😀😀😀');
  });

  it('returns each golden title unchanged when shortened to MAX_TITLE_LENGTH', () => {
    for (const link of sharedLinks) expect(shorten(link.expected.title, MAX_TITLE_LENGTH)).toBe(link.expected.title);
  });
});
