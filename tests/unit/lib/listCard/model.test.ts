import {describe, expect, it} from 'vitest';
import {listSetName} from '@/lib/listCard/model';
import type ImageSetConfig from '@/models/ImageSet';

describe('listSetName', () => {
  const config = {packages: {
    'image-overwatch': {displayName: 'OVERWATCH', images: [], tags: {}},
    'image-overwatch-extra': {displayName: 'EXTRA', images: [], tags: {}},
  }} as ImageSetConfig;
  const row = (...ids: string[]) => ({items: ids.map((id) => ({id, content: id}))});

  it('names the set that most items come from', () => {
    expect(listSetName(config, [row('image-overwatch-ana.webp', 'image-overwatch-mau.webp'), row('custom-1')])).toBe('OVERWATCH');
  });

  it('matches the longest package name', () => {
    expect(listSetName(config, [row('image-overwatch-extra-a.webp', 'image-overwatch-extra-b.webp')])).toBe('EXTRA');
  });

  it('names no set for a mixed list or a list without image-set items', () => {
    expect(listSetName(config, [row('image-overwatch-ana.webp', 'custom-1', 'custom-2')])).toBeNull();
    expect(listSetName(config, [row('custom-1')])).toBeNull();
    expect(listSetName(config, [])).toBeNull();
  });
});
