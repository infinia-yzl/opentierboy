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
  it('counts whole tiles and never returns less than one', () => {
    expect(tilesPerLine(1008, 92)).toBe(10);
    expect(tilesPerLine(1008, 48)).toBe(21);
    expect(tilesPerLine(10, 92)).toBe(1);
  });
});

describe('fitListCard in a fixed frame', () => {
  it('keeps the largest tiles when a short list fits', () => {
    const fit = fitListCard(preview([4, 3, 2, 1, 0]));
    expect(fit.mode).toBe('wrap');
    expect(fit.tile).toBe(92);
    expect(fit.rows.map((row) => row.shown)).toEqual([4, 3, 2, 1, 0]);
    expect(fit.extraRows).toBe(0);
    expect(fit.height).toBe(630);
  });

  it('shrinks tiles until every row fits, and never draws past the frame', () => {
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

  it('wraps long rows onto more lines and counts those lines', () => {
    const fit = fitListCard(preview([25, 2]));
    expect(fit.mode).toBe('wrap');
    expect(fit.rows[0].lines).toBe(Math.ceil(25 / fit.perLine));
    expect(fit.rows[0].lines).toBeGreaterThan(1);
    expect(fit.rows[0].shown).toBe(25);
    expect(rowsHeight(fit)).toBeLessThanOrEqual(ROOM);
  });

  it('keeps one line a row with "+N" tiles when wrapping does not fit', () => {
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

  it('summarises the rows that do not fit in a "+N more rows" bar', () => {
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

  it('shows a row\'s "+N" tile in the last place of its line', () => {
    const fit = fitListCard(preview(Array.from({length: 12}, () => 40)));
    expect(fit.mode).toBe('summary');
    for (const row of fit.rows) {
      expect(row.shown + 1).toBe(fit.perLine);
      expect(row.shown + row.more).toBe(40);
    }
  });

  it('draws at most 100 short rows as a bar and a few rows', () => {
    const fit = fitListCard(preview(Array.from({length: 99}, () => 11)));
    expect(fit.rows.length).toBe(8);
    expect(fit.extraRows).toBe(91);
  });

  it('keeps the drawn tiles under maxTiles', () => {
    const counts = Array.from({length: 9}, () => 40);
    const fit = fitListCard(preview(counts, {maxTiles: 120}));
    expect(fittedTileCount(fit)).toBeLessThanOrEqual(120);
    for (const [index, row] of fit.rows.entries()) expect(row.shown + row.more).toBe(counts[index]);
  });

  it('draws every item when the list is within maxTiles', () => {
    const fit = fitListCard(preview([10, 10, 10], {maxTiles: 120}));
    expect(fit.mode).toBe('wrap');
    expect(fittedTileCount(fit)).toBe(30);
  });

  it('handles a list without rows', () => {
    const fit = fitListCard(preview([]));
    expect(fit.rows).toEqual([]);
    expect(fit.extraRows).toBe(0);
    expect(fit.tile).toBe(92);
  });

  it('treats odd counts as whole, non-negative numbers', () => {
    const fit = fitListCard(preview([-3, 2.7]));
    expect(fit.rows.map((row) => row.shown)).toEqual([0, 2]);
  });
});

describe('fitListCard in an auto frame', () => {
  const auto = (counts: number[], extra: Partial<FitListCardInput> = {}) =>
    preview(counts, {frame: {width: 1200, height: 'auto'}, maxCanvasHeight: 8000, ...extra});

  it('grows with the list and shows every item at the largest tiles', () => {
    const counts = Array.from({length: 20}, () => 30);
    const fit = fitListCard(auto(counts));
    expect(fit.mode).toBe('wrap');
    expect(fit.tile).toBe(92);
    expect(fit.extraRows).toBe(0);
    expect(fit.rows.every((row, index) => row.shown === counts[index] && row.more === 0)).toBe(true);
    const lines = Math.ceil(30 / tilesPerLine(CONTENT, 92));
    expect(fit.height).toBe(132 + 32 + 20 * (lines * 92 + 1));
  });

  it('a short list makes a short picture', () => {
    const fit = fitListCard(auto([1, 0]));
    expect(fit.height).toBe(132 + 32 + 2 * 93);
  });

  it('shrinks tiles only when the picture would pass the height cap', () => {
    const counts = Array.from({length: 20}, () => 100);
    const fit = fitListCard(auto(counts));
    expect(fit.tile).toBeLessThan(92);
    expect(fit.height).toBeLessThanOrEqual(8000);
    expect(fit.extraRows).toBe(0);
    expect(fit.rows.every((row) => row.more === 0)).toBe(true);
  });

  it('summarises only as a last resort, below the tile floor', () => {
    const counts = Array.from({length: 400}, () => 2);
    const fit = fitListCard(auto(counts, {tileFloor: 24}));
    expect(fit.height).toBeLessThanOrEqual(8000);
    expect(fit.rows.length + fit.extraRows).toBe(400);
    expect(fit.extraRows).toBeGreaterThan(0);
  });
});
