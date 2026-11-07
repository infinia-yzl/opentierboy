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
 *
 * Two more sizes come on top of these, as Tailwind variants (app/globals.css):
 * - Compact tiles (COMPACT_TILE_CLASSES): 48 px high, for big lists (the dense editor, a view
 *   setting kept in this browser: components/useTileSize.ts).
 * - Frame layouts (STAGE_TILE_CLASSES): Zen 16:9, 9:16 and the stream overlay size tiles in
 *   frame pixels, from the `--stage-tile` variable (lib/zen/layouts.ts).
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

/** Compact tiles: 48 px high, at the shape's ratio. */
export const COMPACT_TILE_CLASSES: Readonly<Record<ItemShape, string>> = Object.freeze({
  square: 'compact:w-12 compact:h-12',
  landscape: 'compact:w-21 compact:h-12',
  portrait: 'compact:w-9 compact:h-12',
});

/** Tiles in a frame layout: `--stage-tile` high, at the shape's ratio. */
export const STAGE_TILE_CLASSES: Readonly<Record<ItemShape, string>> = Object.freeze({
  square: 'stage:w-(--stage-tile) stage:h-(--stage-tile)',
  landscape: 'stage:w-[calc(var(--stage-tile)*16/9)] stage:h-(--stage-tile)',
  portrait: 'stage:w-[calc(var(--stage-tile)*3/4)] stage:h-(--stage-tile)',
});

/** All size classes of an item's tile: the editor's, Compact's and the frame layouts'. */
export function tileClassName(item: Parameters<typeof itemShape>[0]): string {
  const shape = itemShape(item);
  return `${TILE_SIZES[shape].className} ${COMPACT_TILE_CLASSES[shape]} ${STAGE_TILE_CLASSES[shape]}`;
}

/** The tile size of an item: by its shape, square when it has none. */
export function tileSize(item: Parameters<typeof itemShape>[0]): TileSize {
  return TILE_SIZES[itemShape(item)];
}
