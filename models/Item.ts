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

export default interface Item {
  id: string;
  content: string;
  imageUrl?: string;
  /** Tile shape. TierCortex sets it only on package images that are not square. Read it with itemShape(). */
  shape?: ItemShape;
  onDelete?: (id: string) => void;
  showLabel?: boolean;
}

/** The tile shape of an item: its package image's shape, or square. */
export function itemShape(item: Pick<Item, 'shape'>): ItemShape {
  return isItemShape(item.shape) ? item.shape : DEFAULT_ITEM_SHAPE;
}
