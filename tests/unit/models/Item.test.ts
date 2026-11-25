import {describe, expect, it} from 'vitest';
import {DEFAULT_ITEM_SHAPE, isItemShape, itemShape} from '@/models/Item';
import {SHAPES} from '@/scripts/lib/image-sets.mjs';

describe('itemShape', () => {
  it('returns DEFAULT_ITEM_SHAPE, square, when the shape is missing or unknown', () => {
    expect(DEFAULT_ITEM_SHAPE).toBe('square');
    expect(itemShape({})).toBe('square');
    expect(itemShape({shape: 'hexagon' as never})).toBe('square');
  });
});

describe('isItemShape', () => {
  it('returns true when the value is portrait, and false when it is Portrait', () => {
    expect(isItemShape('portrait')).toBe(true);
    expect(isItemShape('Portrait')).toBe(false);
  });

  it('returns true when called with each shape in SHAPES of scripts/lib/image-sets.mjs', () => {
    expect(SHAPES.filter(isItemShape)).toEqual(SHAPES);
  });
});
