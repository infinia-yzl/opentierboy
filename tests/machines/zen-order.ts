import {createMachine} from 'xstate';

export const zenOrderMachine = createMachine({
  id: 'zenOrder',
  description: 'Zen on and off, the Zen bar’s Ranking order, and its “Hide the queue” box, which works only in In order and Shuffle. Both settings stay when Zen goes off and on again.',
  initial: 'off',
  states: {
    off: {
      on: {TOGGLE_ZEN: {target: 'on.lastSettings'}},
    },
    on: {
      type: 'parallel',
      on: {EXIT_ZEN: {target: 'off'}},
      states: {
        order: {
          initial: 'pickFreely',
          on: {
            CHOOSE_PICK_FREELY: {target: '.pickFreely'},
            CHOOSE_IN_ORDER: {target: '.upNext.inOrder'},
            CHOOSE_SHUFFLE: {target: '.upNext.shuffle'},
          },
          states: {
            pickFreely: {description: 'The whole Unranked tray, without a queue. The box is unavailable and keeps its value.'},
            upNext: {
              description: 'The Unranked tray shows the item up next, then the queue.',
              initial: 'inOrder',
              on: {
                HIDE_QUEUE: {target: '#zenOrder.on.queue.hidden'},
                SHOW_QUEUE: {target: '#zenOrder.on.queue.shown'},
              },
              states: {
                inOrder: {description: 'The tray’s own order.'},
                shuffle: {description: 'A random order, drawn again each time Shuffle is chosen.'},
              },
            },
          },
        },
        queue: {
          initial: 'shown',
          states: {
            shown: {},
            hidden: {description: '“Hide the queue” is on: only the item up next shows.'},
          },
        },
        lastSettings: {type: 'history', history: 'deep', target: ['order.pickFreely', 'queue.shown']},
      },
    },
  },
});
