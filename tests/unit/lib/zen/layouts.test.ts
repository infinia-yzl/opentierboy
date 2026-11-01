import {describe, expect, it} from 'vitest';
import {
  frameUnit,
  shownQueue,
  STAGE_SIZES,
  stageVariables,
  ZEN_LAYOUT_NAMES,
  ZEN_LAYOUTS,
} from '@/lib/zen/layouts';

/** Zen's creator layouts (lib/zen/layouts.ts, used by the Zen bar and ZenStage). */

/** The pixels of a stage variable when one frame pixel is `unit` CSS pixels. */
const pixels = (variable: string, unit: number) => {
  const match = variable.match(/^calc\(var\(--u\) \* (\d+(?:\.\d+)?)\)$/);
  if (!match) throw new Error(`Not a frame size: ${variable}`);
  return Number(match[1]) * unit;
};

describe('ZEN_LAYOUTS', () => {
  it('returns Editor, 16:9, 9:16 and Overlay · green key in the menu order when the names are read (2026-11-01)', () => {
    expect(ZEN_LAYOUTS.map(layout => ZEN_LAYOUT_NAMES[layout])).toEqual(['Editor', '16:9', '9:16', 'Overlay · green key']);
  });
});

describe('STAGE_SIZES', () => {
  it('returns the 16:9 board sizes when the wide layout is read', () => {
    const wide = STAGE_SIZES.wide;
    expect(wide.frame).toEqual({width: 1920, height: 1080});
    expect([wide.tile, wide.letter, wide.letterColumn, wide.hero, wide.title, wide.wordmark]).toEqual([120, 76, 160, 136, 68, 56]);
  });

  it('returns the 9:16 board sizes when the tall layout is read', () => {
    const tall = STAGE_SIZES.tall;
    expect(tall.frame).toEqual({width: 1080, height: 1920});
    expect([tall.tile, tall.letter, tall.hero, tall.heroName, tall.trayTile]).toEqual([120, 64, 180, 28, 160]);
  });

  it('returns the overlay board sizes when the overlay layout is read', () => {
    const overlay = STAGE_SIZES.overlay;
    expect(overlay.frame).toEqual({width: 1920, height: 1080});
    expect([overlay.panelWidth, overlay.panelPad, overlay.tile, overlay.letter, overlay.hero, overlay.queueTile])
      .toEqual([780, 24, 96, 48, 72, 72]);
  });
});

describe('STAGE_SIZES for the Zen bar and the rows', () => {
  it('returns a strip taller than the Zen bar when any layout is read', () => {
    for (const layout of ['wide', 'tall', 'overlay'] as const) {
      expect(STAGE_SIZES[layout].strip, layout).toBeGreaterThan(STAGE_SIZES[layout].bar);
    }
  });

  it('returns a row handle half a tile wide when any layout is read', () => {
    for (const layout of ['wide', 'tall', 'overlay'] as const) {
      expect(STAGE_SIZES[layout].handle * 2, layout).toBe(STAGE_SIZES[layout].tile);
    }
  });
});

describe('frameUnit', () => {
  it('returns the smaller of the width and height ratios of the container when the frame is 1920 x 1080 under an 88 px strip', () => {
    expect(frameUnit({frame: {width: 1920, height: 1080}, strip: 88})).toBe('min(calc(100cqw / 1920), calc(100cqh / 1168))');
  });
});

describe('stageVariables', () => {
  it('returns every board size in frame pixels when the layout is 16:9 and a frame pixel is 1 CSS pixel', () => {
    const variables = stageVariables('wide');
    expect(variables['--u']).toBe(frameUnit(STAGE_SIZES.wide));
    expect(pixels(variables['--stage-tile'], 1)).toBe(120);
    expect(pixels(variables['--stage-letter'], 1)).toBe(76);
    expect(pixels(variables['--stage-letter-column'], 1)).toBe(160);
    expect(pixels(variables['--stage-frame-width'], 1)).toBe(1920);
    expect(pixels(variables['--stage-frame-height'], 1)).toBe(1080);
  });

  it('returns sizes in proportion when a frame pixel is 0.75 CSS pixels', () => {
    const variables = stageVariables('tall');
    expect(pixels(variables['--stage-hero'], 0.75)).toBe(135);
    expect(pixels(variables['--stage-frame-height'], 0.75)).toBe(1440);
  });

  it('returns no variable for the queue limit, which is a count, when any layout is read', () => {
    for (const layout of ['wide', 'tall', 'overlay'] as const) {
      expect(Object.keys(stageVariables(layout))).not.toContain('--stage-queue-limit');
    }
  });
});

describe('shownQueue', () => {
  const queue = Array.from({length: 20}, (_, index) => `item ${index}`);

  it('returns the whole queue when the layout is the editor', () => {
    expect(shownQueue(queue, 'editor')).toEqual(queue);
  });

  it('returns one line of the queue when the layout is a frame', () => {
    expect(shownQueue(queue, 'wide')).toHaveLength(12);
    expect(shownQueue(queue, 'tall')).toHaveLength(8);
    expect(shownQueue(queue, 'overlay')).toEqual(['item 0', 'item 1']);
  });
});
