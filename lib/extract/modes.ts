import {roundHalfEven} from './picture';

export interface Mode {
  readonly value: number;
  readonly votes: number;
}

export function modes(values: ArrayLike<number>, tolerance = 2, top = 6): Mode[] {
  if (values.length === 0) return [];
  let largest = 0;
  for (let index = 0; index < values.length; index++) largest = Math.max(largest, values[index]);
  const size = largest + tolerance + 2;
  const histogram = new Float64Array(size);
  for (let index = 0; index < values.length; index++) histogram[values[index]] += 1;
  const smooth = new Float64Array(size);
  for (let index = 0; index < size; index++) {
    let sum = 0;
    for (let other = index - tolerance; other <= index + tolerance; other++) {
      if (other >= 0 && other < size) sum += histogram[other];
    }
    smooth[index] = sum;
  }
  const found: Mode[] = [];
  for (let round = 0; round < top; round++) {
    let best = 0;
    for (let index = 1; index < size; index++) if (smooth[index] > smooth[best]) best = index;
    if (smooth[best] <= 0) break;
    const from = Math.max(0, best - tolerance);
    const to = Math.min(size, best + tolerance + 1);
    let weighted = 0;
    let total = 0;
    for (let index = from; index < to; index++) {
      const weight = histogram[index] + 1e-9;
      weighted += index * weight;
      total += weight;
    }
    found.push({value: roundHalfEven(weighted / total), votes: smooth[best]});
    for (let index = Math.max(0, best - 2 * tolerance - 1); index < Math.min(size, best + 2 * tolerance + 2); index++) smooth[index] = 0;
  }
  return found;
}

export function mostCommon(values: readonly number[]): number {
  const counts = new Map<number, number>();
  let best = -1;
  let bestCount = 0;
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && value < best)) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
