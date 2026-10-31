/**
 * Zen's layouts for creators (owner decision, 2026-10-31, "Approved to build"): the editor's own
 * Zen, Zen 16:9 for recording at 1920 x 1080, Zen 9:16 for Shorts and TikTok at 1080 x 1920,
 * and the stream overlay for OBS (the list in a panel over a green key, or over nothing).
 *
 * A layout is a view setting: it never changes the list, its link or the history (product rule
 * 2). The three creator layouts draw the editor in a frame: a box of the frame's aspect ratio,
 * as large as the window allows, with every size in frame pixels (the boards' pixels). At a
 * window of the frame's size, a frame pixel is a CSS pixel. The sizes are CSS variables
 * (stageVariables), so the browser lays the frame out at its real size: drag and drop measure
 * real boxes, with no CSS transform or zoom.
 *
 * Plain data and functions: no React, no browser globals.
 */

export type ZenLayout = 'editor' | 'wide' | 'tall' | 'overlay';
/** The layouts drawn in a frame: every layout but the editor's own Zen. */
export type StageLayout = Exclude<ZenLayout, 'editor'>;
export type OverlayBackground = 'green' | 'transparent';

/** One choice of the Zen bar's Layout menu: a layout, and for the overlay its background. */
export interface LayoutChoice {
  readonly layout: ZenLayout;
  readonly background: OverlayBackground;
}

/** The choices of the Layout menu, in order, by the value of the `layout` address parameter. */
export const LAYOUT_CHOICES: Readonly<Record<string, LayoutChoice>> = Object.freeze({
  editor: Object.freeze({layout: 'editor', background: 'green'}),
  '16x9': Object.freeze({layout: 'wide', background: 'green'}),
  '9x16': Object.freeze({layout: 'tall', background: 'green'}),
  'overlay-green': Object.freeze({layout: 'overlay', background: 'green'}),
  'overlay-transparent': Object.freeze({layout: 'overlay', background: 'transparent'}),
});

/** The names of the Layout menu's choices (the boards' titles). */
export const LAYOUT_CHOICE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  editor: 'Editor',
  '16x9': '16:9',
  '9x16': '9:16',
  'overlay-green': 'Overlay · green key',
  'overlay-transparent': 'Overlay · transparent',
});

/** The name of the address parameter that opens a list in a layout, for OBS browser sources. */
export const LAYOUT_PARAM = 'layout';

/** The key colour behind the overlay (the board's chroma green). */
export const OVERLAY_GREEN = '#00b140';

/** The `layout` parameter's value (and the Layout menu's value) of a choice. */
export function layoutChoiceId({layout, background}: LayoutChoice): string {
  if (layout === 'wide') return '16x9';
  if (layout === 'tall') return '9x16';
  if (layout === 'overlay') return `overlay-${background}`;
  return 'editor';
}

/** The choice that a `layout` parameter names, or null for none or an unknown value. */
export function parseLayoutParam(value: string | null | undefined): LayoutChoice | null {
  if (!value || !Object.prototype.hasOwnProperty.call(LAYOUT_CHOICES, value)) return null;
  return LAYOUT_CHOICES[value];
}

/**
 * The address of a list in a layout, for an OBS browser source: the page's address as it is
 * (`search` is the raw query string, `state` included, so nothing in the link is decoded and
 * written again), with the `layout` parameter in place of any earlier one. The app reads
 * `layout` once, when the page opens; the list's own link (`state`) never holds it.
 */
export function layoutAddress(origin: string, pathname: string, search: string, choice: LayoutChoice): string {
  const kept = search.replace(/^\?/, '').split('&').filter(part => part && !part.startsWith(`${LAYOUT_PARAM}=`));
  return `${origin}${pathname}?${[...kept, `${LAYOUT_PARAM}=${layoutChoiceId(choice)}`].join('&')}`;
}

/** The sizes of a frame layout, in frame pixels (the boards' pixels). */
export interface StageSizes {
  readonly frame: {readonly width: number; readonly height: number};
  /** Space around the content (16:9 and 9:16), or around the panel (overlay). */
  readonly padY: number;
  readonly padX: number;
  /** Space between the title, the rows and the Unranked tray. */
  readonly gap: number;
  /** The list title's text, and the wordmark's height. */
  readonly title: number;
  readonly wordmark: number;
  /** Tiles in the rows (also the height of an empty row). */
  readonly tile: number;
  /** The tier letter's column and its text. */
  readonly letterColumn: number;
  readonly letter: number;
  /** A tile's label text. */
  readonly label: number;
  /** Tiles of the Unranked tray with Pick freely. */
  readonly trayTile: number;
  /** "Unranked" or "Up next", and the "6 left" beside it. */
  readonly trayHeading: number;
  readonly trayCount: number;
  /** The item up next, its ring, and the name under it (9:16 only; 0 hides it). */
  readonly hero: number;
  readonly ring: number;
  readonly heroName: number;
  /** Tiles of the queue after the item up next, and how many of them show. */
  readonly queueTile: number;
  readonly queueLimit: number;
  /** The Zen bar: its height, its buttons, their icons and the step count's text. */
  readonly bar: number;
  readonly barButton: number;
  readonly barIcon: number;
  readonly barText: number;
  /** The overlay's panel: its width, padding and corners (0 for the other layouts). */
  readonly panelWidth: number;
  readonly panelPad: number;
  readonly panelRadius: number;
}

const WIDE_BAR = {bar: 56, barButton: 44, barIcon: 20, barText: 18};

/**
 * The boards: "16:9 · dark · Pick freely" (Stage169), "9:16 · In order" (Stage916) and
 * "Overlay · green key" (StreamOverlay).
 */
export const STAGE_SIZES: Readonly<Record<StageLayout, StageSizes>> = Object.freeze({
  wide: Object.freeze({
    frame: {width: 1920, height: 1080},
    padY: 40, padX: 72, gap: 24,
    title: 68, wordmark: 56,
    tile: 120, letterColumn: 160, letter: 76, label: 15,
    trayTile: 120, trayHeading: 24, trayCount: 18,
    hero: 136, ring: 4, heroName: 0,
    queueTile: 120, queueLimit: 12,
    ...WIDE_BAR,
    panelWidth: 0, panelPad: 0, panelRadius: 0,
  }),
  tall: Object.freeze({
    frame: {width: 1080, height: 1920},
    padY: 64, padX: 48, gap: 32,
    title: 80, wordmark: 48,
    tile: 120, letterColumn: 128, letter: 64, label: 15,
    trayTile: 160, trayHeading: 26, trayCount: 26,
    hero: 380, ring: 6, heroName: 56,
    queueTile: 120, queueLimit: 8,
    bar: 72, barButton: 60, barIcon: 26, barText: 22,
    panelWidth: 0, panelPad: 0, panelRadius: 0,
  }),
  overlay: Object.freeze({
    frame: {width: 1920, height: 1080},
    padY: 40, padX: 40, gap: 16,
    title: 44, wordmark: 36,
    tile: 96, letterColumn: 104, letter: 48, label: 13,
    trayTile: 72, trayHeading: 18, trayCount: 18,
    hero: 72, ring: 3, heroName: 0,
    queueTile: 72, queueLimit: 2,
    ...WIDE_BAR,
    panelWidth: 780, panelPad: 24, panelRadius: 16,
  }),
});

/** True for the layouts drawn in a frame. */
export function isStageLayout(layout: ZenLayout): layout is StageLayout {
  return layout !== 'editor';
}

/**
 * The CSS length of one frame pixel: the frame as large as the window allows, at the frame's
 * aspect ratio. At a window of the frame's size it is 1px.
 */
export function frameUnit({width, height}: StageSizes['frame']): string {
  return `min(calc(100vw / ${width}), calc(100dvh / ${height}))`;
}

const kebab = (name: string) => name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

/**
 * The CSS variables of a frame layout, for the frame's style: `--u` (frameUnit), and one
 * `--stage-<size>` per size of STAGE_SIZES in frame pixels (`calc(var(--u) * 120)`). The
 * components size themselves with them through the `stage:` variant (app/globals.css).
 */
export function stageVariables(layout: StageLayout): Record<string, string> {
  const sizes = STAGE_SIZES[layout];
  const variables: Record<string, string> = {'--u': frameUnit(sizes.frame)};
  for (const [name, value] of Object.entries(sizes)) {
    if (typeof value !== 'number' || name === 'queueLimit') continue;
    variables[`--stage-${kebab(name)}`] = `calc(var(--u) * ${value})`;
  }
  variables['--stage-frame-width'] = `calc(var(--u) * ${sizes.frame.width})`;
  variables['--stage-frame-height'] = `calc(var(--u) * ${sizes.frame.height})`;
  return variables;
}

/**
 * The items of the queue that a layout shows after the item up next: all of them in the
 * editor's Zen, and one line's worth in a frame (the queue is a strip on the boards).
 */
export function shownQueue<T>(rest: readonly T[], layout: ZenLayout): readonly T[] {
  return isStageLayout(layout) ? rest.slice(0, STAGE_SIZES[layout].queueLimit) : rest;
}
