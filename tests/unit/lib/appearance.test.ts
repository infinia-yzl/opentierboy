import {describe, expect, it} from 'vitest';
import {modeOf, showsDark} from '@/lib/appearance';

describe('modeOf', () => {
  it('maps the retired themes to Light and Dark', () => {
    expect(modeOf('ocean-light')).toBe('light');
    expect(modeOf('forest-dark')).toBe('dark');
    expect(modeOf(undefined)).toBe('system');
  });
});

describe('showsDark', () => {
  it('is true for Dark and for the retired dark themes', () => {
    expect(showsDark('dark', 'dark')).toBe(true);
    // next-themes reports a retired theme under its old name.
    expect(showsDark('ocean-dark', 'ocean-dark')).toBe(true);
    expect(showsDark('forest-dark', 'forest-dark')).toBe(true);
  });

  it('is false for Light and for the retired light themes', () => {
    expect(showsDark('light', 'light')).toBe(false);
    expect(showsDark('ocean-light', 'ocean-light')).toBe(false);
  });

  it('follows the device for System', () => {
    expect(showsDark('system', 'dark')).toBe(true);
    expect(showsDark('system', 'light')).toBe(false);
    expect(showsDark(undefined, undefined)).toBe(false);
  });
});
