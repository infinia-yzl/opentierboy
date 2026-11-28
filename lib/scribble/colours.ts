export const INK_COLOURS = ['red', 'blue', 'contrast'] as const;

export type InkColour = (typeof INK_COLOURS)[number];

export const DEFAULT_INK_COLOUR: InkColour = 'red';

export const INK_COLOUR_NAMES: Readonly<Record<InkColour, string>> = Object.freeze({
  red: 'Red',
  blue: 'Blue',
  contrast: 'Contrast',
});

export function isInkColour(value: unknown): value is InkColour {
  return INK_COLOURS.some((colour) => colour === value);
}
