import {createMachine} from 'xstate';

export const inkOverPicturesMachine = createMachine({
  id: 'ink-over-pictures',
  description: 'Ink over pictures, with Zen and the pen on: where a stroke crosses the picture of an item the ink is negative ink, and where it crosses a row the ink is solid. The model chooses each ink colour, draws one stroke across a picture and on into its row, and takes the stroke away again.',
  initial: 'clean',
  states: {
    clean: {
      description: 'No note is on the list: the picture shows as it loaded, and the row is as it was.',
      initial: 'red',
      states: {
        red: {
          description: 'The ink colour is Red.',
          on: {
            CHOOSE_BLUE: {target: 'blue'},
            CHOOSE_CONTRAST: {target: 'contrast'},
            DRAW_ACROSS: {target: '#ink-over-pictures.crossed.red'},
          },
        },
        blue: {
          description: 'The ink colour is Blue.',
          on: {
            CHOOSE_RED: {target: 'red'},
            CHOOSE_CONTRAST: {target: 'contrast'},
            DRAW_ACROSS: {target: '#ink-over-pictures.crossed.blue'},
          },
        },
        contrast: {
          description: 'The ink colour is Contrast.',
          on: {
            CHOOSE_RED: {target: 'red'},
            CHOOSE_BLUE: {target: 'blue'},
            DRAW_ACROSS: {target: '#ink-over-pictures.crossed.contrast'},
          },
        },
      },
    },
    crossed: {
      description: 'One stroke crosses the picture and runs on into the row: the list has one note.',
      initial: 'red',
      states: {
        red: {
          description: 'Under the stroke the picture has its brightness reversed and a red hue, and on the row the ink is solid red.',
          on: {
            REMOVE_LAST_NOTE: {target: '#ink-over-pictures.clean.red'},
            CLEAR: {target: '#ink-over-pictures.clean.red'},
          },
        },
        blue: {
          description: 'Under the stroke the picture has its brightness reversed and a blue hue, and on the row the ink is solid blue.',
          on: {
            REMOVE_LAST_NOTE: {target: '#ink-over-pictures.clean.blue'},
            CLEAR: {target: '#ink-over-pictures.clean.blue'},
          },
        },
        contrast: {
          description: 'Under the stroke the picture shows as its plain negative, and on the row the ink is solid in the Contrast colour.',
          on: {
            REMOVE_LAST_NOTE: {target: '#ink-over-pictures.clean.contrast'},
            CLEAR: {target: '#ink-over-pictures.clean.contrast'},
          },
        },
      },
    },
  },
});
