import {describe, expect, it} from 'vitest';
import {itemDndId, parseDndId, rowDndId, tierItemsDndId} from '@/lib/dnd/ids';
import {itemLabel, tierLabel, tierPhrase} from '@/lib/dnd/labels';

const tiers = [
  {id: 'tier-s', name: 'S', items: []},
  {id: 'tier-a', name: '  ', items: []},
  {id: 'tier-10', name: 'Tier 10', items: []},
  {id: 'tier-x', name: 'tiermaker', items: []},
  {id: 'uncategorized', name: '', items: []},
];

describe('lib/dnd/ids', () => {
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

describe('lib/dnd/labels', () => {
  it('returns the label, Unranked for the unnamed last row, or Tier <n> when tierLabel gets a row', () => {
    expect(tiers.map((_, index) => tierLabel(tiers, index))).toEqual(['S', 'Tier 2', 'Tier 10', 'tiermaker', 'Unranked']);
  });

  it('returns tier <label>, Tier <n> or Unranked when tierPhrase gets a row', () => {
    expect(tiers.map((_, index) => tierPhrase(tiers, index))).toEqual(['tier S', 'Tier 2', 'Tier 10', 'tier tiermaker', 'Unranked']);
  });

  it('returns Tier <n> and Unnamed item when the row label or item content is not a string', () => {
    const odd = [{id: 'x', name: {} as unknown as string, items: []}, {id: 'y', name: '', items: []}];
    expect(tierLabel(odd, 0)).toBe('Tier 1');
    expect(tierLabel(odd, 5)).toBe('Tier 6');
    expect(itemLabel({content: 7 as unknown as string})).toBe('Unnamed item');
  });

  it('returns the trimmed content or Unnamed item when itemLabel gets an item with or without content', () => {
    expect(itemLabel({content: ' Mauga '})).toBe('Mauga');
    expect(itemLabel({content: ''})).toBe('Unnamed item');
    expect(itemLabel(undefined)).toBe('Unnamed item');
  });
});
