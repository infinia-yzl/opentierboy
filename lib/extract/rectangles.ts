import {roundHalfEven} from './picture';
import {horizontalCover, type SideSums, verticalCover} from './lines';
import {mostCommon} from './modes';

export interface Candidate {
  readonly x: number;
  readonly y: number;
  readonly total: number;
  readonly min: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export const RECTANGLE_LIMITS = Object.freeze({
  total: 2.6,
  side: 0.25,
  innerLine: 0.85,
  innerMargin: 8,
  innerFrom: 44,
  overlap: 0.25,
  latticeTotal: 2.5,
  latticeSide: 0.3,
});

export function rectangleScores(sums: SideSums, {width: w, height: h}: Size): Candidate[] {
  const {width: W, height: H} = sums;
  const rows = H - h;
  const columns = W - w;
  if (rows <= 0 || columns <= 0 || w <= 0 || h <= 0) return [];
  const totals = new Float64Array(rows * columns);
  const mins = new Float64Array(rows * columns);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const left = verticalCover(sums, x, y, y + h) / h;
      const right = verticalCover(sums, x + w, y, y + h) / h;
      const top = horizontalCover(sums, y, x, x + w) / w;
      const bottom = horizontalCover(sums, y + h, x, x + w) / w;
      totals[y * columns + x] = left + right + top + bottom;
      mins[y * columns + x] = Math.min(left, right, top, bottom);
    }
  }
  const found: Candidate[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const total = totals[y * columns + x];
      if (total < RECTANGLE_LIMITS.total || mins[y * columns + x] < RECTANGLE_LIMITS.side) continue;
      let largest = -Infinity;
      for (let dy = Math.max(0, y - 2); dy <= Math.min(rows - 1, y + 2); dy++) {
        for (let dx = Math.max(0, x - 2); dx <= Math.min(columns - 1, x + 2); dx++) {
          largest = Math.max(largest, Math.fround(totals[dy * columns + dx]));
        }
      }
      if (total >= Math.fround(largest - 1e-6)) found.push({x, y, total, min: mins[y * columns + x]});
    }
  }
  found.sort((a, b) => b.total - a.total);
  const kept: Candidate[] = [];
  for (const candidate of found) {
    const overlaps = kept.some((other) =>
      Math.min(candidate.x + w, other.x + w) - Math.max(candidate.x, other.x) > RECTANGLE_LIMITS.overlap * w
      && Math.min(candidate.y + h, other.y + h) - Math.max(candidate.y, other.y) > RECTANGLE_LIMITS.overlap * h);
    if (overlaps) continue;
    if (w > RECTANGLE_LIMITS.innerFrom && hasInnerLine(sums, candidate, w, h)) continue;
    kept.push(candidate);
  }
  return kept;
}

function hasInnerLine(sums: SideSums, {x, y}: Candidate, w: number, h: number): boolean {
  for (let column = x + RECTANGLE_LIMITS.innerMargin; column < x + w - RECTANGLE_LIMITS.innerMargin; column++) {
    if (verticalCover(sums, column, y, y + h, true) / h >= RECTANGLE_LIMITS.innerLine) return true;
  }
  return false;
}

export function scoreAt(sums: SideSums, x: number, y: number, {width: w, height: h}: Size): {total: number; min: number} {
  if (x < 0 || y < 0 || x + w >= sums.width || y + h >= sums.height) return {total: 0, min: 0};
  const left = verticalCover(sums, x, y, y + h) / h;
  const right = verticalCover(sums, x + w, y, y + h) / h;
  const top = horizontalCover(sums, y, x, x + w) / w;
  const bottom = horizontalCover(sums, y + h, x, x + w) / w;
  return {total: left + right + top + bottom, min: Math.min(left, right, top, bottom)};
}

export function cluster(values: readonly number[], tolerance = 3): number[] {
  const groups: number[][] = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const last = groups[groups.length - 1];
    if (last && value - last[last.length - 1] <= tolerance) last.push(value);
    else groups.push([value]);
  }
  return groups.map((group) => roundHalfEven(group.reduce((sum, value) => sum + value, 0) / group.length));
}

function pitch(centres: readonly number[], size: number): number {
  const steps: number[] = [];
  for (let index = 1; index < centres.length; index++) {
    const step = centres[index] - centres[index - 1];
    if (step >= size && step <= 1.6 * size) steps.push(step);
  }
  return steps.length > 0 ? mostCommon(steps) : 0;
}

function extended(centres: number[], step: number): number[] {
  if (!step) return centres;
  return Array.from(new Set([...centres, centres[0] - step, centres[centres.length - 1] + step])).sort((a, b) => a - b);
}

export function completeGrid(boxes: readonly Candidate[], sums: SideSums, size: Size): Candidate[] {
  const {width: w, height: h} = size;
  if (boxes.length === 0) return [];
  const xs = extended(cluster(boxes.map((box) => box.x)), pitch(cluster(boxes.map((box) => box.x)), w));
  const ys = extended(cluster(boxes.map((box) => box.y)), pitch(cluster(boxes.map((box) => box.y)), h));
  const out = [...boxes];
  for (const y of ys) {
    for (const x of xs) {
      if (out.some((box) => Math.abs(box.x - x) <= 0.5 * w && Math.abs(box.y - y) <= 0.5 * h)) continue;
      let best = {total: -Infinity, min: 0, x, y};
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const score = scoreAt(sums, x + dx, y + dy, size);
          if (score.total > best.total) best = {...score, x: x + dx, y: y + dy};
        }
      }
      if (best.total >= RECTANGLE_LIMITS.latticeTotal && best.min >= RECTANGLE_LIMITS.latticeSide) out.push(best);
    }
  }
  return out;
}

export function regularity(boxes: readonly Candidate[], {width: w, height: h}: Size): number {
  const across: number[] = [];
  const down: number[] = [];
  for (const box of boxes) {
    let right = Infinity;
    let below = Infinity;
    for (const other of boxes) {
      if (other === box) continue;
      if (other.x > box.x && Math.min(box.y + h, other.y + h) - Math.max(box.y, other.y) >= 0.5 * h) right = Math.min(right, other.x - box.x);
      if (other.y > box.y && Math.min(box.x + w, other.x + w) - Math.max(box.x, other.x) >= 0.5 * w) below = Math.min(below, other.y - box.y);
    }
    if (right < Infinity) across.push(right);
    if (below < Infinity) down.push(below);
  }
  const gaps = across.length + down.length;
  if (gaps === 0) return 0;
  const hits = (values: number[]) => {
    if (values.length === 0) return 0;
    const usual = mostCommon(values);
    return values.filter((value) => Math.abs(value - usual) <= 2).length;
  };
  return (hits(across) + hits(down)) / gaps;
}

export function contentEntropy(grey: Uint8Array, pictureWidth: number, box: Candidate, {width: w, height: h}: Size): number {
  const bins = new Float64Array(32);
  let count = 0;
  for (let y = box.y + 2; y < box.y + h - 1; y++) {
    for (let x = box.x + 2; x < box.x + w - 1; x++) {
      bins[grey[y * pictureWidth + x] >> 3] += 1;
      count += 1;
    }
  }
  let entropy = 0;
  for (const bin of bins) {
    if (bin === 0) continue;
    const share = bin / Math.max(1, count);
    entropy -= share * Math.log2(share);
  }
  return entropy;
}
