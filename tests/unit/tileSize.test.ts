import {describe, expect, it} from 'vitest';
import {TILE_SIZES, tileSize} from '@/lib/tileSize';
import {ITEM_SHAPES} from '@/models/Item';

/** Tile sizes by shape (lib/tileSize.ts, used by components/ItemTile.tsx). */

/** Pixel sizes of the Tailwind classes, below and from the md breakpoint. */
function pixels(className: string): {small: {width: number; height: number}; md: {width: number; height: number}} {
  const size = (prefix: string, axis: 'w' | 'h') => {
    const match = className.match(new RegExp(`(?:^|\\s)${prefix}${axis}-(\\d+)(?:\\s|$)`));
    if (!match) throw new Error(`No ${prefix}${axis}- class in "${className}"`);
    return Number(match[1]) * 4;
  };
  return {small: {width: size('', 'w'), height: size('', 'h')}, md: {width: size('md:', 'w'), height: size('md:', 'h')}};
}

describe('tile sizes', () => {
  it('has a size for every shape, and square keeps the size tiles always had', () => {
    expect(Object.keys(TILE_SIZES).sort()).toEqual([...ITEM_SHAPES].sort());
    expect(TILE_SIZES.square).toEqual({className: 'w-16 h-16 md:w-20 md:h-20', sizes: '(max-width: 640px) 64px, (max-width: 768px) 80px, 96px'});
  });

  it('gives every shape the same height, and the width of its canvas (16:9, 3:4)', () => {
    const ratios = {square: 1, landscape: 384 / 216, portrait: 216 / 288};
    for (const shape of ITEM_SHAPES) {
      const {small, md} = pixels(TILE_SIZES[shape].className);
      expect(small.height, shape).toBe(64);
      expect(md.height, shape).toBe(80);
      expect(small.width / small.height, shape).toBeCloseTo(ratios[shape], 1);
      expect(md.width / md.height, shape).toBeCloseTo(ratios[shape], 1);
    }
  });

  it('reads the shape of an item, square when it has none or an unknown one', () => {
    expect(tileSize({shape: 'landscape'})).toBe(TILE_SIZES.landscape);
    expect(tileSize({shape: 'portrait'})).toBe(TILE_SIZES.portrait);
    expect(tileSize({})).toBe(TILE_SIZES.square);
    expect(tileSize({shape: 'hexagon' as never})).toBe(TILE_SIZES.square);
  });
});
