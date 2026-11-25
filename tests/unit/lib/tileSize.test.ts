import {describe, expect, it} from 'vitest';
import {COMPACT_TILE_CLASSES, STAGE_TILE_CLASSES, TILE_SIZES, tileClassName, tileSize} from '@/lib/tileSize';
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

describe('TILE_SIZES and tileSize', () => {
  it('returns one size per ITEM_SHAPES entry, and the original square classes, when TILE_SIZES is read', () => {
    expect(Object.keys(TILE_SIZES).sort()).toEqual([...ITEM_SHAPES].sort());
    expect(TILE_SIZES.square).toEqual({className: 'w-16 h-16 md:w-20 md:h-20', sizes: '(max-width: 640px) 64px, (max-width: 768px) 80px, 96px'});
  });

  it('returns heights of 64 and 80 px and the canvas ratio (16:9, 3:4) when each shape class is measured', () => {
    const ratios = {square: 1, landscape: 384 / 216, portrait: 216 / 288};
    for (const shape of ITEM_SHAPES) {
      const {small, md} = pixels(TILE_SIZES[shape].className);
      expect(small.height, shape).toBe(64);
      expect(md.height, shape).toBe(80);
      expect(small.width / small.height, shape).toBeCloseTo(ratios[shape], 1);
      expect(md.width / md.height, shape).toBeCloseTo(ratios[shape], 1);
    }
  });

  it('returns the size of the item shape when known, and square when the shape is missing or unknown', () => {
    expect(tileSize({shape: 'landscape'})).toBe(TILE_SIZES.landscape);
    expect(tileSize({shape: 'portrait'})).toBe(TILE_SIZES.portrait);
    expect(tileSize({})).toBe(TILE_SIZES.square);
    expect(tileSize({shape: 'hexagon' as never})).toBe(TILE_SIZES.square);
  });
});

describe('COMPACT_TILE_CLASSES', () => {
  it('returns a height of 48 px and the canvas ratio when each compact shape class is measured', () => {
    const ratios = {square: 1, landscape: 384 / 216, portrait: 216 / 288};
    for (const shape of ITEM_SHAPES) {
      const size = (axis: 'w' | 'h') => {
        const match = COMPACT_TILE_CLASSES[shape].match(new RegExp(`compact:${axis}-(\\d+)`));
        if (!match) throw new Error(`No compact:${axis}- class for ${shape}`);
        return Number(match[1]) * 4;
      };
      expect(size('h'), shape).toBe(48);
      expect(size('w') / size('h'), shape).toBeCloseTo(ratios[shape], 1);
    }
  });
});

describe('STAGE_TILE_CLASSES', () => {
  it('returns the frame tile height for every shape when the classes are read', () => {
    for (const shape of ITEM_SHAPES) {
      expect(STAGE_TILE_CLASSES[shape], shape).toContain('stage:h-(--stage-tile)');
    }
  });
});

describe('tileClassName', () => {
  it('returns the editor, compact and frame classes of the shape when the item has one', () => {
    expect(tileClassName({shape: 'landscape'})).toBe(
      `${TILE_SIZES.landscape.className} ${COMPACT_TILE_CLASSES.landscape} ${STAGE_TILE_CLASSES.landscape}`,
    );
    expect(tileClassName({})).toContain(TILE_SIZES.square.className);
  });
});
