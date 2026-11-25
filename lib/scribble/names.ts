import {rowPhrase, tierPhrase} from '@/lib/dnd/labels';
import {itemDisplayLabel} from '@/lib/images/listImages';
import type {Anchor} from '@/lib/scribble/anchors';
import type Tier from '@/models/Tier';

export function notesText(count: number): string {
  return count === 0 ? 'no notes' : count === 1 ? '1 note' : `${count} notes`;
}

export function anchorPhrase(anchor: Anchor, tiers: readonly Tier[]): string {
  if (anchor.kind === 'frame') return 'on the frame';
  if (anchor.kind === 'tray') return `on ${tierPhrase(tiers, tiers.length - 1)}`;
  if (anchor.kind === 'row') return `on ${rowPhrase(tiers[anchor.index]?.name, anchor.index)}`;
  const item = tiers.flatMap((tier) => tier.items).find((candidate) => candidate.id === anchor.id);
  return `on ${(item && itemDisplayLabel(item)) || 'an item'}`;
}
