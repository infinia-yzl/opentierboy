import {describe, expect, it} from 'vitest';
import imagesetConfig from '@/imageset.config.json';
import ImageSetConfig from '@/models/ImageSet';

// Guard test. Tiles render landscape and portrait shapes since revamp Phase 5e, but link
// previews (app/api/og) still draw every image as a square and crop it. Remove this block when
// the owner lets image sets publish other shapes (docs/maintainers/repository-settings.md).
describe('imageset.config.json while link previews draw squares', () => {
  // Image sets must not publish other shapes until then (docs/maintainers/repository-settings.md).
  it('returns no shaped image or category when imageset.config.json is read', () => {
    const packages = (imagesetConfig as ImageSetConfig).packages;
    const shaped = Object.entries(packages).flatMap(([name, set]) => [
      ...set.images.filter((image) => image.shape !== undefined).map((image) => `${name}-${image.filename}: ${image.shape}`),
      ...Object.entries(set.tags).filter(([, tag]) => tag.shape !== undefined).map(([tag, data]) => `${name} tag ${tag}: ${data.shape}`),
    ]);
    expect(shaped).toEqual([]);
  });
});
