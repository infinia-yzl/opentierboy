import {describe, expect, it} from 'vitest';
import {listSetName} from '@/lib/listCard/model';
import type ImageSetConfig from '@/models/ImageSet';

describe('listSetName', () => {
  const config = {packages: {
    'image-overwatch': {displayName: 'OVERWATCH', images: [], tags: {}},
    'image-overwatch-extra': {displayName: 'EXTRA', images: [], tags: {}},
  }} as ImageSetConfig;
  const row = (...ids: string[]) => ({items: ids.map((id) => ({id, content: id}))});

  it('returns the display name of a set when most items come from it', () => {
    expect(listSetName(config, [row('image-overwatch-ana.webp', 'image-overwatch-mau.webp'), row('custom-1')])).toBe('OVERWATCH');
  });

  it('returns the set with the longest matching package name when package names share a prefix', () => {
    expect(listSetName(config, [row('image-overwatch-extra-a.webp', 'image-overwatch-extra-b.webp')])).toBe('EXTRA');
  });

  it('returns null when no set has most items or the list has no image-set items', () => {
    expect(listSetName(config, [row('image-overwatch-ana.webp', 'custom-1', 'custom-2')])).toBeNull();
    expect(listSetName(config, [row('custom-1')])).toBeNull();
    expect(listSetName(config, [])).toBeNull();
  });
});
