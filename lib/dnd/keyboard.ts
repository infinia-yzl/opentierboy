import type {Direction, ItemPosition} from './model';

/**
 * Keyboard moves for items in rows that wrap onto several lines (#142), with tiles of mixed
 * shapes. dnd-kit 0.5 has no keyboard "coordinate getter"; its SortableKeyboardPlugin picks
 * the nearest drop target in the arrow's direction, which jumps between tiers at the end of a
 * wrapped line. This module decides the target position instead, from the boxes measured in
 * the page:
 *
 * - Left and Right step to the previous or next position in reading order. At the end of a
 *   line they continue on the next line of the same row. At the start or end of a row
 *   nothing happens.
 * - Up and Down move to the nearest line above or below: inside the same row when the row
 *   wraps, otherwise into the last line of the row above or the first line of the row below.
 *   The item keeps its horizontal place as well as it can. At the top or bottom row nothing
 *   happens.
 *
 * Inside one row, moving an item makes the tiles after it flow again, and with tiles of
 * different widths a whole line can shift. So for Up and Down inside a row, the module
 * replays the wrapping for every possible position and picks one where the item really lands
 * on the nearest line in that direction.
 *
 * Pure: it takes plain boxes (DOMRect fits) and returns a position (see ItemMove for what the
 * index means). The wiring step measures the boxes and moves the dragged item there.
 */

/** A box in page or viewport pixels. DOMRect has these fields. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LayoutItem {
  id: string;
  box: Box;
}

/** One tier row: its items in index order, the dragged item included where it is now. */
export interface LayoutRow {
  tierId: string;
  items: readonly LayoutItem[];
  /**
   * The inner width of the area where the row's tiles wrap (its content box). The wiring
   * step measures it. Without it the width is estimated from the tiles.
   */
  width?: number;
}

/** Pixels of rounding that measured boxes may carry. */
const EPSILON = 0.5;

/**
 * Splits a row's items (in index order) into the lines that flex-wrap made. A new line starts
 * when an item's centre is not right of the previous item's centre (the row wrapped), or when
 * it lies fully below the line so far. Items of different heights in one line still group
 * together, whatever their vertical alignment.
 */
export function groupIntoLines<T extends {box: Box}>(items: readonly T[]): T[][] {
  const lines: T[][] = [];
  let lineBottom = -Infinity;
  let previous: Box | undefined;
  for (const item of items) {
    const {box} = item;
    const wrapped = previous !== undefined && box.left + box.width / 2 <= previous.left + previous.width / 2;
    const below = previous !== undefined && box.top >= lineBottom - EPSILON;
    if (previous === undefined || wrapped || below) {
      lines.push([item]);
      lineBottom = box.top + box.height;
    } else {
      lines[lines.length - 1].push(item);
      lineBottom = Math.max(lineBottom, box.top + box.height);
    }
    previous = box;
  }
  return lines;
}

/**
 * Greedy flex-wrap: the line of each tile, for tiles of the given outer widths (width plus
 * the gap around it) in a line of `capacity` pixels.
 */
export function wrapIntoLines(outerWidths: readonly number[], capacity: number): number[] {
  const lineOf: number[] = [];
  let line = 0;
  let used = 0;
  for (const width of outerWidths) {
    if (used > 0 && used + width > capacity + EPSILON) {
      line++;
      used = 0;
    }
    lineOf.push(line);
    used += width;
  }
  return lineOf;
}

/** The gap between neighbouring tiles of one line (their two margins), or 0. */
function measureGap(lines: readonly LayoutItem[][]): number {
  const gaps = lines.flatMap(line => line.slice(1).map((item, i) => item.box.left - (line[i].box.left + line[i].box.width)));
  return gaps.length ? Math.max(0, Math.min(...gaps)) : 0;
}

/**
 * The line capacity in outer-width units. From the measured width when there is one;
 * otherwise a value that reproduces the lines on screen: at least the fullest line, and less
 * than any line plus the first tile of the next line (which did not fit).
 */
function estimateCapacity(row: LayoutRow, lines: readonly LayoutItem[][], outer: (item: LayoutItem) => number): number {
  if (row.width !== undefined && Number.isFinite(row.width) && row.width > 0) return row.width;
  const sums = lines.map(line => line.reduce((sum, item) => sum + outer(item), 0));
  const lower = Math.max(...sums);
  const upper = Math.min(...lines.slice(0, -1).map((line, i) => sums[i] + outer(lines[i + 1][0])));
  return Number.isFinite(upper) && upper > lower ? (lower + upper) / 2 : lower;
}

/**
 * The position an arrow key moves the dragged item to, or null when it cannot move that way.
 * `rows` lists the tier rows from top to bottom.
 */
export function keyboardItemTarget(rows: readonly LayoutRow[], itemId: string, direction: Direction): ItemPosition | null {
  const rowIndex = rows.findIndex(row => row.items.some(item => item.id === itemId));
  if (rowIndex < 0) return null;
  const row = rows[rowIndex];
  const index = row.items.findIndex(item => item.id === itemId);

  if (direction === 'left') return index > 0 ? {tierId: row.tierId, index: index - 1} : null;
  if (direction === 'right') return index < row.items.length - 1 ? {tierId: row.tierId, index: index + 1} : null;

  const dragged = row.items[index];
  const centreX = dragged.box.left + dragged.box.width / 2;
  const lines = groupIntoLines(row.items);
  const lineIndex = lines.findIndex(line => line.includes(dragged));
  const hasLine = direction === 'down' ? lineIndex < lines.length - 1 : lineIndex > 0;

  if (hasLine) {
    const target = targetInRow(row, lines, index, lineIndex, centreX, direction);
    if (target !== null) return {tierId: row.tierId, index: target};
  }

  const neighbour = rows[direction === 'down' ? rowIndex + 1 : rowIndex - 1];
  if (!neighbour) return null;
  if (neighbour.items.length === 0) return {tierId: neighbour.tierId, index: 0};
  const neighbourLines = groupIntoLines(neighbour.items);
  const line = direction === 'down' ? neighbourLines[0] : neighbourLines[neighbourLines.length - 1];
  // Before the first tile that reaches past the item's centre, or after the line's last tile.
  const next = line.find(({box}) => box.left + box.width > centreX);
  return {tierId: neighbour.tierId, index: neighbour.items.indexOf(next ?? line[line.length - 1]) + (next ? 0 : 1)};
}

/**
 * Up or Down inside one row: replays the wrapping with the item at every position, and picks
 * the position that puts it on the nearest line in that direction, closest to its current
 * horizontal place. Null when no position does.
 */
function targetInRow(
  row: LayoutRow,
  lines: readonly LayoutItem[][],
  index: number,
  lineIndex: number,
  centreX: number,
  direction: 'up' | 'down',
): number | null {
  const gap = measureGap(lines);
  const outer = (item: LayoutItem) => item.box.width + gap;
  const capacity = estimateCapacity(row, lines, outer);
  const rowLeft = Math.min(...row.items.map(item => item.box.left));
  const dragged = row.items[index];
  const others = row.items.filter((_, i) => i !== index);

  let best: {index: number; lineDistance: number; offset: number} | null = null;
  for (let at = 0; at <= others.length; at++) {
    const order = [...others.slice(0, at), dragged, ...others.slice(at)];
    const lineOf = wrapIntoLines(order.map(outer), capacity);
    const newLine = lineOf[at];
    if (direction === 'down' ? newLine <= lineIndex : newLine >= lineIndex) continue;
    let left = rowLeft;
    for (let i = at - 1; i >= 0 && lineOf[i] === newLine; i--) left += outer(order[i]);
    const candidate = {
      index: at,
      lineDistance: Math.abs(newLine - lineIndex),
      offset: Math.abs(left + dragged.box.width / 2 - centreX),
    };
    if (!best || candidate.lineDistance < best.lineDistance ||
      (candidate.lineDistance === best.lineDistance && candidate.offset < best.offset - EPSILON)) {
      best = candidate;
    }
  }
  return best ? best.index : null;
}

/**
 * The row index an arrow key moves a dragged row to (by its handle), or null. Rows move up
 * and down one place at a time; Left and Right do nothing.
 */
export function keyboardRowTarget(index: number, direction: Direction, rowCount: number): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= rowCount) return null;
  if (direction === 'up') return index > 0 ? index - 1 : null;
  if (direction === 'down') return index < rowCount - 1 ? index + 1 : null;
  return null;
}
