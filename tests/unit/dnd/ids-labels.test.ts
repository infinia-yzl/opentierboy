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

describe('dnd ids', () => {
  it('prefixes item, row and tier ids, and reads them back', () => {
    expect(itemDndId('image-overwatch-ana.webp')).toBe('item:image-overwatch-ana.webp');
    expect(rowDndId('tier-s')).toBe('row:tier-s');
    expect(tierItemsDndId('tier-s')).toBe('tier:tier-s');
    expect(parseDndId('item:image-overwatch-ana.webp')).toEqual({kind: 'item', id: 'image-overwatch-ana.webp'});
    expect(parseDndId(rowDndId('tier-s'))).toEqual({kind: 'row', id: 'tier-s'});
    expect(parseDndId(tierItemsDndId('uncategorized'))).toEqual({kind: 'tier', id: 'uncategorized'});
  });

  it('keeps colons inside app ids, and keeps an item and a tier with the same id apart', () => {
    expect(parseDndId(itemDndId('a:b:c'))).toEqual({kind: 'item', id: 'a:b:c'});
    expect(itemDndId('tier-s')).not.toBe(tierItemsDndId('tier-s'));
  });

  it('rejects anything it did not make', () => {
    for (const value of ['tier-s', 'other:x', ':x', '', 42, null, undefined, {id: 'item:x'}]) {
      expect(parseDndId(value), String(value)).toBeNull();
    }
    expect(parseDndId('item:')).toEqual({kind: 'item', id: ''});
  });
});

describe('labels', () => {
  it('names rows like the editor: label, "Unranked" for the unnamed last row, "Tier <n>" otherwise', () => {
    expect(tiers.map((_, index) => tierLabel(tiers, index))).toEqual(['S', 'Tier 2', 'Tier 10', 'tiermaker', 'Unranked']);
  });

  it('reads rows inside sentences', () => {
    expect(tiers.map((_, index) => tierPhrase(tiers, index))).toEqual(['tier S', 'Tier 2', 'Tier 10', 'tier tiermaker', 'Unranked']);
  });

  it('treats a label that is not a string as empty', () => {
    const odd = [{id: 'x', name: {} as unknown as string, items: []}, {id: 'y', name: '', items: []}];
    expect(tierLabel(odd, 0)).toBe('Tier 1');
    expect(tierLabel(odd, 5)).toBe('Tier 6');
    expect(itemLabel({content: 7 as unknown as string})).toBe('Unnamed item');
  });

  it('names items by their label', () => {
    expect(itemLabel({content: ' Mauga '})).toBe('Mauga');
    expect(itemLabel({content: ''})).toBe('Unnamed item');
    expect(itemLabel(undefined)).toBe('Unnamed item');
  });
});
