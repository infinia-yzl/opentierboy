import {describe, expect, it} from 'vitest';
import {fitListCard, type FitListCardInput, fittedTileCount, tilesPerLine} from '@/lib/listCard/fit';

/** The link preview frame: 1200×630, 132 px header, 36 px sides, 32 px below, 120 px labels. */
const preview = (counts: number[], extra: Partial<FitListCardInput> = {}): FitListCardInput => ({
  frame: {width: 1200, height: 630},
  headerHeight: 132,
  padding: {x: 36, bottom: 32},
  labelWidth: 120,
  rows: counts.map((itemCount) => ({itemCount})),
  tileMax: 92,
  tileMin: 48,
  ...extra,
});

/** Room for rows in the preview frame: 630 - 132 - 32. */
const ROOM = 466;

/** Width for tiles in the preview frame: 1200 - 72 - 120. */
const CONTENT = 1008;

const rowsHeight = (fit: ReturnType<typeof fitListCard>) =>
  fit.rows.reduce((sum, row) => sum + row.lines * fit.tile + 1, 0) + (fit.extraRows > 0 ? 34 : 0);

describe('tilesPerLine', () => {
  it('returns the count of whole tiles, at least 1, when called with a width and a tile size', () => {
    expect(tilesPerLine(1008, 92)).toBe(10);
    expect(tilesPerLine(1008, 48)).toBe(21);
    expect(tilesPerLine(10, 92)).toBe(1);
  });
});

describe('fitListCard in a fixed frame', () => {
  it('returns wrap mode at tileMax when a short list fits', () => {
    const fit = fitListCard(preview([4, 3, 2, 1, 0]));
    expect(fit.mode).toBe('wrap');
    expect(fit.tile).toBe(92);
    expect(fit.rows.map((row) => row.shown)).toEqual([4, 3, 2, 1, 0]);
    expect(fit.extraRows).toBe(0);
    expect(fit.height).toBe(630);
  });

  it('returns the largest tile that fits the frame when 6 to 9 rows need smaller tiles', () => {
    for (const rows of [6, 7, 8, 9]) {
      const fit = fitListCard(preview(Array.from({length: rows}, () => 3)));
      expect(fit.mode, `${rows} rows`).toBe('wrap');
      expect(fit.tile).toBeLessThanOrEqual(92);
      expect(fit.tile).toBeGreaterThanOrEqual(48);
      expect(rowsHeight(fit)).toBeLessThanOrEqual(ROOM);
      // One pixel larger would not fit.
      if (fit.tile < 92) expect((fit.tile + 1 + 1) * rows).toBeGreaterThan(ROOM);
    }
  });

  it('returns the line count of each wrapped row when a row has 25 items', () => {
    const fit = fitListCard(preview([25, 2]));
    expect(fit.mode).toBe('wrap');
    expect(fit.rows[0].lines).toBe(Math.ceil(25 / fit.perLine));
    expect(fit.rows[0].lines).toBeGreaterThan(1);
    expect(fit.rows[0].shown).toBe(25);
    expect(rowsHeight(fit)).toBeLessThanOrEqual(ROOM);
  });

  it('returns single-line mode with a +N tile per row when wrapping does not fit', () => {
    const fit = fitListCard(preview([100, 100, 100, 100, 100]));
    expect(fit.mode).toBe('single-line');
    expect(fit.extraRows).toBe(0);
    // Five rows of one line each can use the largest tiles.
    expect(fit.tile).toBe(92);
    for (const row of fit.rows) {
      expect(row.lines).toBe(1);
      expect(row.shown + 1).toBe(fit.perLine);
      expect(row.shown + row.more).toBe(100);
    }
    expect(rowsHeight(fit)).toBeLessThanOrEqual(ROOM);
  });

  it('returns summary mode with extraRows for the rest when 12 rows do not fit', () => {
    const fit = fitListCard(preview(Array.from({length: 12}, () => 2)));
    expect(fit.mode).toBe('summary');
    // 8 rows fit at 48 px above the bar; the tiles then grow to fill the room.
    expect(fit.rows.length).toBe(8);
    expect(fit.tile).toBe(Math.floor((ROOM - 34) / 8) - 1);
    expect(fit.rows.length + fit.extraRows).toBe(12);
    expect(fit.extraRows).toBeGreaterThan(0);
    expect(rowsHeight(fit)).toBeLessThanOrEqual(ROOM);
    // One more row would not fit above the bar.
    expect((fit.rows.length + 1) * 49 + 34).toBeGreaterThan(ROOM);
  });

  it('returns perLine minus 1 tiles per row, the last place for the +N tile, when rows overflow in summary mode', () => {
    const fit = fitListCard(preview(Array.from({length: 12}, () => 40)));
    expect(fit.mode).toBe('summary');
    for (const row of fit.rows) {
      expect(row.shown + 1).toBe(fit.perLine);
      expect(row.shown + row.more).toBe(40);
    }
  });

  it('returns 8 rows and extraRows 91 when the list has 99 short rows', () => {
    const fit = fitListCard(preview(Array.from({length: 99}, () => 11)));
    expect(fit.rows.length).toBe(8);
    expect(fit.extraRows).toBe(91);
  });

  it('returns at most maxTiles drawn tiles when 9 rows of 40 items pass maxTiles', () => {
    const counts = Array.from({length: 9}, () => 40);
    const fit = fitListCard(preview(counts, {maxTiles: 120}));
    expect(fittedTileCount(fit)).toBeLessThanOrEqual(120);
    for (const [index, row] of fit.rows.entries()) expect(row.shown + row.more).toBe(counts[index]);
  });

  it('returns every item drawn when the list has fewer items than maxTiles', () => {
    const fit = fitListCard(preview([10, 10, 10], {maxTiles: 120}));
    expect(fit.mode).toBe('wrap');
    expect(fittedTileCount(fit)).toBe(30);
  });

  it('returns no rows, extraRows 0 and tileMax when the list has no rows', () => {
    const fit = fitListCard(preview([]));
    expect(fit.rows).toEqual([]);
    expect(fit.extraRows).toBe(0);
    expect(fit.tile).toBe(92);
  });

  it('returns whole, non-negative counts when an item count is negative or fractional', () => {
    const fit = fitListCard(preview([-3, 2.7]));
    expect(fit.rows.map((row) => row.shown)).toEqual([0, 2]);
  });
});

describe('fitListCard in an auto frame', () => {
  const auto = (counts: number[], extra: Partial<FitListCardInput> = {}) =>
    preview(counts, {frame: {width: 1200, height: 'auto'}, maxCanvasHeight: 8000, ...extra});

  it('returns every item at tileMax and a height that grows with the list when it fits maxCanvasHeight', () => {
    const counts = Array.from({length: 20}, () => 30);
    const fit = fitListCard(auto(counts));
    expect(fit.mode).toBe('wrap');
    expect(fit.tile).toBe(92);
    expect(fit.extraRows).toBe(0);
    expect(fit.rows.every((row, index) => row.shown === counts[index] && row.more === 0)).toBe(true);
    const lines = Math.ceil(30 / tilesPerLine(CONTENT, 92));
    expect(fit.height).toBe(132 + 32 + 20 * (lines * 92 + 1));
  });

  it('returns the header, padding and 2 rows as the height when the list has 2 short rows', () => {
    const fit = fitListCard(auto([1, 0]));
    expect(fit.height).toBe(132 + 32 + 2 * 93);
  });

  it('returns tiles below tileMax and every item drawn when the list would pass maxCanvasHeight', () => {
    const counts = Array.from({length: 20}, () => 100);
    const fit = fitListCard(auto(counts));
    expect(fit.tile).toBeLessThan(92);
    expect(fit.height).toBeLessThanOrEqual(8000);
    expect(fit.extraRows).toBe(0);
    expect(fit.rows.every((row) => row.more === 0)).toBe(true);
  });

  it('returns extraRows for the rest when 400 rows pass maxCanvasHeight at tileFloor', () => {
    const counts = Array.from({length: 400}, () => 2);
    const fit = fitListCard(auto(counts, {tileFloor: 24}));
    expect(fit.height).toBeLessThanOrEqual(8000);
    expect(fit.rows.length + fit.extraRows).toBe(400);
    expect(fit.extraRows).toBeGreaterThan(0);
  });
});
