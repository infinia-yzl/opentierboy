import {describe, expect, it} from 'vitest';
import {
  itemAnnouncement,
  rowAnnouncement,
  rowItemsAnnouncement,
  previewAnnouncement,
  SCREEN_READER_INSTRUCTIONS,
  type DragPhase,
} from '@/lib/dnd/announcements';
import {moveRowInPreview, previewItemOver, previewStackOver} from '@/lib/dnd/preview';

const tiers = [
  {id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-mauga.webp', content: 'Mauga'}, {id: 'w', content: 'Winston'}]},
  {id: 'tier-a', name: 'A', items: []},
  {id: 'tier-1', name: '', items: [{id: 'x', content: ''}]},
  {id: 'uncategorized', name: '', items: [{id: 's', content: 'Sigma'}, {id: 'd', content: 'D.Va'}, {id: 'o', content: 'Orisa'}]},
];

const PHASES: DragPhase[] = ['start', 'over', 'drop', 'cancel'];

describe('itemAnnouncement', () => {
  it('returns the item label, row label and position when the phase is start, over, drop or cancel', () => {
    const from = {tierId: 'uncategorized', index: 1};
    const to = {tierId: 'tier-s', index: 2};
    expect(itemAnnouncement('start', tiers, 'd', from)).toBe('Picked up D.Va, in Unranked, position 2 of 3.');
    expect(itemAnnouncement('over', tiers, 'd', from, to)).toBe('D.Va moves to row S, position 3 of 3.');
    expect(itemAnnouncement('drop', tiers, 'd', from, to)).toBe('Dropped D.Va in row S, position 3 of 3.');
    expect(itemAnnouncement('cancel', tiers, 'd', from, to)).toBe('Move cancelled. D.Va is back in Unranked, position 2 of 3.');
  });

  it('returns positions counted without the item when it moves inside its own row', () => {
    const from = {tierId: 'tier-s', index: 1};
    expect(itemAnnouncement('over', tiers, 'w', from, {tierId: 'tier-s', index: 0})).toBe('Winston moves to row S, position 1 of 2.');
    expect(itemAnnouncement('drop', tiers, 'w', from, {tierId: 'tier-s', index: 1})).toBe('Dropped Winston. It stays in row S, position 2 of 2.');
    expect(itemAnnouncement('over', tiers, 'w', from, from)).toBe('Winston is back in row S, position 2 of 2.');
  });

  it('returns Row <n> and Unnamed item when the row has no label and the item no content', () => {
    expect(itemAnnouncement('drop', tiers, 's', {tierId: 'uncategorized', index: 0}, {tierId: 'tier-1', index: 0}))
      .toBe('Dropped Sigma in Row 3, position 1 of 2.');
    expect(itemAnnouncement('start', tiers, 'x', {tierId: 'tier-1', index: 0})).toBe('Picked up Unnamed item, in Row 3, position 1 of 1.');
  });

  it('returns undefined when the item, row or index does not fit the list', () => {
    expect(itemAnnouncement('start', tiers, 'nope', {tierId: 'tier-s', index: 0})).toBeUndefined();
    expect(itemAnnouncement('start', tiers, 'w', {tierId: 'nope', index: 0})).toBeUndefined();
    expect(itemAnnouncement('over', tiers, 'w', {tierId: 'tier-s', index: 1}, {tierId: 'nope', index: 0})).toBeUndefined();
    expect(itemAnnouncement('over', tiers, 'w', {tierId: 'tier-s', index: 1}, {tierId: 'tier-a', index: 1})).toBeUndefined();
    expect(itemAnnouncement('drop', tiers, 'w', {tierId: 'tier-s', index: 1}, null)).toBeUndefined();
  });

  it('returns text with no internal id when any item moves to any row in any phase', () => {
    const ids = [...tiers.map(t => t.id), ...tiers.flatMap(t => t.items.map(i => i.id))].filter(id => id.length > 1);
    for (const phase of PHASES) {
      for (const [fromTier, row] of tiers.entries()) {
        for (const [index, item] of row.items.entries()) {
          for (const target of tiers) {
            const text = itemAnnouncement(phase, tiers, item.id, {tierId: row.id, index}, {tierId: target.id, index: 0}) ?? '';
            expect(text, `${phase} ${fromTier}`).not.toBe('');
            for (const id of ids) expect(text).not.toContain(id);
          }
        }
      }
    }
  });
});

describe('rowAnnouncement', () => {
  it('returns text that the whole row moves, with its name, when a row is dragged by its grip', () => {
    const preview = moveRowInPreview(tiers, 0, 1);
    expect(rowAnnouncement('start', tiers, 0)).toBe('Picked up row S, with its name and items. Position 1 of 3.');
    expect(rowAnnouncement('over', tiers, 0, 1, preview)).toBe('Row S, position 2 of 3, below row A.');
    expect(rowAnnouncement('over', tiers, 0, 0, tiers)).toBe('Row S, position 1 of 3, above row A.');
    expect(rowAnnouncement('drop', tiers, 0, 1, preview)).toBe('Dropped row S at position 2 of 3.');
    expect(rowAnnouncement('drop', tiers, 2, 2)).toBe('Dropped Row 3. It stays at position 3 of 3.');
    expect(rowAnnouncement('cancel', tiers, 1, 0)).toBe('Move cancelled. Row A is back at position 2 of 3.');
  });

  it('returns no row beside it when the list has one ranked row', () => {
    const one = [tiers[0], tiers[3]];
    expect(rowAnnouncement('over', one, 0, 0, one)).toBe('Row S, position 1 of 1.');
  });

  it('returns undefined when a row index does not exist or is Unranked', () => {
    expect(rowAnnouncement('start', tiers, 3)).toBeUndefined();
    expect(rowAnnouncement('start', tiers, 4)).toBeUndefined();
    expect(rowAnnouncement('over', tiers, 0, 3)).toBeUndefined();
    expect(rowAnnouncement('drop', tiers, 0)).toBeUndefined();
    expect(rowAnnouncement('start', tiers, -1)).toBeUndefined();
  });
});

describe('rowItemsAnnouncement', () => {
  it('returns text that the items move and the row labels stay in place when a row is dragged by its stack', () => {
    expect(rowItemsAnnouncement('start', tiers, 0)).toBe('Picked up the 2 items of row S.');
    expect(rowItemsAnnouncement('over', tiers, 0, 1)).toBe('The 2 items, over row A.');
    expect(rowItemsAnnouncement('over', tiers, 0, 0)).toBe('The 2 items, back in row S.');
    expect(rowItemsAnnouncement('drop', tiers, 0, 1)).toBe("Dropped the 2 items in row A. Row A's items are now in row S.");
    expect(rowItemsAnnouncement('drop', tiers, 2, 2)).toBe('Dropped. The 1 item stay in Row 3.');
    expect(rowItemsAnnouncement('cancel', tiers, 2, 0)).toBe('Move cancelled. The 1 item stay in Row 3.');
  });

  it('returns the rows that move one place when the items go past more than one row', () => {
    expect(rowItemsAnnouncement('drop', tiers, 0, 2)).toBe('Dropped the 2 items in Row 3. The items of row A to Row 3 move up one row.');
    expect(rowItemsAnnouncement('drop', tiers, 2, 0)).toBe('Dropped the 1 item in row S. The items of row S to row A move down one row.');
  });

  it('returns undefined when a row index does not exist or is Unranked', () => {
    expect(rowItemsAnnouncement('start', tiers, 3)).toBeUndefined();
    expect(rowItemsAnnouncement('over', tiers, 0, 3)).toBeUndefined();
    expect(rowItemsAnnouncement('drop', tiers, 0, null)).toBeUndefined();
  });
});

describe('previewAnnouncement', () => {
  it('returns the position in the preview list when an item is dragged', () => {
    const preview = previewItemOver(tiers, 'o', {kind: 'tier', tierId: 'tier-a'});
    expect(previewAnnouncement('start', tiers, tiers, 'item:image-overwatch-mauga.webp')).toBe('Picked up Mauga, in row S, position 1 of 2.');
    expect(previewAnnouncement('over', tiers, preview, 'item:o')).toBe('Orisa moves to row A, position 1 of 1.');
    expect(previewAnnouncement('drop', tiers, preview, 'item:o')).toBe('Dropped Orisa in row A, position 1 of 1.');
    expect(previewAnnouncement('cancel', tiers, preview, 'item:o')).toBe('Move cancelled. Orisa is back in Unranked, position 3 of 3.');
    const inRow = previewItemOver(tiers, 'o', {kind: 'item', itemId: 's', after: false});
    expect(previewAnnouncement('over', tiers, inRow, 'item:o')).toBe('Orisa moves to Unranked, position 1 of 3.');
    expect(previewAnnouncement('over', tiers, tiers, 'item:o')).toBe('Orisa is back in Unranked, position 3 of 3.');
  });

  it('returns the position of the whole row in the preview when a row is dragged by its grip', () => {
    const preview = moveRowInPreview(tiers, 1, 0);
    expect(previewAnnouncement('start', tiers, tiers, 'row:tier-a')).toBe('Picked up row A, with its name and items. Position 2 of 3.');
    expect(previewAnnouncement('over', tiers, preview, 'row:tier-a')).toBe('Row A, position 1 of 3, above row S.');
    expect(previewAnnouncement('drop', tiers, preview, 'row:tier-a')).toBe('Dropped row A at position 1 of 3.');
  });

  it('returns the labels of the target positions when a row is dragged by its stack in the preview', () => {
    const preview = previewStackOver(tiers, 'tier-a', 'tier-s');
    expect(previewAnnouncement('start', tiers, tiers, 'stack:tier-a')).toBe('Picked up the 0 items of row A.');
    expect(previewAnnouncement('over', tiers, preview, 'stack:tier-a')).toBe('The 0 items, over row S.');
    expect(previewAnnouncement('drop', tiers, preview, 'stack:tier-a')).toBe("Dropped the 0 items in row S. Row S's items are now in row A.");
  });

  it('returns undefined when the id is no item:, row: or stack: id in the list', () => {
    expect(previewAnnouncement('start', tiers, tiers, 'item:nope')).toBeUndefined();
    expect(previewAnnouncement('start', tiers, tiers, 'row:nope')).toBeUndefined();
    expect(previewAnnouncement('start', tiers, tiers, 'tier:tier-s')).toBeUndefined();
    expect(previewAnnouncement('start', tiers, tiers, 'o')).toBeUndefined();
    expect(previewAnnouncement('over', tiers, [], 'item:o')).toBeUndefined();
    expect(previewAnnouncement('over', tiers, [], 'row:tier-a')).toBeUndefined();
    expect(previewAnnouncement('start', tiers, tiers, 'stack:nope')).toBeUndefined();
  });
});

describe('SCREEN_READER_INSTRUCTIONS', () => {
  it('returns text naming Space or Enter, arrow keys and Escape when it is read', () => {
    expect(SCREEN_READER_INSTRUCTIONS).toMatch(/Space or Enter/);
    expect(SCREEN_READER_INSTRUCTIONS).toMatch(/arrow keys/);
    expect(SCREEN_READER_INSTRUCTIONS).toMatch(/Escape/);
  });
});
