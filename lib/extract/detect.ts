import {type Box, greyValues, type Picture, roundHalfEven, type ScoredBox, workingPicture, type WorkingPicture} from './picture';
import {horizontalCover, horizontalRuns, lineMasks, type SideSums, sideSums, topEdges, verticalCover} from './lines';
import {modes} from './modes';
import {
  type Candidate,
  completeGrid,
  contentEntropy,
  rectangleScores,
  regularity,
  type Size,
} from './rectangles';

export const DETECTOR_LIMITS = Object.freeze({
  smallestLine: 22,
  widestLine: 0.6,
  widthModes: 7,
  heightModes: 5,
  widthVotes: 4,
  heightVotes: 3,
  seedTotal: 3.3,
  seedSide: 0.55,
  rowTotal: 2.9,
  minimumSeeds: 3,
  minimumItems: 4,
  minimumEntropy: 1.5,
  minimumRegularity: 0.5,
  smallestSide: 32,
  givenSeedTotal: 3.2,
  givenSeedSide: 0.5,
  snapReach: 5,
  snapCost: 0.04,
});

export interface Prepared {
  readonly working: WorkingPicture;
  readonly sums: SideSums;
  readonly grey: Uint8Array;
  readonly lineRows: Int32Array;
  readonly lineStarts: Int32Array;
  readonly lineLengths: Int32Array;
}

export function prepare(picture: Picture): Prepared {
  const working = workingPicture(picture);
  const masks = lineMasks(working);
  const runs = horizontalRuns(topEdges(masks.horizontal));
  const rows: number[] = [];
  const starts: number[] = [];
  const lengths: number[] = [];
  for (let index = 0; index < runs.rows.length; index++) {
    const length = runs.ends[index] - runs.starts[index];
    if (length < DETECTOR_LIMITS.smallestLine || length > DETECTOR_LIMITS.widestLine * working.width) continue;
    rows.push(runs.rows[index]);
    starts.push(runs.starts[index]);
    lengths.push(length);
  }
  return {
    working,
    sums: sideSums(masks),
    grey: greyValues(working),
    lineRows: Int32Array.from(rows),
    lineStarts: Int32Array.from(starts),
    lineLengths: Int32Array.from(lengths),
  };
}

export interface Group {
  readonly width: number;
  readonly height: number;
  readonly boxes: readonly Candidate[];
  readonly seeds: number;
  readonly entropy: number;
  readonly support: number;
  readonly regularity: number;
  readonly score: number;
}

function heightVotes(prepared: Prepared, width: number): number[] {
  const {lineRows, lineStarts, lineLengths} = prepared;
  const ys: number[] = [];
  const xs: number[] = [];
  for (let index = 0; index < lineLengths.length; index++) {
    if (Math.abs(lineLengths[index] - width) > 2) continue;
    ys.push(lineRows[index]);
    xs.push(Math.floor(lineStarts[index] / 3));
  }
  const heights: number[] = [];
  for (const column of Array.from(new Set(xs)).sort((a, b) => a - b)) {
    const stack = ys.filter((_, index) => Math.abs(xs[index] - column) <= 1).sort((a, b) => a - b);
    for (const from of stack) {
      for (const to of stack) {
        const distance = to - from;
        if (distance >= DETECTOR_LIMITS.smallestLine && distance <= 3.2 * width && distance >= width / 2.6) heights.push(distance);
      }
    }
  }
  return heights;
}

function describe(prepared: Prepared, boxes: Candidate[], size: Size, seeds: number): Group {
  const entropy = boxes.reduce((sum, box) => sum + contentEntropy(prepared.grey, prepared.working.width, box, size), 0) / boxes.length;
  const support = boxes.reduce((sum, box) => sum + box.total, 0) / boxes.length / 4;
  const regular = regularity(boxes, size);
  return {
    width: size.width,
    height: size.height,
    boxes,
    seeds,
    entropy,
    support,
    regularity: regular,
    score: boxes.length * size.width * size.height * Math.min(1, entropy / 3) * support * support * regular,
  };
}

export function itemGroups(prepared: Prepared): Group[] {
  const groups: Group[] = [];
  const tried = new Set<string>();
  for (const {value: width, votes} of modes(prepared.lineLengths, 2, DETECTOR_LIMITS.widthModes)) {
    if (votes < DETECTOR_LIMITS.widthVotes) continue;
    const heights = heightVotes(prepared, width);
    if (heights.length === 0) continue;
    for (const {value: height, votes: heightCount} of modes(heights, 2, DETECTOR_LIMITS.heightModes)) {
      const key = `${Math.floor(width / 2)}x${Math.floor(height / 2)}`;
      if (heightCount < DETECTOR_LIMITS.heightVotes || tried.has(key)) continue;
      tried.add(key);
      const size = {width, height};
      const found = rectangleScores(prepared.sums, size);
      const seeds = found.filter((box) => box.total >= DETECTOR_LIMITS.seedTotal && box.min >= DETECTOR_LIMITS.seedSide);
      if (seeds.length < DETECTOR_LIMITS.minimumSeeds) continue;
      const rows = seeds.map((box) => box.y);
      const columns = seeds.map((box) => box.x);
      const oneRow = Math.max(...rows) - Math.min(...rows) <= 0.5 * height;
      const near = (values: number[], value: number) => values.some((other) => Math.abs(other - value) <= 2);
      const chosen = found.filter((box) => {
        if (seeds.includes(box)) return true;
        const inRow = near(rows, box.y);
        const inColumn = near(columns, box.x);
        return (inRow && inColumn) || (oneRow && inRow && box.total >= DETECTOR_LIMITS.rowTotal);
      });
      groups.push(describe(prepared, completeGrid(chosen, prepared.sums, size), size, seeds.length));
    }
  }
  return groups.sort((a, b) => b.score - a.score);
}

export function mainGroup(groups: readonly Group[]): Group | null {
  const usable = groups.filter((group) => group.boxes.length >= DETECTOR_LIMITS.minimumItems
    && group.entropy >= DETECTOR_LIMITS.minimumEntropy
    && group.regularity >= DETECTOR_LIMITS.minimumRegularity
    && Math.min(group.width, group.height) >= DETECTOR_LIMITS.smallestSide);
  const picks: Group[] = [];
  for (const group of usable) {
    const peers = usable.filter((other) => Math.abs(other.width - group.width) <= 3);
    const most = Math.max(...peers.map((other) => other.boxes.length));
    let pick: Group | null = null;
    for (const other of peers) {
      if (other.boxes.length >= 0.85 * most && (pick === null || other.height < pick.height)) pick = other;
    }
    if (pick && !picks.includes(pick)) picks.push(pick);
  }
  const weight = (group: Group) => group.boxes.length * group.width * group.height * group.support;
  return [...picks].sort((a, b) => weight(b) - weight(a))[0] ?? null;
}

export interface WorkingBox extends Box {
  readonly score: number;
}

function inPicture(prepared: Prepared, boxes: readonly Candidate[], size: Size): ScoredBox[] {
  const {scale} = prepared.working;
  return boxes.map((box) => ({
    x: Math.round(box.x / scale),
    y: Math.round(box.y / scale),
    width: Math.round(size.width / scale),
    height: Math.round(size.height / scale),
    score: Math.min(1, box.total / 4),
  }));
}

export function readingOrder<T extends Box>(boxes: readonly T[]): T[] {
  const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: T[][] = [];
  for (const box of sorted) {
    const row = rows[rows.length - 1];
    const centre = box.y + box.height / 2;
    if (row && centre < row[0].y + row[0].height && centre > row[0].y) row.push(box);
    else rows.push([box]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

export function findItemsInWorking(prepared: Prepared): Group | null {
  return mainGroup(itemGroups(prepared));
}

export function findItems(picture: Picture): ScoredBox[] {
  const prepared = prepare(picture);
  const group = findItemsInWorking(prepared);
  return group ? readingOrder(inPicture(prepared, group.boxes, group)) : [];
}

export function snapBox(sums: SideSums, box: Box): Candidate & Size {
  const {width: W, height: H} = sums;
  const reach = DETECTOR_LIMITS.snapReach;
  const {x, y, width: w, height: h} = box;
  let best = {total: -1, min: 1, x, y, width: w, height: h};
  for (let x0 = Math.max(0, x - reach); x0 <= Math.min(W - 1, x + reach); x0++) {
    for (let x1 = Math.max(0, x + w - reach); x1 <= Math.min(W - 1, x + w + reach); x1++) {
      const across = x1 - x0;
      if (across <= 0) continue;
      for (let y0 = Math.max(0, y - reach); y0 <= Math.min(H - 1, y + reach); y0++) {
        for (let y1 = Math.max(0, y + h - reach); y1 <= Math.min(H - 1, y + h + reach); y1++) {
          const down = y1 - y0;
          if (down <= 0) continue;
          const score = verticalCover(sums, x0, y0, y1) / down + verticalCover(sums, x1, y0, y1) / down
            + horizontalCover(sums, y0, x0, x1) / across + horizontalCover(sums, y1, x0, x1) / across
            - DETECTOR_LIMITS.snapCost * (Math.abs(x0 - x) + Math.abs(x1 - x - w) + Math.abs(y0 - y) + Math.abs(y1 - y - h));
          if (score > best.total) best = {total: score, min: 1, x: x0, y: y0, width: across, height: down};
        }
      }
    }
  }
  return best;
}

export function findItemsOfSizeInWorking(prepared: Prepared, given: Box): {boxes: Candidate[]; size: Size} {
  const {scale} = prepared.working;
  const start = {
    x: roundHalfEven(given.x * scale),
    y: roundHalfEven(given.y * scale),
    width: Math.max(2, roundHalfEven(given.width * scale)),
    height: Math.max(2, roundHalfEven(given.height * scale)),
  };
  const snapped = snapBox(prepared.sums, start);
  const size = {width: snapped.width, height: snapped.height};
  const found = rectangleScores(prepared.sums, size);
  const seeds: Candidate[] = found.filter((box) => box.total >= DETECTOR_LIMITS.givenSeedTotal && box.min >= DETECTOR_LIMITS.givenSeedSide);
  if (!seeds.some((box) => Math.abs(box.x - snapped.x) <= 3 && Math.abs(box.y - snapped.y) <= 3)) {
    seeds.push({x: snapped.x, y: snapped.y, total: snapped.total, min: 1});
  }
  const rows = seeds.map((box) => box.y);
  const columns = seeds.map((box) => box.x);
  const chosen = [...seeds];
  for (const box of found) {
    if (chosen.some((other) => Math.abs(box.x - other.x) <= 0.5 * size.width && Math.abs(box.y - other.y) <= 0.5 * size.height)) continue;
    if (rows.some((row) => Math.abs(row - box.y) <= 2) || columns.some((column) => Math.abs(column - box.x) <= 2)) chosen.push(box);
  }
  return {boxes: completeGrid(chosen, prepared.sums, size), size};
}

export function findItemsOfSize(picture: Picture, given: Box, prepared: Prepared = prepare(picture)): ScoredBox[] {
  const {boxes, size} = findItemsOfSizeInWorking(prepared, given);
  return readingOrder(inPicture(prepared, boxes, size));
}
