import {createMachine} from 'xstate';

export const appearanceMachine = createMachine({
  id: 'appearance',
  description: 'The Appearance menu’s Mode, Game colours and Font, and the Row options menu’s Tile Size with Show Labels, on an OVERWATCH list. Each setting changes on its own, except that choosing Compact turns Show Labels off. Every setting stays after a reload and after a visit to About and Back.',
  type: 'parallel',
  states: {
    mode: {
      initial: 'system',
      on: {
        CHOOSE_LIGHT: {target: '.light'},
        CHOOSE_DARK: {target: '.dark'},
        CHOOSE_SYSTEM: {target: '.system'},
        RELOAD: {target: '.lastMode', reenter: true},
        VISIT_ABOUT_AND_GO_BACK: {target: '.lastMode', reenter: true},
      },
      states: {
        light: {description: 'Light: a white page.'},
        dark: {description: 'Dark: a near-black page.'},
        system: {description: 'System: the device’s colour scheme, light in the tests.'},
        lastMode: {type: 'history', target: 'system'},
      },
    },
    font: {
      initial: 'modern',
      on: {
        CHOOSE_MODERN: {target: '.modern'},
        CHOOSE_CLASSIC: {target: '.classic'},
        RELOAD: {target: '.lastFont', reenter: true},
        VISIT_ABOUT_AND_GO_BACK: {target: '.lastFont', reenter: true},
      },
      states: {
        modern: {description: 'The page is in Geologica.'},
        classic: {description: 'The page is in Nunito Sans.'},
        lastFont: {type: 'history', target: 'modern'},
      },
    },
    gameColours: {
      initial: 'on',
      on: {
        RELOAD: {target: '.lastGameColours', reenter: true},
        VISIT_ABOUT_AND_GO_BACK: {target: '.lastGameColours', reenter: true},
      },
      states: {
        on: {
          description: 'The Share button is in OVERWATCH orange.',
          on: {TURN_OFF_GAME_COLOURS: {target: 'off'}},
        },
        off: {
          description: 'The Share button is in brand blue.',
          on: {TURN_ON_GAME_COLOURS: {target: 'on'}},
        },
        lastGameColours: {type: 'history', target: 'on'},
      },
    },
    tiles: {
      description: 'The tile size is kept in this browser. Show Labels is part of the list’s link.',
      initial: 'comfortableWithLabels',
      on: {
        RELOAD: {target: '.lastTiles', reenter: true},
        VISIT_ABOUT_AND_GO_BACK: {target: '.lastTiles', reenter: true},
      },
      states: {
        comfortableWithLabels: {
          description: '80 px tiles, each with its name on it.',
          on: {
            HIDE_LABELS: {target: 'comfortableWithoutLabels'},
            CHOOSE_COMPACT: {target: 'compactWithoutLabels'},
          },
        },
        comfortableWithoutLabels: {
          description: '80 px tiles, without names.',
          on: {
            SHOW_LABELS: {target: 'comfortableWithLabels'},
            CHOOSE_COMPACT: {target: 'compactWithoutLabels'},
          },
        },
        compactWithoutLabels: {
          description: '48 px tiles, without names.',
          on: {
            SHOW_LABELS: {target: 'compactWithLabels'},
            CHOOSE_COMFORTABLE: {target: 'comfortableWithoutLabels'},
          },
        },
        compactWithLabels: {
          description: '48 px tiles, each with its name under it.',
          on: {
            HIDE_LABELS: {target: 'compactWithoutLabels'},
            CHOOSE_COMFORTABLE: {target: 'comfortableWithLabels'},
          },
        },
        lastTiles: {type: 'history', target: 'comfortableWithLabels'},
      },
    },
  },
});
