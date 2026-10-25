import {describe, expect, it} from 'vitest';
import type Tier from '@/models/Tier';
import {dragEndMessage, dragStartMessage, dragUpdateMessage, itemLabel, tierLabel, tierPhrase} from '@/lib/dragAnnouncements';

/** Drag announcements name rows and items as people see them, never by internal ids. */

const item = (id: string, content: string) => ({id, content});
const TIERS: Tier[] = [
  {id: 'tier-s', name: 'S', items: [item('image-overwatch-mau.webp', 'Mauga'), item('image-overwatch-win.webp', 'Winston')]},
  {id: 'tier-a', name: '  ', items: []},
  {id: 'tier-b', name: 'Tier 10', items: [item('k3j9x0a1b', '')]},
  {id: 'uncategorized', name: '', items: [item('image-overwatch-sig.webp', 'Sigma')]},
];

const IDS = /tier-s|tier-a|tier-b|uncategorized|image-overwatch|k3j9x0a1b|\b(items|row|item):\S/;

describe('drag announcements', () => {
  it('name rows and items like the page does', () => {
    expect(TIERS.map((_, index) => tierLabel(TIERS, index))).toEqual(['S', 'Tier 2', 'Tier 10', 'Unranked']);
    expect(TIERS.map((_, index) => tierPhrase(TIERS, index))).toEqual(['tier S', 'Tier 2', 'Tier 10', 'Unranked']);
    expect(itemLabel(TIERS[2].items[0])).toBe('Unnamed item');
    expect(itemLabel({content: 5 as unknown as string})).toBe('Unnamed item');
  });

  it('read an item drag from start to drop', () => {
    const from = {tierId: 'uncategorized', index: 0};
    expect(dragStartMessage(TIERS, {kind: 'item', from})).toBe('You have lifted an item: Sigma, in position 1 in Unranked.');
    expect(dragUpdateMessage(TIERS, {kind: 'item', from, to: {tierId: 'tier-s', index: 1}}))
      .toBe('You have moved Sigma from position 1 in Unranked to position 2 in tier S.');
    expect(dragUpdateMessage(TIERS, {kind: 'item', from: {tierId: 'tier-s', index: 0}, to: {tierId: 'tier-s', index: 1}}))
      .toBe('You have moved Mauga from position 1 to position 2 in tier S.');
    expect(dragUpdateMessage(TIERS, {kind: 'item', from, to: null})).toBe('You are currently not dragging over a droppable area.');
    expect(dragEndMessage(TIERS, {kind: 'item', from, to: {tierId: 'tier-a', index: 0}}, false))
      .toBe('You have dropped the item Sigma. It has moved from position 1 in Unranked to position 1 in Tier 2.');
    expect(dragEndMessage(TIERS, {kind: 'item', from, to: from}, false)).toBe('You have dropped the item Sigma. It stays in position 1 in Unranked.');
    expect(dragEndMessage(TIERS, {kind: 'item', from, to: null}, true)).toBe('Movement cancelled. Sigma has returned to position 1 in Unranked.');
    expect(dragEndMessage(TIERS, {kind: 'item', from, to: null}, false)).toBe('Sigma was dropped outside the tiers. It has returned to position 1 in Unranked.');
  });

  it('read a row drag by the labels of the positions (labels stay in place)', () => {
    expect(dragStartMessage(TIERS, {kind: 'row', from: 0})).toBe('You have lifted an item: the items of tier S, in row 1 of 4. The tier labels stay in place.');
    expect(dragUpdateMessage(TIERS, {kind: 'row', from: 0, to: 2})).toBe('You have moved the items of tier S to row 3, Tier 10.');
    expect(dragUpdateMessage(TIERS, {kind: 'row', from: 0, to: 0})).toBe('The items of tier S are back in their row.');
    expect(dragEndMessage(TIERS, {kind: 'row', from: 0, to: 1}, false)).toBe('You have dropped the item. The items of tier S are now in Tier 2.');
    expect(dragEndMessage(TIERS, {kind: 'row', from: 0, to: 0}, false)).toBe('You have dropped the item. The items of tier S stay in their row.');
    expect(dragEndMessage(TIERS, {kind: 'row', from: 0}, true)).toBe('Movement cancelled. The items of tier S are back in their row.');
  });

  it('never read an internal id', () => {
    const spots = TIERS.flatMap(tier => [0, 1, 2].map(index => ({tierId: tier.id, index})));
    const messages: string[] = [];
    for (const from of spots) {
      messages.push(dragStartMessage(TIERS, {kind: 'item', from}));
      for (const to of [...spots, null]) {
        messages.push(dragUpdateMessage(TIERS, {kind: 'item', from, to}), dragEndMessage(TIERS, {kind: 'item', from, to}, false));
      }
    }
    for (let from = 0; from < TIERS.length; from++) {
      for (let to = 0; to < TIERS.length; to++) {
        messages.push(dragStartMessage(TIERS, {kind: 'row', from}), dragUpdateMessage(TIERS, {kind: 'row', from, to}), dragEndMessage(TIERS, {kind: 'row', from, to}, false));
      }
    }
    for (const message of messages) expect(message).not.toMatch(IDS);
  });
});
