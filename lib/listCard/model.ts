import type Item from '@/models/Item';
import type Tier from '@/models/Tier';
import type ImageSetConfig from '@/models/ImageSet';
import {fitListCard, type FitListCardInput, type FittedListCard} from './fit';

/**
 * The list card's data: what both renderers draw (components/ListCard.tsx). Pure functions with
 * no Node or browser APIs, so the edge OG route can use them.
 */

/** Sizes of the card (the canvas board "OGList"). */
export const LIST_CARD = Object.freeze({
  width: 1200,
  previewHeight: 630,
  headerHeight: 132,
  padding: Object.freeze({x: 36, bottom: 32}),
  labelWidth: 120,
  tileMax: 92,
  tileMin: 48,
  /** Freeze Frame may shrink tiles down to this size before it summarises rows. */
  tileFloor: 24,
  extraBarHeight: 34,
  rowBorder: 1,
  /** Tallest Freeze Frame picture, before the pixel ratio. */
  maxCanvasHeight: 8000,
  /** Item names show on tiles at least this large. */
  labelTileMin: 64,
  logoWidth: 720,
  logoHeight: 194,
  logoDrawnHeight: 88,
});

export interface ListCardTile {
  key: string;
  label: string;
  /** The image to draw. Without one, the tile shows the label. */
  src?: string;
  /** Set for link images: Freeze Frame checks their site's consent (CORS) before it draws them. */
  linkImage?: string;
}

export interface ListCardRow {
  key: string;
  name: string;
  background: string;
  tiles: ListCardTile[];
  /** Items in the "+N" tile (0: no "+N" tile). */
  more: number;
}

export interface ListCardData {
  width: number;
  height: number;
  tile: number;
  title: string;
  setName: string | null;
  rows: ListCardRow[];
  extraRows: number;
  /** A Freeze Frame picture frame (PICTURE_FRAMES). Without one, the card: the whole list, or a link preview. */
  frame?: PictureFrameName;
}

/**
 * Freeze Frame's picture frames (the canvas boards "Picture", "PictureSquare" and
 * "PicturePortrait"): fixed sizes for posts, with the title on top and the wordmark, the tagline
 * and the site's address at the bottom. Sizes in CSS pixels; the picture is drawn at exactly
 * this size.
 */
export type PictureFrameName = 'landscape' | 'square' | 'portrait';

export interface PictureFrame {
  width: number;
  height: number;
  /** Space on every side. */
  padding: number;
  /** Space between the header, the rows and the footer. */
  gap: number;
  /** Font sizes of the set name, the title and the footer text. */
  setNameSize: number;
  titleSize: number;
  footerSize: number;
  /** Height of the wordmark in the footer. */
  logoHeight: number;
  labelWidth: number;
  /** Largest font size of a tier name. */
  rowNameMax: number;
  tileMax: number;
  tileMin: number;
  extraBarHeight: number;
}

export const PICTURE_FRAMES: Readonly<Record<PictureFrameName, Readonly<PictureFrame>>> = Object.freeze({
  landscape: Object.freeze({
    width: 1200, height: 675, padding: 32, gap: 14, setNameSize: 13, titleSize: 40, footerSize: 14, logoHeight: 30,
    labelWidth: 108, rowNameMax: 44, tileMax: 84, tileMin: 40, extraBarHeight: 34,
  }),
  square: Object.freeze({
    width: 1080, height: 1080, padding: 48, gap: 24, setNameSize: 18, titleSize: 60, footerSize: 18, logoHeight: 44,
    labelWidth: 150, rowNameMax: 68, tileMax: 136, tileMin: 56, extraBarHeight: 44,
  }),
  portrait: Object.freeze({
    width: 1080, height: 1350, padding: 56, gap: 28, setNameSize: 20, titleSize: 72, footerSize: 20, logoHeight: 48,
    labelWidth: 160, rowNameMax: 76, tileMax: 160, tileMin: 64, extraBarHeight: 48,
  }),
});

/** The tagline in the footer of every picture frame. */
export const PICTURE_FRAME_TAGLINE = 'No ads, no logins, no sign ups. Create yours today.';
/** The site's address in the footer of every picture frame. */
export const PICTURE_FRAME_ADDRESS = 'opentierboy.com';

/** Heights of a picture frame's parts, which the renderer draws and the fit rules leave room for. */
export interface PictureFrameParts {
  setNameLine: number;
  titleLine: number;
  /** Set name, the space under it, and the title. */
  header: number;
  footer: number;
  /** Width of the rows' tile area. */
  contentWidth: number;
}

/** Space between the set name and the title. */
const FRAME_HEADER_SPACE = 4;

export function pictureFrameParts(frame: PictureFrame): PictureFrameParts {
  const setNameLine = Math.round(frame.setNameSize * 1.25);
  const titleLine = Math.round(frame.titleSize * 1.15);
  return {
    setNameLine,
    titleLine,
    header: setNameLine + FRAME_HEADER_SPACE + titleLine,
    footer: Math.max(frame.logoHeight, Math.round(frame.footerSize * 1.4)),
    contentWidth: frame.width - frame.padding * 2 - frame.labelWidth,
  };
}

/**
 * The fit input for the list's rows in a picture frame. The header always leaves room for the set
 * name line, so a list without a set name fits the same way (its rows sit centred in the space).
 */
export function pictureFrameFitInput(rows: readonly Pick<Tier, 'items'>[], name: PictureFrameName): FitListCardInput {
  const frame = PICTURE_FRAMES[name];
  const parts = pictureFrameParts(frame);
  return {
    frame: {width: frame.width, height: frame.height},
    headerHeight: frame.padding + parts.header + frame.gap,
    padding: {x: frame.padding, bottom: frame.gap + parts.footer + frame.padding},
    labelWidth: frame.labelWidth,
    rows: rows.map((row) => ({itemCount: row.items.length})),
    tileMax: frame.tileMax,
    tileMin: frame.tileMin,
    rowBorder: LIST_CARD.rowBorder,
    extraBarHeight: frame.extraBarHeight,
  };
}

/** The fit input for the list's rows, in a frame of the given height. */
export function listCardFitInput(rows: readonly Pick<Tier, 'items'>[], height: number | 'auto', maxTiles?: number): FitListCardInput {
  return {
    frame: {width: LIST_CARD.width, height},
    headerHeight: LIST_CARD.headerHeight,
    padding: LIST_CARD.padding,
    labelWidth: LIST_CARD.labelWidth,
    rows: rows.map((row) => ({itemCount: row.items.length})),
    tileMax: LIST_CARD.tileMax,
    tileMin: LIST_CARD.tileMin,
    tileFloor: LIST_CARD.tileFloor,
    maxCanvasHeight: LIST_CARD.maxCanvasHeight,
    maxTiles,
    rowBorder: LIST_CARD.rowBorder,
    extraBarHeight: LIST_CARD.extraBarHeight,
  };
}

export interface BuildListCardInput {
  title: string;
  setName: string | null;
  /** The ranked rows, in order, without the Unranked row. */
  rows: readonly Tier[];
  fit: FittedListCard;
  /** The picture frame the fit was made for, if any. */
  frame?: PictureFrameName;
  /** Row background by position (index, and the number of rows with Unranked). */
  background: (index: number, rowCount: number) => string;
  rowName: (row: Tier, index: number) => string;
  tile: (item: Item) => ListCardTile;
}

export function buildListCard(input: BuildListCardInput): ListCardData {
  const {fit} = input;
  const rowCount = input.rows.length + 1;
  return {
    width: input.frame ? PICTURE_FRAMES[input.frame].width : LIST_CARD.width,
    height: fit.height,
    tile: fit.tile,
    title: input.title,
    setName: input.setName,
    extraRows: fit.extraRows,
    ...(input.frame ? {frame: input.frame} : {}),
    rows: fit.rows.map((fitted, index) => {
      const row = input.rows[index];
      return {
        key: `${index}-${row.id}`,
        name: input.rowName(row, index),
        background: input.background(index, rowCount),
        tiles: row.items.slice(0, fitted.shown).map((item, position) => ({...input.tile(item), key: `${position}-${item.id}`})),
        more: fitted.more,
      };
    }),
  };
}

/**
 * Fits and builds in one step. With a picture frame, the frame sets the size and `height` is not
 * used.
 */
export function listCardData(
  input: Omit<BuildListCardInput, 'fit'> & {height: number | 'auto'; maxTiles?: number},
): ListCardData {
  const fit = fitListCard(input.frame
    ? pictureFrameFitInput(input.rows, input.frame)
    : listCardFitInput(input.rows, input.height, input.maxTiles));
  return buildListCard({...input, fit});
}

/**
 * The image set that at least two thirds of the list's items come from, by its display name, or
 * null for a mixed list or a list without image-set items. Ids are `<packageName>-<filename>`.
 */
export function listSetName(config: ImageSetConfig, rows: readonly Pick<Tier, 'items'>[]): string | null {
  const packages = Object.keys(config.packages ?? {}).sort((a, b) => b.length - a.length);
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const item of row.items) {
      const name = packages.find((packageName) => item.id.startsWith(`${packageName}-`));
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const total = rows.reduce((sum, row) => sum + row.items.length, 0);
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  // A mixed list names no set: the set must hold at least two thirds of the items.
  if (best === null || bestCount * 3 < total * 2) return null;
  return config.packages[best]?.displayName ?? null;
}
