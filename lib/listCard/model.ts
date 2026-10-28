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
  /** Row background by position (index, and the number of rows with Unranked). */
  background: (index: number, rowCount: number) => string;
  rowName: (row: Tier, index: number) => string;
  tile: (item: Item) => ListCardTile;
}

export function buildListCard(input: BuildListCardInput): ListCardData {
  const {fit} = input;
  const rowCount = input.rows.length + 1;
  return {
    width: LIST_CARD.width,
    height: fit.height,
    tile: fit.tile,
    title: input.title,
    setName: input.setName,
    extraRows: fit.extraRows,
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

/** Fits and builds in one step. */
export function listCardData(
  input: Omit<BuildListCardInput, 'fit'> & {height: number | 'auto'; maxTiles?: number},
): ListCardData {
  const fit = fitListCard(listCardFitInput(input.rows, input.height, input.maxTiles));
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
