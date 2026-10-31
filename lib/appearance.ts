/**
 * The site's appearance choices (owner decisions, 2026-10-28): the mode (Light, Dark or
 * System), the game colours of an image set's pages, and the font (Modern or Classic).
 *
 * The mode is kept by next-themes under `theme`. Ocean and Forest retired: a visitor who chose
 * one keeps its light or dark mode (LEGACY_THEMES). The font and the game colours are classes on
 * <html>, set before the page paints by APPEARANCE_SCRIPT (app/layout.tsx) and kept in
 * localStorage. Pure data and functions: no DOM access at import time.
 */

import {isStageLayout, LAYOUT_CHOICES, LAYOUT_PARAM} from '@/lib/zen/layouts';

export type Mode = 'light' | 'dark' | 'system';
export type FontChoice = 'modern' | 'classic';

export const MODES: readonly Mode[] = ['light', 'dark', 'system'];

/** Themes from before the revamp, and the mode each one keeps. */
export const LEGACY_THEMES: Readonly<Record<string, 'light' | 'dark'>> = {
  'ocean-light': 'light',
  'ocean-dark': 'dark',
  'forest-light': 'light',
  'forest-dark': 'dark',
};

/** Every theme name next-themes may find in storage. */
export const THEME_NAMES: readonly string[] = [...MODES, ...Object.keys(LEGACY_THEMES)];

/** The class next-themes puts on <html> for each stored theme name. */
export const THEME_CLASSES: Readonly<Record<string, string>> = {
  light: 'light',
  dark: 'dark',
  ...LEGACY_THEMES,
};

/** The mode a stored theme name stands for. Unknown names fall back to System. */
export function modeOf(theme: string | undefined): Mode {
  if (theme === 'light' || theme === 'dark' || theme === 'system') return theme;
  return (theme && LEGACY_THEMES[theme]) || 'system';
}

/**
 * Whether the page shows dark mode, for the Appearance button's icon. A retired dark theme
 * (ocean-dark, forest-dark) is dark: next-themes reports it under its old name. System follows
 * the device, which next-themes reports as `resolvedTheme`.
 */
export function showsDark(theme: string | undefined, resolvedTheme: string | undefined): boolean {
  const mode = modeOf(theme);
  return mode === 'system' ? resolvedTheme === 'dark' : mode === 'dark';
}

export const FONT_STORAGE_KEY = 'otb-font';
export const GAME_COLOURS_STORAGE_KEY = 'otb-game-colours';
/** On <html>: the Classic font (Nunito Sans, with Urbanist headings). Without it: Modern (Geologica). */
export const CLASSIC_FONT_CLASS = 'font-classic';
/** On <html>: game colours turned off. Game colours are on by default. */
export const NO_GAME_COLOURS_CLASS = 'no-game-colours';

/** The active image sets that have their own colour, by package name. */
export const GAME_COLOUR_KEYS: Readonly<Record<string, string>> = {
  'image-overwatch': 'overwatch',
  'image-reachthefinals': 'the-finals',
};

/** The game colour key of an image set, or undefined for sets without one. */
export function gameColourKey(packageName: string | undefined): string | undefined {
  return packageName ? GAME_COLOUR_KEYS[packageName] : undefined;
}

/** The dense editor's tile size (a view setting kept in this browser): Comfortable, or Compact. */
export type TileSizeChoice = 'comfortable' | 'compact';
export const TILE_SIZE_STORAGE_KEY = 'otb-tile-size';
/** On <html>: Compact tiles (48 px). Without it: Comfortable, the tiles the editor always had. */
export const COMPACT_TILES_CLASS = 'tiles-compact';

/**
 * The frame layouts that the `layout` parameter of a /rank address names (lib/zen/layouts.ts),
 * as the head script sets them on <html>: [data-zen-layout, data-zen-background or ''].
 */
const LAYOUT_ATTRIBUTES: Readonly<Record<string, readonly [string, string]>> = Object.fromEntries(
  Object.entries(LAYOUT_CHOICES)
    .filter(([, choice]) => isStageLayout(choice.layout))
    .map(([param, choice]) => [param, [choice.layout, choice.layout === 'overlay' && choice.background === 'transparent' ? 'transparent' : '']]),
);

/**
 * Runs in <head> before the page paints, so the chosen font, the game colours setting and the
 * tile size show from the first frame. On a /rank page whose address names a known layout (an
 * OBS browser source), it also turns Zen on in that layout, so the page never paints the editor
 * or a background first. It only reads localStorage and the address, compares them with fixed
 * values, and adds fixed classes and attributes; it never throws.
 */
export const APPEARANCE_SCRIPT = `(function(){try{var d=document.documentElement;`
  + `if(localStorage.getItem('${FONT_STORAGE_KEY}')==='classic')d.classList.add('${CLASSIC_FONT_CLASS}');`
  + `if(localStorage.getItem('${GAME_COLOURS_STORAGE_KEY}')==='off')d.classList.add('${NO_GAME_COLOURS_CLASS}');`
  + `if(localStorage.getItem('${TILE_SIZE_STORAGE_KEY}')==='compact')d.classList.add('${COMPACT_TILES_CLASS}');`
  + `}catch(e){}`
  + `try{var m=${JSON.stringify(LAYOUT_ATTRIBUTES)};`
  + `var l=location.pathname.indexOf('/rank')===0&&new URLSearchParams(location.search).get('${LAYOUT_PARAM}');`
  + `if(l&&Object.prototype.hasOwnProperty.call(m,l)){d.classList.add('zen-mode');d.setAttribute('data-zen-layout',m[l][0]);`
  + `if(m[l][1])d.setAttribute('data-zen-background',m[l][1]);}`
  + `}catch(e){}})();`;
