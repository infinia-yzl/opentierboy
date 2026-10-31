import {describe, expect, it} from 'vitest';
import {
  frameUnit,
  LAYOUT_CHOICE_NAMES,
  LAYOUT_CHOICES,
  layoutAddress,
  layoutChoiceId,
  parseLayoutParam,
  shownQueue,
  STAGE_SIZES,
  stageVariables,
} from '@/lib/zen/layouts';

/** Zen's creator layouts (lib/zen/layouts.ts, used by the Zen bar, ZenStage and the head script). */

/** The pixels of a stage variable when one frame pixel is `unit` CSS pixels. */
const pixels = (variable: string, unit: number) => {
  const match = variable.match(/^calc\(var\(--u\) \* (\d+(?:\.\d+)?)\)$/);
  if (!match) throw new Error(`Not a frame size: ${variable}`);
  return Number(match[1]) * unit;
};

describe('LAYOUT_CHOICES', () => {
  it('returns Editor, 16:9, 9:16 and the two overlays in the menu order when the names are read', () => {
    expect(Object.keys(LAYOUT_CHOICES).map(id => LAYOUT_CHOICE_NAMES[id]))
      .toEqual(['Editor', '16:9', '9:16', 'Overlay · green key', 'Overlay · transparent']);
  });

  it('returns each choice from its own id when layoutChoiceId reads it', () => {
    for (const [id, choice] of Object.entries(LAYOUT_CHOICES)) {
      expect(layoutChoiceId(choice), id).toBe(id);
    }
  });
});

describe('parseLayoutParam', () => {
  it('returns the layout and background when the value names a choice', () => {
    expect(parseLayoutParam('16x9')).toEqual({layout: 'wide', background: 'green'});
    expect(parseLayoutParam('9x16')).toEqual({layout: 'tall', background: 'green'});
    expect(parseLayoutParam('overlay-transparent')).toEqual({layout: 'overlay', background: 'transparent'});
  });

  it('returns null when the value is missing, empty, unknown or an object property name', () => {
    for (const value of [null, undefined, '', 'overlay', '16:9', 'constructor', '__proto__', 'toString']) {
      expect(parseLayoutParam(value), String(value)).toBeNull();
    }
  });
});

describe('layoutAddress', () => {
  it('returns the page address with the layout parameter after the state as it was written when the page has a list', () => {
    expect(layoutAddress('https://opentierboy.com', '/rank/overwatch/tank', '?state=3.N4Ig+x$-a', LAYOUT_CHOICES['overlay-transparent']))
      .toBe('https://opentierboy.com/rank/overwatch/tank?state=3.N4Ig+x$-a&layout=overlay-transparent');
  });

  it('returns one layout parameter in place of an earlier one when the address has one', () => {
    expect(layoutAddress('https://a.test', '/rank/x', '?layout=16x9&state=abc', LAYOUT_CHOICES['overlay-green']))
      .toBe('https://a.test/rank/x?state=abc&layout=overlay-green');
  });

  it('returns the path with the layout parameter alone when the page has no query', () => {
    expect(layoutAddress('https://a.test', '/rank/x', '', LAYOUT_CHOICES['9x16'])).toBe('https://a.test/rank/x?layout=9x16');
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
    expect([tall.tile, tall.letter, tall.hero, tall.heroName, tall.trayTile]).toEqual([120, 64, 380, 56, 160]);
  });

  it('returns the overlay board sizes when the overlay layout is read', () => {
    const overlay = STAGE_SIZES.overlay;
    expect(overlay.frame).toEqual({width: 1920, height: 1080});
    expect([overlay.panelWidth, overlay.panelPad, overlay.tile, overlay.letter, overlay.hero, overlay.queueTile])
      .toEqual([780, 24, 96, 48, 72, 72]);
  });
});

describe('frameUnit', () => {
  it('returns the smaller of the width and height ratios when the frame is 1920 x 1080', () => {
    expect(frameUnit({width: 1920, height: 1080})).toBe('min(calc(100vw / 1920), calc(100dvh / 1080))');
  });
});

describe('stageVariables', () => {
  it('returns every board size in frame pixels when the layout is 16:9 and a frame pixel is 1 CSS pixel', () => {
    const variables = stageVariables('wide');
    expect(variables['--u']).toBe(frameUnit(STAGE_SIZES.wide.frame));
    expect(pixels(variables['--stage-tile'], 1)).toBe(120);
    expect(pixels(variables['--stage-letter'], 1)).toBe(76);
    expect(pixels(variables['--stage-letter-column'], 1)).toBe(160);
    expect(pixels(variables['--stage-frame-width'], 1)).toBe(1920);
    expect(pixels(variables['--stage-frame-height'], 1)).toBe(1080);
  });

  it('returns sizes in proportion when a frame pixel is 0.75 CSS pixels', () => {
    const variables = stageVariables('tall');
    expect(pixels(variables['--stage-hero'], 0.75)).toBe(285);
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
