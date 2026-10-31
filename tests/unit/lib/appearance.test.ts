import {describe, expect, it} from 'vitest';
import {modeOf, showsDark} from '@/lib/appearance';

describe('modeOf', () => {
  it('returns light, dark or system when the theme is a retired theme or undefined', () => {
    expect(modeOf('ocean-light')).toBe('light');
    expect(modeOf('forest-dark')).toBe('dark');
    expect(modeOf(undefined)).toBe('system');
  });
});

describe('showsDark', () => {
  it('returns true when the theme is dark or a retired dark theme', () => {
    expect(showsDark('dark', 'dark')).toBe(true);
    // next-themes reports a retired theme under its old name.
    expect(showsDark('ocean-dark', 'ocean-dark')).toBe(true);
    expect(showsDark('forest-dark', 'forest-dark')).toBe(true);
  });

  it('returns false when the theme is light or a retired light theme', () => {
    expect(showsDark('light', 'light')).toBe(false);
    expect(showsDark('ocean-light', 'ocean-light')).toBe(false);
  });

  it('returns true only when the theme is system and resolvedTheme is dark', () => {
    expect(showsDark('system', 'dark')).toBe(true);
    expect(showsDark('system', 'light')).toBe(false);
    expect(showsDark(undefined, undefined)).toBe(false);
  });
});
