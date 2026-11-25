import {describe, expect, it} from 'vitest';
import {assertSameTileItem, itemDndId, parseDndId, rowDndId, tierItemsDndId} from '@/lib/dnd/ids';

describe('itemDndId, rowDndId, tierItemsDndId and parseDndId', () => {
  it('returns item:, row: and tier: ids that parseDndId reads back when called with app ids', () => {
    expect(itemDndId('image-overwatch-ana.webp')).toBe('item:image-overwatch-ana.webp');
    expect(rowDndId('tier-s')).toBe('row:tier-s');
    expect(tierItemsDndId('tier-s')).toBe('tier:tier-s');
    expect(parseDndId('item:image-overwatch-ana.webp')).toEqual({kind: 'item', id: 'image-overwatch-ana.webp'});
    expect(parseDndId(rowDndId('tier-s'))).toEqual({kind: 'row', id: 'tier-s'});
    expect(parseDndId(tierItemsDndId('uncategorized'))).toEqual({kind: 'tier', id: 'uncategorized'});
  });

  it('returns a:b:c from parseDndId when the app id has colons, and distinct item and tier ids for one id', () => {
    expect(parseDndId(itemDndId('a:b:c'))).toEqual({kind: 'item', id: 'a:b:c'});
    expect(itemDndId('tier-s')).not.toBe(tierItemsDndId('tier-s'));
  });

  it('returns null from parseDndId when the value has no item:, row: or tier: prefix', () => {
    for (const value of ['tier-s', 'other:x', ':x', '', 42, null, undefined, {id: 'item:x'}]) {
      expect(parseDndId(value), String(value)).toBeNull();
    }
    expect(parseDndId('item:')).toEqual({kind: 'item', id: ''});
  });
});

describe('assertSameTileItem', () => {
  it('returns undefined when the tile is rendered for its first item id', () => {
    expect(assertSameTileItem('image-overwatch-ana.webp', 'image-overwatch-ana.webp')).toBeUndefined();
  });

  it('throws TypeError naming both ids when the tile is rendered for another item id', () => {
    const change = () => assertSameTileItem('image-overwatch-ana.webp', 'image-overwatch-mauga.webp');
    expect(change).toThrow(TypeError);
    expect(change).toThrow(new TypeError('An item tile cannot change its item (first "image-overwatch-ana.webp", now "image-overwatch-mauga.webp"): render each tile with DraggableTierItem, which keys it by its item id.'));
  });
});
