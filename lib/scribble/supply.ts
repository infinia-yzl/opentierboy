export const INK_SUPPLY = 500;
export const LOW_INK_PERCENT = 30;

export type InkState = 'plenty' | 'low' | 'out';

export interface InkLevel {
  readonly state: InkState;
  readonly left: number;
  readonly percent: number;
}

export function inkLevel(spent: number, supply: number = INK_SUPPLY): InkLevel {
  const left = Math.max(0, supply - Math.max(0, spent));
  if (left === 0) return {state: 'out', left, percent: 0};
  const state = left * 100 <= LOW_INK_PERCENT * supply ? 'low' : 'plenty';
  return {state, left, percent: Math.ceil((left * 100) / supply)};
}

export function inkStatusText(level: InkLevel): string | null {
  if (level.state === 'out') return 'Out of ink. Remove a note to get ink back.';
  if (level.state === 'low') return `Ink ${level.percent}% left`;
  return null;
}
