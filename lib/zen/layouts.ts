/**
 * Zen's layouts for creators (owner decision, 2026-10-31, "Approved to build"): the editor's own
 * Zen, Zen 16:9 for recording at 1920 x 1080, Zen 9:16 for Shorts and TikTok at 1080 x 1920,
 * and the stream overlay (the list in a panel over a green key, for a chroma key filter).
 *
 * A layout is a view setting, chosen in the Zen bar's Layout menu: it never changes the list, its
 * link or the history (product rule 2), and no address opens it (owner decision, 2026-11-01).
 * The three creator layouts draw the editor in a frame: a box of the frame's aspect ratio, under
 * a strip that holds the Zen bar (owner decision, 2026-11-01), the two together as large as the
 * window allows. Every size is in frame pixels (the boards' pixels): at a window of the frame's
 * width and the frame's height plus the strip's, a frame pixel is a CSS pixel. The sizes are CSS
 * variables (stageVariables), so the browser lays the frame out at its real size: drag and drop
 * measure real boxes, with no CSS transform or zoom.
 *
 * Plain data and functions: no React, no browser globals.
 */

export type ZenLayout = 'editor' | 'wide' | 'tall' | 'overlay';
/** The layouts drawn in a frame: every layout but the editor's own Zen. */
export type StageLayout = Exclude<ZenLayout, 'editor'>;

/** The layouts of the Layout menu, in order. */
export const ZEN_LAYOUTS: readonly ZenLayout[] = Object.freeze(['editor', 'wide', 'tall', 'overlay']);

/** The names of the Layout menu's layouts (the boards' titles). */
export const ZEN_LAYOUT_NAMES: Readonly<Record<ZenLayout, string>> = Object.freeze({
  editor: 'Editor',
  wide: '16:9',
  tall: '9:16',
  overlay: 'Overlay · green key',
});

/** The key colour behind the overlay (the board's chroma green). */
export const OVERLAY_GREEN = '#00b140';

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
  /** The row handle's width and its icon (rows move by mouse and keyboard in every layout). */
  readonly handle: number;
  readonly handleIcon: number;
  /** The strip above the frame that holds the Zen bar (its height), and the bar in it. */
  readonly strip: number;
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

const WIDE_BAR = {strip: 88, bar: 56, barButton: 44, barIcon: 20, barText: 18};

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
    handle: 60, handleIcon: 24,
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
    handle: 60, handleIcon: 24,
    trayTile: 160, trayHeading: 26, trayCount: 26,
    // The item up next: one and a half tiles (owner decision, 2026-11-01), its name in proportion.
    hero: 180, ring: 4, heroName: 28,
    queueTile: 120, queueLimit: 8,
    strip: 104, bar: 72, barButton: 60, barIcon: 26, barText: 22,
    panelWidth: 0, panelPad: 0, panelRadius: 0,
  }),
  overlay: Object.freeze({
    frame: {width: 1920, height: 1080},
    padY: 40, padX: 40, gap: 16,
    title: 44, wordmark: 36,
    tile: 96, letterColumn: 104, letter: 48, label: 13,
    handle: 48, handleIcon: 20,
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
 * The CSS length of one frame pixel: the frame and the strip above it as large as the frame
 * layout's box allows (components/ZenStage.tsx), at the frame's aspect ratio. Container units of
 * that box, not viewport units: browsers differ on whether viewport units leave out scrollbars,
 * and the box is the space the frame really has. At a box of the frame's width and the frame's
 * height plus the strip's, it is 1px.
 */
export function frameUnit({frame: {width, height}, strip}: Pick<StageSizes, 'frame' | 'strip'>): string {
  return `min(calc(100cqw / ${width}), calc(100cqh / ${height + strip}))`;
}

const kebab = (name: string) => name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

/**
 * The CSS variables of a frame layout, for the frame's style: `--u` (frameUnit), and one
 * `--stage-<size>` per size of STAGE_SIZES in frame pixels (`calc(var(--u) * 120)`). The
 * components size themselves with them through the `stage:` variant (app/globals.css).
 */
export function stageVariables(layout: StageLayout): Record<string, string> {
  const sizes = STAGE_SIZES[layout];
  const variables: Record<string, string> = {'--u': frameUnit(sizes)};
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
