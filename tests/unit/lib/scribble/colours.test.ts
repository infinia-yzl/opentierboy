import {describe, expect, it} from 'vitest';
import {DEFAULT_INK_COLOUR, INK_COLOUR_NAMES, INK_COLOURS, isInkColour} from '@/lib/scribble/colours';

describe('INK_COLOURS', () => {
  it('returns Red, Blue and Contrast in the menu order when the names are read', () => {
    expect(INK_COLOURS.map((colour) => INK_COLOUR_NAMES[colour])).toEqual(['Red', 'Blue', 'Contrast']);
  });

  it('returns red when the default colour is read', () => {
    expect(DEFAULT_INK_COLOUR).toBe('red');
  });
});

describe('isInkColour', () => {
  it.each(INK_COLOURS)('returns true when the value is %s', (colour) => {
    expect(isInkColour(colour)).toBe(true);
  });

  it.each(['green', '', null, 3])('returns false when the value is %j', (value) => {
    expect(isInkColour(value)).toBe(false);
  });
});
