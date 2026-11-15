import * as fc from 'fast-check';
import type {EventFrom, SnapshotFrom} from 'xstate';
import {appearanceMachine} from '../machines/appearance';
import {defineModel, offered} from '../support/machines';

export type AppearanceSnapshot = SnapshotFrom<typeof appearanceMachine>;
export type AppearanceEvent = EventFrom<typeof appearanceMachine>;

export type AppearanceMode = 'light' | 'dark' | 'system';
export type AppearanceFont = 'modern' | 'classic';
export type AppearanceTileSize = 'comfortable' | 'compact';

export interface AppearanceView {
  readonly mode: AppearanceMode;
  readonly font: AppearanceFont;
  readonly gameColours: boolean;
  readonly tileSize: AppearanceTileSize;
  readonly labelsShown: boolean;
}

type AppearanceValue = {
  mode: AppearanceMode;
  font: AppearanceFont;
  gameColours: 'on' | 'off';
  tiles: 'comfortableWithLabels' | 'comfortableWithoutLabels' | 'compactWithoutLabels' | 'compactWithLabels';
};

export function appearanceViewOf(snapshot: AppearanceSnapshot): AppearanceView {
  const value = snapshot.value as AppearanceValue;
  return {
    mode: value.mode,
    font: value.font,
    gameColours: value.gameColours === 'on',
    tileSize: value.tiles.startsWith('compact') ? 'compact' : 'comfortable',
    labelsShown: value.tiles.endsWith('WithLabels'),
  };
}

export const STORED_THEME: Readonly<Record<AppearanceMode, readonly (string | null)[]>> = {
  light: ['light'],
  dark: ['dark'],
  system: [null, 'system'],
};

const constant = fc.constant({});

export const appearanceModel = defineModel({
  id: 'appearance',
  machine: appearanceMachine,
  events: {
    CHOOSE_LIGHT: {generate: constant, when: offered('CHOOSE_LIGHT')},
    CHOOSE_DARK: {generate: constant, when: offered('CHOOSE_DARK')},
    CHOOSE_SYSTEM: {generate: constant, when: offered('CHOOSE_SYSTEM')},
    CHOOSE_MODERN: {generate: constant, when: offered('CHOOSE_MODERN')},
    CHOOSE_CLASSIC: {generate: constant, when: offered('CHOOSE_CLASSIC')},
    TURN_OFF_GAME_COLOURS: {generate: constant, when: offered('TURN_OFF_GAME_COLOURS')},
    TURN_ON_GAME_COLOURS: {generate: constant, when: offered('TURN_ON_GAME_COLOURS')},
    CHOOSE_COMPACT: {generate: constant, when: offered('CHOOSE_COMPACT')},
    CHOOSE_COMFORTABLE: {generate: constant, when: offered('CHOOSE_COMFORTABLE')},
    SHOW_LABELS: {generate: constant, when: offered('SHOW_LABELS')},
    HIDE_LABELS: {generate: constant, when: offered('HIDE_LABELS')},
    RELOAD: {generate: constant, when: offered('RELOAD')},
    VISIT_ABOUT_AND_GO_BACK: {generate: constant, when: offered('VISIT_ABOUT_AND_GO_BACK')},
  },
});
