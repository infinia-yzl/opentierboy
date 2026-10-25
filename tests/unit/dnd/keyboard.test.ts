import {describe, expect, it} from 'vitest';
import {groupIntoLines, keyboardItemTarget, keyboardRowTarget, wrapIntoLines, type LayoutRow} from '@/lib/dnd/keyboard';
import {moveItem} from '@/lib/dnd/moves';
import {seededRandom} from '../support/randomStates';

/** Tile sizes in pixels (the shapes of Phase 4 at the editor's desktop size). */
const SIZE = {square: [80, 80], landscape: [120, 68], portrait: [60, 80]} as const;
type Shape = keyof typeof SIZE;

/**
 * Lays out tiles like the editor's items area: flex-wrap from left to right, 4 px margins,
 * lines as tall as their tallest tile, tiles centred in their line. Returns the row and its
 * bottom edge.
 */
function flexRow(tierId: string, top: number, tiles: [id: string, shape: Shape][], width = 400): {row: LayoutRow; bottom: number} {
  const margin = 4;
  const lines: {id: string; w: number; h: number}[][] = [[]];
  let used = 0;
  for (const [id, shape] of tiles) {
    const [w, h] = SIZE[shape];
    if (used + w + 2 * margin > width && lines[lines.length - 1].length > 0) {
      lines.push([]);
      used = 0;
    }
    lines[lines.length - 1].push({id, w, h});
    used += w + 2 * margin;
  }
  const items: LayoutRow['items'][number][] = [];
  let y = top;
  for (const line of lines) {
    const lineHeight = Math.max(80, ...line.map(tile => tile.h)) + 2 * margin;
    let x = 100; // the label sits left of the items
    for (const tile of line) {
      items.push({id: tile.id, box: {left: x + margin, top: y + (lineHeight - tile.h) / 2, width: tile.w, height: tile.h}});
      x += tile.w + 2 * margin;
    }
    y += lineHeight;
  }
  return {row: {tierId, items, width}, bottom: Math.max(y, top + 88)};
}

/** Rows stacked from top to bottom. */
function layout(rows: [tierId: string, tiles: [string, Shape][]][], width?: number): LayoutRow[] {
  let top = 0;
  return rows.map(([tierId, tiles]) => {
    const {row, bottom} = flexRow(tierId, top, tiles, width);
    top = bottom + 8;
    return row;
  });
}

const squares = (prefix: string, count: number): [string, Shape][] =>
  Array.from({length: count}, (_, i) => [`${prefix}${i}`, 'square']);

describe('groupIntoLines', () => {
  it('finds the lines of a wrapped row', () => {
    // 400 px wide, 88 px per square tile: 4 per line.
    const [row] = layout([['s', squares('a', 10)]]);
    expect(groupIntoLines(row.items).map(line => line.map(item => item.id))).toEqual([
      ['a0', 'a1', 'a2', 'a3'],
      ['a4', 'a5', 'a6', 'a7'],
      ['a8', 'a9'],
    ]);
  });

  it('keeps tiles of different heights in one line', () => {
    const [row] = layout([['s', [['p', 'portrait'], ['l', 'landscape'], ['q', 'square'], ['l2', 'landscape'], ['p2', 'portrait']]]]);
    expect(groupIntoLines(row.items).map(line => line.map(item => item.id))).toEqual([['p', 'l', 'q'], ['l2', 'p2']]);
  });

  it('handles empty rows and single tiles', () => {
    expect(groupIntoLines([])).toEqual([]);
    const [row] = layout([['s', squares('a', 1)]]);
    expect(groupIntoLines(row.items)).toHaveLength(1);
  });
});

describe('wrapIntoLines', () => {
  it('wraps greedily, and a tile wider than the line gets a line of its own', () => {
    expect(wrapIntoLines([88, 88, 88, 88, 88], 352)).toEqual([0, 0, 0, 0, 1]);
    expect(wrapIntoLines([128, 68, 128, 88], 400)).toEqual([0, 0, 0, 1]);
    expect(wrapIntoLines([500, 88, 88], 400)).toEqual([0, 1, 1]);
    expect(wrapIntoLines([], 400)).toEqual([]);
  });
});

describe('keyboardItemTarget', () => {
  // S: 6 squares (lines a0-a3, a4-a5); A: empty; Unranked: 3 squares.
  const rows = layout([['S', squares('a', 6)], ['A', []], ['U', squares('u', 3)]]);

  it('steps left and right in reading order, across wrapped lines', () => {
    expect(keyboardItemTarget(rows, 'a3', 'right')).toEqual({tierId: 'S', index: 4});
    expect(keyboardItemTarget(rows, 'a4', 'left')).toEqual({tierId: 'S', index: 3});
    expect(keyboardItemTarget(rows, 'a0', 'left')).toBeNull();
    expect(keyboardItemTarget(rows, 'a5', 'right')).toBeNull();
  });

  it('moves up and down between the lines of one row, keeping its column', () => {
    // a1 (line 1, column 2) down: lands under its old place, in line 2 column 2.
    expect(keyboardItemTarget(rows, 'a1', 'down')).toEqual({tierId: 'S', index: 5});
    // a5 (line 2, column 2) up: lands in line 1 column 2.
    expect(keyboardItemTarget(rows, 'a5', 'up')).toEqual({tierId: 'S', index: 1});
  });

  it('moves from the last line of a row into the row below, and back', () => {
    expect(keyboardItemTarget(rows, 'a4', 'down')).toEqual({tierId: 'A', index: 0});
    expect(keyboardItemTarget(rows, 'u1', 'up')).toEqual({tierId: 'A', index: 0});
    expect(keyboardItemTarget(rows, 'u2', 'down')).toBeNull();
    expect(keyboardItemTarget(rows, 'a2', 'up')).toBeNull();
  });

  it('keeps the column when moving into a row with items', () => {
    const two = layout([['S', squares('a', 3)], ['U', squares('u', 4)]]);
    expect(keyboardItemTarget(two, 'u2', 'up')).toEqual({tierId: 'S', index: 2});
    expect(keyboardItemTarget(two, 'u3', 'up')).toEqual({tierId: 'S', index: 3});
    expect(keyboardItemTarget(two, 'a0', 'down')).toEqual({tierId: 'U', index: 0});
    expect(keyboardItemTarget(two, 'a2', 'down')).toEqual({tierId: 'U', index: 2});
  });

  it('enters the last line of a wrapped row above and the first line of a wrapped row below', () => {
    const wrapped = layout([['S', squares('a', 6)], ['U', squares('u', 6)]]);
    // u1 up: into S's second line (a4, a5), column 2 → before a5.
    expect(keyboardItemTarget(wrapped, 'u1', 'up')).toEqual({tierId: 'S', index: 5});
    // a5 (second line of S) down: into U's first line, column 2 → before u1.
    expect(keyboardItemTarget(wrapped, 'a5', 'down')).toEqual({tierId: 'U', index: 1});
  });

  it('matches the keyboard journeys that the editor supports today', () => {
    // tests/e2e/ranking.spec.ts: the first Unranked item, ArrowUp → into F (empty).
    const tanks = layout([['S', []], ['A', []], ['B', []], ['C', []], ['F', []], ['U', squares('t', 13)]], 1200);
    expect(keyboardItemTarget(tanks, 't0', 'up')).toEqual({tierId: 'F', index: 0});
    // Sigma third in S, ArrowLeft twice → first.
    const s = layout([['S', [['mauga', 'square'], ['winston', 'square'], ['sigma', 'square']]], ['U', []]]);
    expect(keyboardItemTarget(s, 'sigma', 'left')).toEqual({tierId: 'S', index: 1});
  });

  it('works with tiles of mixed shapes', () => {
    const mixed = layout([
      ['S', [['l0', 'landscape'], ['p0', 'portrait'], ['l1', 'landscape'], ['q0', 'square'], ['p1', 'portrait']]],
      ['U', [['q1', 'square'], ['l2', 'landscape'], ['p2', 'portrait']]],
    ]);
    // S lines: [l0, p0, l1] then [q0, p1]. U: [q1, l2, p2].
    expect(keyboardItemTarget(mixed, 'p0', 'down')).toEqual({tierId: 'S', index: 4});
    // p1 (centre x 222) fits into the first line after l0, where its centre lands at 262;
    // before l0 it would land at 134.
    expect(keyboardItemTarget(mixed, 'p1', 'up')).toEqual({tierId: 'S', index: 1});
    expect(keyboardItemTarget(mixed, 'q1', 'up')).toEqual({tierId: 'S', index: 3});
    expect(keyboardItemTarget(mixed, 'q0', 'down')).toEqual({tierId: 'U', index: 0});
  });

  it('replays the wrapping when tiles of mixed widths shift a whole line', () => {
    // 415 px: [l s s] [L p s s] [p s s]. Taking the landscape L out of line 2 lets p move up
    // into line 1, so "before the tile under it" would put L back on line 2.
    const tiles: [string, Shape][] = [['a', 'landscape'], ['b', 'square'], ['c', 'square'], ['L', 'landscape'], ['d', 'portrait'],
      ['e', 'square'], ['f', 'square'], ['g', 'portrait'], ['h', 'square'], ['i', 'square']];
    const [row] = layout([['S', tiles]], 415);
    expect(groupIntoLines(row.items).map(line => line.map(item => item.id))).toEqual([['a', 'b', 'c'], ['L', 'd', 'e', 'f'], ['g', 'h', 'i']]);
    const target = keyboardItemTarget([row], 'L', 'down')!;
    const moved = moveItem([{id: 'S', name: 'S', items: tiles.map(([id]) => ({id, content: id}))}], {tierId: 'S', index: 3}, target);
    const [after] = layout([['S', moved[0].items.map(item => tiles.find(([id]) => id === item.id)!)]], 415);
    const lines = groupIntoLines(after.items).map(line => line.map(item => item.id));
    expect(lines.findIndex(line => line.includes('L'))).toBe(2);
  });

  it('estimates the row width from the tiles when it is not measured', () => {
    const measured = layout([['S', squares('a', 10)], ['U', squares('u', 7)]]);
    const estimated = measured.map(({tierId, items}) => ({tierId, items}));
    for (const row of measured) {
      for (const item of row.items) {
        for (const direction of ['up', 'down', 'left', 'right'] as const) {
          expect(keyboardItemTarget(estimated, item.id, direction), `${item.id} ${direction}`).toEqual(keyboardItemTarget(measured, item.id, direction));
        }
      }
    }
  });

  it('returns null for an item that is not in the layout', () => {
    expect(keyboardItemTarget(rows, 'nope', 'down')).toBeNull();
    expect(keyboardItemTarget([], 'a0', 'up')).toBeNull();
  });

  it('always returns a valid move that changes the line or the place (seeded random layouts)', () => {
    const random = seededRandom(142);
    const shapes: Shape[] = ['square', 'landscape', 'portrait'];
    for (let run = 0; run < 300; run++) {
      let next = 0;
      const spec: [string, [string, Shape][]][] = Array.from({length: 2 + Math.floor(random() * 5)}, (_, r) => [
        `t${r}`,
        Array.from({length: Math.floor(random() * 14)}, () => [`i${next++}`, shapes[Math.floor(random() * 3)]] as [string, Shape]),
      ]);
      const width = 300 + Math.floor(random() * 600);
      const rowsNow = layout(spec, width);
      const tiers = spec.map(([id, tiles]) => ({id, name: id, items: tiles.map(([itemId]) => ({id: itemId, content: itemId}))}));
      for (const row of rowsNow) {
        for (const [index, item] of row.items.entries()) {
          for (const direction of ['up', 'down', 'left', 'right'] as const) {
            const target = keyboardItemTarget(rowsNow, item.id, direction);
            if (!target) continue;
            const moved = moveItem(tiers, {tierId: row.tierId, index}, target);
            expect(moved, `run ${run} ${item.id} ${direction}`).not.toBe(tiers);
            if (direction === 'up' || direction === 'down') {
              // The item must end on another line: lay out the new list and compare lines.
              const after = layout(moved.map(t => [t.id, t.items.map(i => [i.id, spec.flatMap(([, tiles]) => tiles).find(([id]) => id === i.id)![1]] as [string, Shape])]), width);
              const lineOf = (rs: LayoutRow[]) => {
                const r = rs.findIndex(x => x.items.some(i => i.id === item.id));
                const lines = groupIntoLines(rs[r].items);
                return [r, lines.findIndex(line => line.some(i => i.id === item.id))];
              };
              expect(lineOf(after), `run ${run} ${item.id} ${direction}`).not.toEqual(lineOf(rowsNow));
            }
          }
        }
      }
    }
  });
});

describe('keyboardRowTarget', () => {
  it('moves rows up and down one place, never past the ends', () => {
    expect(keyboardRowTarget(0, 'down', 6)).toBe(1);
    expect(keyboardRowTarget(3, 'up', 6)).toBe(2);
    expect(keyboardRowTarget(0, 'up', 6)).toBeNull();
    expect(keyboardRowTarget(5, 'down', 6)).toBeNull();
    expect(keyboardRowTarget(2, 'left', 6)).toBeNull();
    expect(keyboardRowTarget(2, 'right', 6)).toBeNull();
    expect(keyboardRowTarget(7, 'up', 6)).toBeNull();
  });
});
