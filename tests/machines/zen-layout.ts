import {createMachine} from 'xstate';

export const zenLayoutMachine = createMachine({
  id: 'zenLayout',
  description: 'Zen on and off, the layout chosen in the Zen bar’s Layout menu, and Back and Forward over one change to the list. The layout is a view setting: it writes no link and no history entry, and it stays when Zen goes off and on again and over Back and Forward.',
  type: 'parallel',
  states: {
    zen: {
      description: 'Zen and its layout. 16:9 and 9:16 draw the list in a frame of that shape, and Overlay · green key draws it in a 16:9 frame over the green key. The editor’s layout has no frame.',
      initial: 'off',
      states: {
        off: {
          description: 'Zen is off: the editor, with no Zen bar and no frame.',
          on: {TOGGLE_ZEN: {target: 'on.lastLayout'}},
        },
        on: {
          description: 'Zen is on: the Zen bar shows the layout in its Layout button.',
          initial: 'editor',
          states: {
            editor: {description: 'Layout: Editor. No frame.'},
            wide: {description: 'Layout: 16:9. The frame “Frame 16:9”, wider than it is tall.'},
            tall: {description: 'Layout: 9:16. The frame “Frame 9:16”, taller than it is wide.'},
            overlay: {description: 'Layout: Overlay · green key. The frame “Frame 16:9” over the green key.'},
            lastLayout: {type: 'history', target: 'editor'},
          },
          on: {
            EXIT_ZEN: {target: 'off'},
            PRESS_ESCAPE: {target: 'off'},
            CHOOSE_EDITOR: {target: '.editor'},
            CHOOSE_WIDE: {target: '.wide'},
            CHOOSE_TALL: {target: '.tall'},
            CHOOSE_OVERLAY: {target: '.overlay'},
            BROWSER_BACK: {description: 'Back keeps Zen and the layout; only the list changes.'},
            BROWSER_FORWARD: {description: 'Forward keeps Zen and the layout; only the list changes.'},
          },
        },
      },
    },
    list: {
      description: 'The version of the list on screen and in the address. The model makes one change, out of Zen. Back from the list as opened would leave the editor, so the model does not take it.',
      initial: 'opened',
      states: {
        opened: {
          description: 'The list as opened, the only version.',
          on: {CHANGE_LIST: {target: 'changed'}},
        },
        changed: {
          description: 'One item ranked into row A: the latest version. Forward changes nothing.',
          on: {BROWSER_BACK: {target: 'back'}},
        },
        back: {
          description: 'Back from the change: the list as opened, with the change one Forward away.',
          on: {BROWSER_FORWARD: {target: 'changed'}},
        },
      },
    },
  },
});
