import {describe, expect, it} from 'vitest';
import {MAX_TITLE_LENGTH, shorten} from '@/lib/text';
import sharedLinks from '../fixtures/shared-links.json';

describe('shorten', () => {
  it('keeps text up to the length, and cuts longer text to that length with an ellipsis', () => {
    expect(shorten('abc', 3)).toBe('abc');
    expect(shorten('abcd', 3)).toBe('ab…');
    expect(shorten('x'.repeat(999_000), MAX_TITLE_LENGTH)).toBe(`${'x'.repeat(99)}…`);
    expect(Array.from(shorten('x'.repeat(999_000), MAX_TITLE_LENGTH))).toHaveLength(MAX_TITLE_LENGTH);
  });

  it('never cuts an emoji in half', () => {
    expect(shorten('😀😀😀😀', 3)).toBe('😀😀…');
    expect(shorten('😀😀😀', 3)).toBe('😀😀😀');
  });

  it('leaves every golden title as it is', () => {
    for (const link of sharedLinks) expect(shorten(link.expected.title, MAX_TITLE_LENGTH)).toBe(link.expected.title);
  });
});
