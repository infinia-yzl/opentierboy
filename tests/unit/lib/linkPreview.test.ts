import {describe, expect, it} from 'vitest';
import {getOgTierGradient} from '@/lib/linkPreview';

describe('getOgTierGradient', () => {
  it('returns 7 distinct gradients and #f0f0f0 for the last row when the preview has 9 rows', () => {
    const gradients = Array.from({length: 9}, (_, index) => getOgTierGradient(index, 9));
    expect(gradients[8]).toBe('linear-gradient(to right, #f0f0f0, #f0f0f0)');
    expect(gradients[0]).toBe('linear-gradient(to right, #d21203, #c40a01)');
    expect(gradients[7]).toBe(gradients[0]);
    expect(new Set(gradients.slice(0, 7)).size).toBe(7);
  });
});
