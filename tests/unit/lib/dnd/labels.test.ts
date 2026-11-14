import {describe, expect, it} from 'vitest';
import {itemLabel, rowGripName, rowStackName, tierLabel, tierPhrase} from '@/lib/dnd/labels';

const tiers = [
  {id: 'tier-s', name: 'S', items: []},
  {id: 'tier-a', name: '  ', items: []},
  {id: 'tier-10', name: 'Tier 10', items: []},
  {id: 'tier-x', name: 'tiermaker', items: []},
  {id: 'uncategorized', name: '', items: []},
];

describe('tierLabel, tierPhrase and itemLabel', () => {
  it('returns the label, Unranked for the unnamed last row, or Row <n> when tierLabel gets a row', () => {
    expect(tiers.map((_, index) => tierLabel(tiers, index))).toEqual(['S', 'Row 2', 'Tier 10', 'tiermaker', 'Unranked']);
  });

  it('returns row <label>, Row <n>, a label that starts with Tier or Row, or Unranked when tierPhrase gets a row', () => {
    expect(tiers.map((_, index) => tierPhrase(tiers, index))).toEqual(['row S', 'Row 2', 'Tier 10', 'row tiermaker', 'Unranked']);
    expect(tierPhrase([{id: 'r', name: 'Row of fame', items: []}, tiers[4]], 0)).toBe('Row of fame');
  });

  it('returns Row <n> and Unnamed item when the row label or item content is not a string', () => {
    const odd = [{id: 'x', name: {} as unknown as string, items: []}, {id: 'y', name: '', items: []}];
    expect(tierLabel(odd, 0)).toBe('Row 1');
    expect(tierLabel(odd, 5)).toBe('Row 6');
    expect(itemLabel({content: 7 as unknown as string})).toBe('Unnamed item');
  });

  it('returns the trimmed content or Unnamed item when itemLabel gets an item with or without content', () => {
    expect(itemLabel({content: ' Mauga '})).toBe('Mauga');
    expect(itemLabel({content: ''})).toBe('Unnamed item');
    expect(itemLabel(undefined)).toBe('Unnamed item');
  });
});

describe('rowGripName and rowStackName', () => {
  it('returns Move row <label> or Move Row <n> when rowGripName gets a named or unnamed row', () => {
    expect(rowGripName('S', 0)).toBe('Move row S');
    expect(rowGripName(' ', 3)).toBe('Move Row 4');
    expect(rowGripName('Tier 10', 9)).toBe('Move Tier 10');
  });

  it('returns the count of items, or that there is none to move, when rowStackName gets a row', () => {
    expect(rowStackName('S', 0, 3)).toBe('Move the 3 items of row S');
    expect(rowStackName('', 3, 1)).toBe('Move the 1 item of Row 4');
    expect(rowStackName('C', 3, 0)).toBe('Row C has 0 items to move');
    expect(rowStackName('', 3, 0)).toBe('Row 4 has 0 items to move');
  });
});
