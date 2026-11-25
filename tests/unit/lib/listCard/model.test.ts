import {describe, expect, it} from 'vitest';
import {fitListCard} from '@/lib/listCard/fit';
import {
  listCardData,
  listSetName,
  PICTURE_FRAMES,
  pictureFrameFitInput,
  pictureFrameParts,
  type PictureFrameName,
} from '@/lib/listCard/model';
import type Tier from '@/models/Tier';
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

const FRAME_NAMES: PictureFrameName[] = ['landscape', 'square', 'portrait'];
const tierOf = (index: number, count: number): Tier => ({
  id: `t${index}`,
  name: String.fromCharCode(65 + index),
  items: Array.from({length: count}, (_, item) => ({id: `image-overwatch-${index}-${item}.webp`, content: `Item ${item}`})),
});
const tiersOf = (counts: number[]) => counts.map((count, index) => tierOf(index, count));
const cardOf = (counts: number[], frame?: PictureFrameName) => listCardData({
  title: 'Tank tier list',
  setName: 'OVERWATCH',
  rows: tiersOf(counts),
  height: 'auto',
  frame,
  background: () => 'none',
  rowName: (row) => row.name,
  tile: (item) => ({key: item.id, label: String(item.content)}),
});

describe('PICTURE_FRAMES', () => {
  it('returns the sizes of the canvas boards when read: landscape 1200×675, square 1080×1080, portrait 1080×1350', () => {
    expect(FRAME_NAMES.map((name) => [PICTURE_FRAMES[name].width, PICTURE_FRAMES[name].height]))
      .toEqual([[1200, 675], [1080, 1080], [1080, 1350]]);
  });
});

describe('pictureFrameParts', () => {
  it('returns parts that leave room for the rows when the frame is any picture frame', () => {
    for (const name of FRAME_NAMES) {
      const frame = PICTURE_FRAMES[name];
      const parts = pictureFrameParts(frame);
      expect(parts.contentWidth).toBe(frame.width - frame.padding * 2 - frame.labelWidth);
      expect(parts.footer).toBeGreaterThanOrEqual(frame.logoHeight);
      expect(parts.header).toBeGreaterThan(parts.titleLine);
    }
  });
});

describe('listCardData with a picture frame', () => {
  it('returns the frame size and the board tile size when a 5-row list fits the frame', () => {
    for (const name of FRAME_NAMES) {
      const card = cardOf([4, 2, 1, 0, 0], name);
      expect(card).toMatchObject({width: PICTURE_FRAMES[name].width, height: PICTURE_FRAMES[name].height, frame: name, extraRows: 0});
      expect(card.tile).toBe(PICTURE_FRAMES[name].tileMax);
      expect(card.rows.map((row) => row.tiles.length)).toEqual([4, 2, 1, 0, 0]);
    }
  });

  it('returns rows that fit inside the frame when the list has 3 to 40 rows of up to 60 items', () => {
    for (const name of FRAME_NAMES) {
      for (const counts of [[60, 60, 60], Array.from({length: 12}, () => 9), Array.from({length: 40}, () => 2)]) {
        const input = pictureFrameFitInput(tiersOf(counts), name);
        const fit = fitListCard(input);
        const rowsHeight = fit.rows.reduce((sum, row) => sum + row.lines * fit.tile + 1, 0) + (fit.extraRows > 0 ? PICTURE_FRAMES[name].extraBarHeight : 0);
        expect(input.headerHeight + rowsHeight + input.padding.bottom).toBeLessThanOrEqual(PICTURE_FRAMES[name].height);
        expect(fit.tile).toBeGreaterThanOrEqual(PICTURE_FRAMES[name].tileMin);
      }
    }
  });

  it('returns a "+N more rows" count when 40 rows do not fit the landscape frame', () => {
    const card = cardOf(Array.from({length: 40}, () => 2), 'landscape');
    expect(card.extraRows).toBeGreaterThan(0);
    expect(card.rows.length + card.extraRows).toBe(40);
  });

  it('returns the 1200 px card that grows with the list and no frame when no frame is given', () => {
    const card = cardOf([4, 2, 1]);
    expect(card.width).toBe(1200);
    expect(card.frame).toBeUndefined();
  });
});
