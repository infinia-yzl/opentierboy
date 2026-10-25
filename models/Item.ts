/**
 * Tile shapes. An image set may declare a shape per image and per category (tag) in
 * imageset.config.json; anything without one is square. Tiles still render square until the
 * drag and drop update (revamp Phase 5e) adapts them to these shapes.
 */
export const ITEM_SHAPES = ['square', 'landscape', 'portrait'] as const;
export type ItemShape = typeof ITEM_SHAPES[number];
export const DEFAULT_ITEM_SHAPE: ItemShape = 'square';

export function isItemShape(value: unknown): value is ItemShape {
  return typeof value === 'string' && (ITEM_SHAPES as readonly string[]).includes(value);
}

/**
 * How a v3 link stores an item (lib/state, docs/link-format-v3.md):
 * - 'link': an image from a web address (`url`). The browser loads it from trusted sites, and
 *   from other sites once the visitor allows them; the server only from trusted sites, for
 *   link previews (contexts/CustomImagesContext.tsx, app/api/og/link-images.ts).
 * - 'device': an upload or pasted image, by its local id (`id`): its key in this browser's
 *   image store (lib/images/deviceStore.ts).
 * - 'package': an image-set id that the image sets do not know (any more), from a v3 link.
 */
export type ItemSource = 'package' | 'device' | 'link';

export default interface Item {
  id: string;
  content: string;
  imageUrl?: string;
  /** Tile shape. packageItemLookup (lib/packageItems.ts) sets it only on package images that are not square. Read it with itemShape(). */
  shape?: ItemShape;
  /**
   * How a v3 link stores the item. Unset for image-set items and for items from legacy links:
   * encodeListForURL (lib/listLink.ts) tells those apart by their id. New uploads and pasted images
   * have 'device', new link images 'link'.
   */
  source?: ItemSource;
  /** The image address of a link image (source 'link'). */
  url?: string;
  onDelete?: (id: string) => void;
  showLabel?: boolean;
}

/** The tile shape of an item: its package image's shape, or square. */
export function itemShape(item: Pick<Item, 'shape'>): ItemShape {
  return isItemShape(item.shape) ? item.shape : DEFAULT_ITEM_SHAPE;
}
