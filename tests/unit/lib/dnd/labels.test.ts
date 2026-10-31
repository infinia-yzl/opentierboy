import {describe, expect, it} from 'vitest';
import {itemLabel, tierLabel, tierPhrase} from '@/lib/dnd/labels';

const tiers = [
  {id: 'tier-s', name: 'S', items: []},
  {id: 'tier-a', name: '  ', items: []},
  {id: 'tier-10', name: 'Tier 10', items: []},
  {id: 'tier-x', name: 'tiermaker', items: []},
  {id: 'uncategorized', name: '', items: []},
];

describe('tierLabel, tierPhrase and itemLabel', () => {
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
