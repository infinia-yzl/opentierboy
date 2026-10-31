import {describe, expect, it} from 'vitest';
import {
  itemMoveFromPreview,
  moveRowInPreview,
  previewItemOver,
  previewRowOver,
  rowMoveFromPreview,
} from '@/lib/dnd/preview';
import {moveItem, reorderRows} from '@/lib/dnd/moves';

const item = (id: string) => ({id, content: id.toUpperCase()});
const tiers = [
  {id: 'tier-s', name: 'S', items: [item('a'), item('b'), item('c')]},
  {id: 'tier-a', name: 'A', items: [item('d')]},
  {id: 'tier-b', name: 'B', items: []},
  {id: 'uncategorized', name: '', items: [item('e'), item('f')]},
];
const ids = (list: typeof tiers) => list.map(tier => `${tier.id}:${tier.items.map(entry => entry.id).join('')}`);

describe('previewItemOver', () => {
  it('goes before or after another item of its own row, by the half the pointer is over', () => {
    const row = (list: typeof tiers) => ids(list)[0];
    expect(row(previewItemOver(tiers, 'a', {kind: 'item', itemId: 'c', after: false}))).toBe('tier-s:bac');
    expect(row(previewItemOver(tiers, 'a', {kind: 'item', itemId: 'c', after: true}))).toBe('tier-s:bca');
    expect(row(previewItemOver(tiers, 'c', {kind: 'item', itemId: 'a', after: false}))).toBe('tier-s:cab');
    expect(row(previewItemOver(tiers, 'c', {kind: 'item', itemId: 'a', after: true}))).toBe('tier-s:acb');
    // Already just before b, or just after it: nothing changes.
    expect(previewItemOver(tiers, 'a', {kind: 'item', itemId: 'b', after: false})).toBe(tiers);
    expect(previewItemOver(tiers, 'c', {kind: 'item', itemId: 'b', after: true})).toBe(tiers);
  });

  it('goes before or after an item of another row', () => {
    expect(ids(previewItemOver(tiers, 'e', {kind: 'item', itemId: 'b', after: false}))).toEqual(['tier-s:aebc', 'tier-a:d', 'tier-b:', 'uncategorized:f']);
    expect(ids(previewItemOver(tiers, 'e', {kind: 'item', itemId: 'b', after: true}))).toEqual(['tier-s:abec', 'tier-a:d', 'tier-b:', 'uncategorized:f']);
    expect(ids(previewItemOver(tiers, 'e', {kind: 'item', itemId: 'c', after: true}))[0]).toBe('tier-s:abce');
  });

  it('goes to the end of another row over its free space, also an empty row', () => {
    expect(ids(previewItemOver(tiers, 'a', {kind: 'tier', tierId: 'tier-a'}))).toEqual(['tier-s:bc', 'tier-a:da', 'tier-b:', 'uncategorized:ef']);
    expect(ids(previewItemOver(tiers, 'a', {kind: 'tier', tierId: 'tier-b'}))).toEqual(['tier-s:bc', 'tier-a:d', 'tier-b:a', 'uncategorized:ef']);
  });

  it('changes nothing over itself, over the free space of its own row, or for unknown ids', () => {
    for (const over of [
      {kind: 'item', itemId: 'a', after: true},
      {kind: 'tier', tierId: 'tier-s'},
      {kind: 'tier', tierId: 'nope'},
      {kind: 'item', itemId: 'nope', after: false},
    ] as const) {
      expect(previewItemOver(tiers, 'a', over), JSON.stringify(over)).toBe(tiers);
    }
    expect(previewItemOver(tiers, 'nope', {kind: 'tier', tierId: 'tier-b'})).toBe(tiers);
  });

  it('never changes its input, and keeps the rows it does not touch', () => {
    const copy = structuredClone(tiers);
    const next = previewItemOver(tiers, 'e', {kind: 'item', itemId: 'd', after: true});
    expect(tiers).toEqual(copy);
    expect(next[0]).toBe(tiers[0]);
    expect(next[2]).toBe(tiers[2]);
  });

  it('settles: a second event over the same place changes nothing', () => {
    const once = previewItemOver(tiers, 'e', {kind: 'item', itemId: 'b', after: false});
    expect(previewItemOver(once, 'e', {kind: 'item', itemId: 'e', after: false})).toBe(once);
    expect(previewItemOver(once, 'e', {kind: 'tier', tierId: 'tier-s'})).toBe(once);
    expect(previewItemOver(once, 'e', {kind: 'item', itemId: 'b', after: false})).toBe(once);
    const after = previewItemOver(tiers, 'a', {kind: 'item', itemId: 'c', after: true});
    expect(previewItemOver(after, 'a', {kind: 'item', itemId: 'c', after: true})).toBe(after);
  });
});

describe('previewRowOver', () => {
  it('moves a row with its label while dragging', () => {
    const next = previewRowOver(tiers, 'tier-s', 'tier-b');
    expect(next.map(tier => tier.name)).toEqual(['A', 'B', 'S', '']);
    expect(previewRowOver(tiers, 'tier-s', 'tier-s')).toBe(tiers);
    expect(previewRowOver(tiers, 'tier-s', 'nope')).toBe(tiers);
    expect(moveRowInPreview(tiers, 0, 9)).toBe(tiers);
    expect(moveRowInPreview(tiers, 1.5, 0)).toBe(tiers);
  });

  it('never moves a row into the place of Unranked, or Unranked anywhere: it is a fixed tray', () => {
    const unrankedId = tiers[tiers.length - 1].id;
    expect(previewRowOver(tiers, 'tier-s', unrankedId)).toBe(tiers);
    expect(previewRowOver(tiers, unrankedId, 'tier-s')).toBe(tiers);
  });
});

describe('moves from the preview', () => {
  it('turns an item preview into the move that the store applies, with the same result', () => {
    const preview = previewItemOver(previewItemOver(tiers, 'e', {kind: 'tier', tierId: 'tier-b'}), 'e', {kind: 'item', itemId: 'd', after: false});
    const move = itemMoveFromPreview(tiers, preview, 'e');
    expect(move).toEqual({itemId: 'e', from: {tierId: 'uncategorized', index: 0}, to: {tierId: 'tier-a', index: 0}});
    expect(ids(moveItem(tiers, move!.from, move!.to))).toEqual(ids(preview));
  });

  it('turns a row preview into a row move; the labels stay in place on drop', () => {
    const preview = previewRowOver(tiers, 'tier-s', 'tier-a');
    const move = rowMoveFromPreview(tiers, preview, 'tier-s');
    expect(move).toEqual({from: 0, to: 1});
    const dropped = reorderRows(tiers, move!.from, move!.to);
    expect(dropped.map(tier => tier.name)).toEqual(['S', 'A', 'B', '']);
    expect(ids(dropped)).toEqual(ids(preview));
  });

  it('gives no move for a drop where the drag started, or for unknown ids', () => {
    const there = previewItemOver(tiers, 'a', {kind: 'tier', tierId: 'tier-b'});
    const back = previewItemOver(there, 'a', {kind: 'item', itemId: 'b', after: false});
    expect(ids(back)).toEqual(ids(tiers));
    expect(itemMoveFromPreview(tiers, back, 'a')).toBeNull();
    expect(itemMoveFromPreview(tiers, tiers, 'nope')).toBeNull();
    expect(rowMoveFromPreview(tiers, tiers, 'tier-s')).toBeNull();
    expect(rowMoveFromPreview(tiers, [], 'tier-s')).toBeNull();
  });
});
