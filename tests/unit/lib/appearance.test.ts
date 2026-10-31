import {describe, expect, it} from 'vitest';
import {APPEARANCE_SCRIPT, COMPACT_TILES_CLASS, modeOf, showsDark, TILE_SIZE_STORAGE_KEY} from '@/lib/appearance';

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

/** Runs the head script against a fake page: its <html>, local storage and address. */
function runHeadScript({storage = {}, path = '/rank/overwatch/tank', search = ''}: {storage?: Record<string, string>; path?: string; search?: string}) {
  const classes = new Set<string>();
  const attributes = new Map<string, string>();
  const documentElement = {
    classList: {add: (name: string) => classes.add(name)},
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
  const run = new Function('document', 'localStorage', 'location', 'URLSearchParams', APPEARANCE_SCRIPT);
  run({documentElement}, {getItem: (key: string) => storage[key] ?? null}, {pathname: path, search}, URLSearchParams);
  return {classes: [...classes].sort(), attributes: Object.fromEntries(attributes)};
}

describe('APPEARANCE_SCRIPT', () => {
  it('writes the class tiles-compact when local storage says Compact', () => {
    expect(runHeadScript({storage: {[TILE_SIZE_STORAGE_KEY]: 'compact'}}).classes).toEqual([COMPACT_TILES_CLASS]);
    expect(runHeadScript({}).classes).toEqual([]);
  });

  it('writes Zen and the frame layout on <html> when a /rank address names a layout', () => {
    expect(runHeadScript({search: '?state=abc&layout=16x9'})).toEqual({classes: ['zen-mode'], attributes: {'data-zen-layout': 'wide'}});
    expect(runHeadScript({search: '?layout=overlay-transparent'}).attributes)
      .toEqual({'data-zen-layout': 'overlay', 'data-zen-background': 'transparent'});
    expect(runHeadScript({search: '?layout=overlay-green'}).attributes).toEqual({'data-zen-layout': 'overlay'});
  });

  it('writes nothing when the layout is unknown, the editor, or on a page other than /rank', () => {
    for (const run of [
      runHeadScript({search: '?layout=toString'}),
      runHeadScript({search: '?layout=editor'}),
      runHeadScript({search: '?layout=%3Cscript%3E'}),
      runHeadScript({path: '/about', search: '?layout=16x9'}),
    ]) {
      expect(run).toEqual({classes: [], attributes: {}});
    }
  });

  it('writes nothing and throws nothing when local storage throws', () => {
    const run = new Function('document', 'localStorage', 'location', 'URLSearchParams', APPEARANCE_SCRIPT);
    const throwing = {getItem: () => { throw new Error('denied'); }};
    expect(() => run({documentElement: {classList: {add: () => {}}, setAttribute: () => {}}}, throwing, {pathname: '/', search: ''}, URLSearchParams)).not.toThrow();
  });
});
