import {describe, expect, it} from 'vitest';
import {anchorPhrase, notesText} from '@/lib/scribble/names';
import type Tier from '@/models/Tier';

const TIERS: Tier[] = [
  {id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-ana.webp', content: 'Ana'}]},
  {id: 'tier-a', name: '', items: []},
  {id: 'uncategorized', name: '', items: [{id: 'image-overwatch-mei.webp', content: ''}]},
];

describe('notesText', () => {
  it.each([[0, 'no notes'], [1, '1 note'], [2, '2 notes'], [12, '12 notes']])('returns the count %i as "%s" when the notes are counted', (count, text) => {
    expect(notesText(count)).toBe(text);
  });
});

describe('anchorPhrase', () => {
  it('returns the label of the item when the anchor is an item', () => {
    expect(anchorPhrase({kind: 'item', id: 'image-overwatch-ana.webp'}, TIERS)).toBe('on Ana');
  });

  it('returns "an item" when the item of the anchor has no label or is absent', () => {
    expect(anchorPhrase({kind: 'item', id: 'image-overwatch-mei.webp'}, TIERS)).toBe('on an item');
    expect(anchorPhrase({kind: 'item', id: 'gone'}, TIERS)).toBe('on an item');
  });

  it('returns the name of the row when the anchor is a named row', () => {
    expect(anchorPhrase({kind: 'row', index: 0}, TIERS)).toBe('on row S');
  });

  it('returns the place of the row when the anchor is a row without a name', () => {
    expect(anchorPhrase({kind: 'row', index: 1}, TIERS)).toBe('on Row 2');
  });

  it('returns Unranked when the anchor is the tray and the tray has no name', () => {
    expect(anchorPhrase({kind: 'tray'}, TIERS)).toBe('on Unranked');
  });

  it('returns the frame when the anchor is the frame', () => {
    expect(anchorPhrase({kind: 'frame'}, TIERS)).toBe('on the frame');
  });
});
