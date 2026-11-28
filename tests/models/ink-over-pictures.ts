import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {inkOverPicturesMachine} from '../machines/ink-over-pictures';
import {defineModel, offered} from '../support/machines';

export type InkOverPicturesSnapshot = SnapshotFrom<typeof inkOverPicturesMachine>;
export type InkOverPicturesEvent = EventFrom<typeof inkOverPicturesMachine>;
export type InkKey = 'red' | 'blue' | 'contrast';
export type PictureLook = 'reversed with a red hue' | 'reversed with a blue hue' | 'the plain negative';

const STROKES = {clean: 0, crossed: 1} as const;
type Value = Partial<Record<keyof typeof STROKES, InkKey>>;

export const INK_NAMES = {red: 'Red', blue: 'Blue', contrast: 'Contrast'} as const;

export const PICTURE_LOOKS: Readonly<Record<InkKey, PictureLook>> = {
  red: 'reversed with a red hue',
  blue: 'reversed with a blue hue',
  contrast: 'the plain negative',
};

export function strokesIn(snapshot: InkOverPicturesSnapshot): number {
  const [ink] = Object.keys(snapshot.value as Value) as (keyof typeof STROKES)[];
  return STROKES[ink];
}

export function inkOf(snapshot: InkOverPicturesSnapshot): InkKey {
  const [ink] = Object.values(snapshot.value as Value);
  return ink;
}

const constant = fc.constant({});

export const inkOverPicturesModel = defineModel({
  id: 'ink-over-pictures',
  machine: inkOverPicturesMachine,
  events: {
    CHOOSE_RED: {generate: constant, when: offered('CHOOSE_RED')},
    CHOOSE_BLUE: {generate: constant, when: offered('CHOOSE_BLUE')},
    CHOOSE_CONTRAST: {generate: constant, when: offered('CHOOSE_CONTRAST')},
    DRAW_ACROSS: {generate: constant, when: offered('DRAW_ACROSS')},
    REMOVE_LAST_NOTE: {generate: constant, when: offered('REMOVE_LAST_NOTE')},
    CLEAR: {generate: constant, when: offered('CLEAR')},
  },
});
