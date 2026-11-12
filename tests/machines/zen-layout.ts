import {createMachine} from 'xstate';

export const zenLayoutMachine = createMachine({
  id: 'zenLayout',
  description: 'Zen on and off, and the layout chosen in the Zen bar’s Layout menu. The layout stays when Zen goes off and on again.',
  initial: 'off',
  states: {
    off: {
      on: {TOGGLE_ZEN: {target: 'on.lastLayout'}},
    },
    on: {
      initial: 'editor',
      states: {
        editor: {description: 'Layout: Editor'},
        wide: {description: 'Layout: 16:9'},
        tall: {description: 'Layout: 9:16'},
        overlay: {description: 'Layout: Overlay · green key'},
        lastLayout: {type: 'history', target: 'editor'},
      },
      on: {
        EXIT_ZEN: {target: 'off'},
        PRESS_ESCAPE: {target: 'off'},
        CHOOSE_EDITOR: {target: '.editor'},
        CHOOSE_WIDE: {target: '.wide'},
        CHOOSE_TALL: {target: '.tall'},
        CHOOSE_OVERLAY: {target: '.overlay'},
      },
    },
  },
});
