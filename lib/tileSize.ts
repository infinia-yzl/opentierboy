import {itemShape, type ItemShape} from '@/models/Item';

/**
 * How big an item tile is, by its shape (models/Item.ts). Every shape has the height of the
 * square tile, so the lines of a row stay even when they wrap; the width follows the shape's
 * canvas in the image sets: landscape 384 x 216 (16:9), portrait 216 x 288 (3:4).
 *
 * - `className`: Tailwind size classes of the tile (64 px high, 80 px from the md breakpoint).
 * - `sizes`: the `sizes` hint for next/image, so the browser loads a wide enough image.
 *
 * Square keeps the size the editor always had.
 */
export interface TileSize {
  className: string;
  sizes: string;
}

export const TILE_SIZES: Readonly<Record<ItemShape, TileSize>> = Object.freeze({
  square: {className: 'w-16 h-16 md:w-20 md:h-20', sizes: '(max-width: 640px) 64px, (max-width: 768px) 80px, 96px'},
  landscape: {className: 'w-28 h-16 md:w-36 md:h-20', sizes: '(max-width: 640px) 112px, (max-width: 768px) 144px, 168px'},
  portrait: {className: 'w-12 h-16 md:w-15 md:h-20', sizes: '(max-width: 640px) 48px, (max-width: 768px) 60px, 72px'},
});

/** The tile size of an item: by its shape, square when it has none. */
export function tileSize(item: Parameters<typeof itemShape>[0]): TileSize {
  return TILE_SIZES[itemShape(item)];
}
