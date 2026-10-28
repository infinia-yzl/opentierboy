/**
 * Fit rules for the list card: the one layout that link previews (app/api/og) and Freeze Frame
 * (components/ShareButton.tsx) both draw. Pure functions with no Node or browser APIs, so the
 * edge route can use them.
 *
 * A fixed frame (a link preview, 1200×630) tries these steps in order:
 * 1. Wrap: every item shows, and long rows wrap onto more lines. Tiles start at `tileMax` and
 *    shrink one pixel at a time, down to `tileMin`, until every row fits.
 * 2. One line a row: each row keeps one line of tiles and ends in a "+N" tile for the rest.
 *    Tiles take the largest size that lets every row fit.
 * 3. Summarise: one line a row at `tileMin`, as many rows as fit above a "+N more rows" bar.
 * `maxTiles` caps the tiles a fixed frame draws: a row draws at most its share of them.
 *
 * An 'auto' frame (Freeze Frame's "Whole list" picture) grows as tall as the list needs. It
 * shrinks tiles only when the picture would pass `maxCanvasHeight`, down to `tileFloor`. Past that,
 * as a last resort, it summarises rows like a fixed frame.
 */

export interface ListCardFrame {
  width: number;
  /** A fixed height, or 'auto' to grow with the list. */
  height: number | 'auto';
}

export interface FitListCardInput {
  frame: ListCardFrame;
  /** Height of the header above the rows (title and wordmark). */
  headerHeight: number;
  /** Space left and right of the rows, and below them. */
  padding: {x: number; bottom: number};
  /** Width of the tier label at the start of each row. */
  labelWidth: number;
  /** The rows to draw, in order (without the Unranked row). */
  rows: readonly {itemCount: number}[];
  tileMax: number;
  tileMin: number;
  /** Smallest tile an 'auto' frame may use before it summarises rows. Defaults to tileMin. */
  tileFloor?: number;
  /** Tallest picture an 'auto' frame may make. */
  maxCanvasHeight?: number;
  /** Most tiles a fixed frame draws (each "+N" tile counts as one). Defaults to no cap. */
  maxTiles?: number;
  /** Line under each row. */
  rowBorder?: number;
  /** Height of the "+N more rows" bar. */
  extraBarHeight?: number;
}

export interface FittedRow {
  /** Items drawn as tiles. */
  shown: number;
  /** Items in the "+N" tile at the end of the row (0: no "+N" tile). */
  more: number;
  /** Lines of tiles in the row. */
  lines: number;
}

export interface FittedListCard {
  tile: number;
  /** Tiles that fit on one line of a row. */
  perLine: number;
  /** The rows that show, in order: the first `rows.length` rows of the list. */
  rows: FittedRow[];
  /** Rows summarised in the "+N more rows" bar (0: no bar). */
  extraRows: number;
  /** Height of the card: the frame's height, or the height an 'auto' frame needs. */
  height: number;
  mode: 'wrap' | 'single-line' | 'summary';
}

const DEFAULT_ROW_BORDER = 1;
const DEFAULT_EXTRA_BAR = 34;
const DEFAULT_MAX_CANVAS_HEIGHT = 8000;

/** Tiles that fit on one line at this tile size. Always at least one. */
export function tilesPerLine(contentWidth: number, tile: number): number {
  return Math.max(1, Math.floor(contentWidth / tile));
}

function linesFor(itemCount: number, perLine: number): number {
  return Math.max(1, Math.ceil(itemCount / perLine));
}

/** Rows that wrap: every item shows. */
function wrapRows(counts: readonly number[], perLine: number): FittedRow[] {
  return counts.map((count) => ({shown: count, more: 0, lines: linesFor(count, perLine)}));
}

/** One line a row: a row that does not fit ends in a "+N" tile, which takes the last place. */
function singleLineRows(counts: readonly number[], perLine: number, cap: number): FittedRow[] {
  const places = Math.max(1, Math.min(perLine, cap));
  return counts.map((count) => {
    if (count <= places) return {shown: count, more: 0, lines: 1};
    const shown = Math.max(0, places - 1);
    return {shown, more: count - shown, lines: 1};
  });
}

function rowsHeight(rows: readonly FittedRow[], tile: number, border: number): number {
  return rows.reduce((sum, row) => sum + row.lines * tile + border, 0);
}

function drawnTiles(rows: readonly FittedRow[]): number {
  return rows.reduce((sum, row) => sum + row.shown + (row.more > 0 ? 1 : 0), 0);
}

export function fitListCard(input: FitListCardInput): FittedListCard {
  const {frame, headerHeight, padding, labelWidth, tileMax, tileMin} = input;
  const border = input.rowBorder ?? DEFAULT_ROW_BORDER;
  const barHeight = input.extraBarHeight ?? DEFAULT_EXTRA_BAR;
  const maxTiles = input.maxTiles ?? Number.POSITIVE_INFINITY;
  const counts = input.rows.map((row) => Math.max(0, Math.floor(row.itemCount)));
  const contentWidth = Math.max(1, frame.width - padding.x * 2 - labelWidth);
  const chrome = headerHeight + padding.bottom;

  if (frame.height === 'auto') {
    return fitAuto(input, counts, contentWidth, chrome, border, barHeight);
  }

  const available = Math.max(0, frame.height - chrome);
  const height = frame.height;

  // 1. Wrap: every item shows.
  const totalItems = counts.reduce((sum, count) => sum + count, 0);
  if (totalItems <= maxTiles) {
    for (let tile = tileMax; tile >= tileMin; tile--) {
      const rows = wrapRows(counts, tilesPerLine(contentWidth, tile));
      if (rowsHeight(rows, tile, border) <= available) {
        return {tile, perLine: tilesPerLine(contentWidth, tile), rows, extraRows: 0, height, mode: 'wrap'};
      }
    }
  }

  // 2. One line a row, every row shown, at the largest tile that fits.
  const share = (rowCount: number) => Math.max(1, Math.floor(maxTiles / Math.max(1, rowCount)));
  const largest = Math.floor(available / Math.max(1, counts.length)) - border;
  if (largest >= tileMin) {
    const tile = Math.min(tileMax, largest);
    const perLine = tilesPerLine(contentWidth, tile);
    const rows = singleLineRows(counts, perLine, share(counts.length));
    return {tile, perLine, rows, extraRows: 0, height, mode: 'single-line'};
  }

  // 3. Summarise: as many rows as fit above the bar.
  const tile = tileMin;
  const perLine = tilesPerLine(contentWidth, tile);
  const fitting = Math.max(0, Math.floor((available - barHeight) / (tile + border)));
  const shownCounts = counts.slice(0, fitting);
  const rows = singleLineRows(shownCounts, perLine, share(shownCounts.length));
  return {tile, perLine, rows, extraRows: counts.length - shownCounts.length, height, mode: 'summary'};
}

function fitAuto(
  input: FitListCardInput,
  counts: readonly number[],
  contentWidth: number,
  chrome: number,
  border: number,
  barHeight: number,
): FittedListCard {
  const maxHeight = input.maxCanvasHeight ?? DEFAULT_MAX_CANVAS_HEIGHT;
  const floor = Math.min(input.tileFloor ?? input.tileMin, input.tileMax);
  for (let tile = input.tileMax; tile >= floor; tile--) {
    const perLine = tilesPerLine(contentWidth, tile);
    const rows = wrapRows(counts, perLine);
    const height = chrome + rowsHeight(rows, tile, border);
    // Shrink only when the picture would be too tall.
    if (height <= maxHeight) return {tile, perLine, rows, extraRows: 0, height, mode: 'wrap'};
  }
  // Last resort: one line a row at the floor size, then a bar for the rows that do not fit.
  const tile = floor;
  const perLine = tilesPerLine(contentWidth, tile);
  const singleHeight = chrome + counts.length * (tile + border);
  if (singleHeight <= maxHeight) {
    const rows = singleLineRows(counts, perLine, Number.POSITIVE_INFINITY);
    return {tile, perLine, rows, extraRows: 0, height: singleHeight, mode: 'single-line'};
  }
  const fitting = Math.max(0, Math.floor((maxHeight - chrome - barHeight) / (tile + border)));
  const rows = singleLineRows(counts.slice(0, fitting), perLine, Number.POSITIVE_INFINITY);
  return {tile, perLine, rows, extraRows: counts.length - fitting, height: maxHeight, mode: 'summary'};
}

/** Tiles drawn for a fitted card, "+N" tiles included. */
export function fittedTileCount(card: Pick<FittedListCard, 'rows'>): number {
  return drawnTiles(card.rows);
}
