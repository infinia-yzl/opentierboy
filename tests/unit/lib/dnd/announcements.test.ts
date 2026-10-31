import {describe, expect, it} from 'vitest';
import {
  itemAnnouncement,
  rowAnnouncement,
  previewAnnouncement,
  SCREEN_READER_INSTRUCTIONS,
  type DragPhase,
} from '@/lib/dnd/announcements';
import {moveRowInPreview, previewItemOver} from '@/lib/dnd/preview';

const tiers = [
  {id: 'tier-s', name: 'S', items: [{id: 'image-overwatch-mauga.webp', content: 'Mauga'}, {id: 'w', content: 'Winston'}]},
  {id: 'tier-a', name: 'A', items: []},
  {id: 'tier-1', name: '', items: [{id: 'x', content: ''}]},
  {id: 'uncategorized', name: '', items: [{id: 's', content: 'Sigma'}, {id: 'd', content: 'D.Va'}, {id: 'o', content: 'Orisa'}]},
];

const PHASES: DragPhase[] = ['start', 'over', 'drop', 'cancel'];

describe('item announcements', () => {
  it('names the item, the tier label and the position', () => {
    const from = {tierId: 'uncategorized', index: 1};
    const to = {tierId: 'tier-s', index: 2};
    expect(itemAnnouncement('start', tiers, 'd', from)).toBe('Picked up D.Va, in Unranked, position 2 of 3.');
    expect(itemAnnouncement('over', tiers, 'd', from, to)).toBe('D.Va moves to tier S, position 3 of 3.');
    expect(itemAnnouncement('drop', tiers, 'd', from, to)).toBe('Dropped D.Va in tier S, position 3 of 3.');
    expect(itemAnnouncement('cancel', tiers, 'd', from, to)).toBe('Move cancelled. D.Va is back in Unranked, position 2 of 3.');
  });

  it('counts the row without the item when it moves inside one row', () => {
    const from = {tierId: 'tier-s', index: 1};
    expect(itemAnnouncement('over', tiers, 'w', from, {tierId: 'tier-s', index: 0})).toBe('Winston moves to tier S, position 1 of 2.');
    expect(itemAnnouncement('drop', tiers, 'w', from, {tierId: 'tier-s', index: 1})).toBe('Dropped Winston. It stays in tier S, position 2 of 2.');
    expect(itemAnnouncement('over', tiers, 'w', from, from)).toBe('Winston is back in tier S, position 2 of 2.');
  });

  it('names an empty tier and an unnamed item without ids', () => {
    expect(itemAnnouncement('drop', tiers, 's', {tierId: 'uncategorized', index: 0}, {tierId: 'tier-1', index: 0}))
      .toBe('Dropped Sigma in Tier 3, position 1 of 2.');
    expect(itemAnnouncement('start', tiers, 'x', {tierId: 'tier-1', index: 0})).toBe('Picked up Unnamed item, in Tier 3, position 1 of 1.');
  });

  it('says nothing for input that does not fit the list', () => {
    expect(itemAnnouncement('start', tiers, 'nope', {tierId: 'tier-s', index: 0})).toBeUndefined();
    expect(itemAnnouncement('start', tiers, 'w', {tierId: 'nope', index: 0})).toBeUndefined();
    expect(itemAnnouncement('over', tiers, 'w', {tierId: 'tier-s', index: 1}, {tierId: 'nope', index: 0})).toBeUndefined();
    expect(itemAnnouncement('over', tiers, 'w', {tierId: 'tier-s', index: 1}, {tierId: 'tier-a', index: 1})).toBeUndefined();
    expect(itemAnnouncement('drop', tiers, 'w', {tierId: 'tier-s', index: 1}, null)).toBeUndefined();
  });

  it('never contains an internal id', () => {
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

describe('row announcements', () => {
  it('says that the items move and the labels stay', () => {
    expect(rowAnnouncement('start', tiers, 0)).toBe('Picked up the items of tier S, row 1 of 4. The tier labels stay in place.');
    expect(rowAnnouncement('over', tiers, 0, 1)).toBe('The items of tier S move to tier A, row 2 of 4.');
    expect(rowAnnouncement('over', tiers, 0, 0)).toBe('The items of tier S stay in place.');
    expect(rowAnnouncement('drop', tiers, 0, 3)).toBe('Dropped. The items of tier S are now in Unranked.');
    expect(rowAnnouncement('drop', tiers, 2, 2)).toBe('Dropped. The items stay in Tier 3.');
    expect(rowAnnouncement('cancel', tiers, 3, 0)).toBe('Move cancelled. The items stay in Unranked.');
  });

  it('says nothing for rows that do not exist', () => {
    expect(rowAnnouncement('start', tiers, 4)).toBeUndefined();
    expect(rowAnnouncement('over', tiers, 0, 4)).toBeUndefined();
    expect(rowAnnouncement('drop', tiers, 0)).toBeUndefined();
    expect(rowAnnouncement('start', tiers, -1)).toBeUndefined();
  });
});

describe('preview announcements', () => {
  it('name the position in the preview, as the screen shows it during the drag', () => {
    const preview = previewItemOver(tiers, 'o', {kind: 'tier', tierId: 'tier-a'});
    expect(previewAnnouncement('start', tiers, tiers, 'item:image-overwatch-mauga.webp')).toBe('Picked up Mauga, in tier S, position 1 of 2.');
    expect(previewAnnouncement('over', tiers, preview, 'item:o')).toBe('Orisa moves to tier A, position 1 of 1.');
    expect(previewAnnouncement('drop', tiers, preview, 'item:o')).toBe('Dropped Orisa in tier A, position 1 of 1.');
    expect(previewAnnouncement('cancel', tiers, preview, 'item:o')).toBe('Move cancelled. Orisa is back in Unranked, position 3 of 3.');
    const inRow = previewItemOver(tiers, 'o', {kind: 'item', itemId: 's', after: false});
    expect(previewAnnouncement('over', tiers, inRow, 'item:o')).toBe('Orisa moves to Unranked, position 1 of 3.');
    expect(previewAnnouncement('over', tiers, tiers, 'item:o')).toBe('Orisa is back in Unranked, position 3 of 3.');
  });

  it('name rows by the labels of the positions, which stay in place', () => {
    const preview = moveRowInPreview(tiers, 1, 0);
    expect(previewAnnouncement('start', tiers, tiers, 'row:tier-a')).toBe('Picked up the items of tier A, row 2 of 4. The tier labels stay in place.');
    expect(previewAnnouncement('over', tiers, preview, 'row:tier-a')).toBe('The items of tier A move to tier S, row 1 of 4.');
    expect(previewAnnouncement('drop', tiers, preview, 'row:tier-a')).toBe('Dropped. The items of tier A are now in tier S.');
  });

  it('say nothing for ids that are not in the list', () => {
    expect(previewAnnouncement('start', tiers, tiers, 'item:nope')).toBeUndefined();
    expect(previewAnnouncement('start', tiers, tiers, 'row:nope')).toBeUndefined();
    expect(previewAnnouncement('start', tiers, tiers, 'tier:tier-s')).toBeUndefined();
    expect(previewAnnouncement('start', tiers, tiers, 'o')).toBeUndefined();
    expect(previewAnnouncement('over', tiers, [], 'item:o')).toBeUndefined();
    expect(previewAnnouncement('over', tiers, [], 'row:tier-a')).toBeUndefined();
  });

  it('has instructions for keyboard users', () => {
    expect(SCREEN_READER_INSTRUCTIONS).toMatch(/Space or Enter/);
    expect(SCREEN_READER_INSTRUCTIONS).toMatch(/arrow keys/);
    expect(SCREEN_READER_INSTRUCTIONS).toMatch(/Escape/);
  });
});
