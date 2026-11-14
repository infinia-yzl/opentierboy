import {createMachine} from 'xstate';

export const zenOrderMachine = createMachine({
  id: 'zenOrder',
  description: 'Zen on and off, the Zen bar’s Ranking order, and its “Hide the queue” box, which works only in In order and Shuffle. Both are view settings: they write no link and no history entry, and they stay when Zen goes off and on again.',
  initial: 'off',
  states: {
    off: {
      description: 'Zen is off: the editor’s Unranked tray, whatever the settings.',
      on: {TOGGLE_ZEN: {target: 'on.lastSettings'}},
    },
    on: {
      description: 'Zen is on: the Zen bar shows the ranking order in its Ranking order button.',
      type: 'parallel',
      on: {EXIT_ZEN: {target: 'off'}},
      states: {
        order: {
          description: 'Ranking order, a menu of the Zen bar.',
          initial: 'pickFreely',
          on: {
            CHOOSE_PICK_FREELY: {target: '.pickFreely'},
            CHOOSE_IN_ORDER: {target: '.upNext.inOrder'},
            CHOOSE_SHUFFLE: {target: '.upNext.shuffle'},
          },
          states: {
            pickFreely: {description: 'The whole Unranked tray, without a queue. The box is unavailable and keeps its value: pressing it changes nothing.'},
            upNext: {
              description: 'The Unranked tray shows the item up next, then the queue.',
              initial: 'inOrder',
              on: {
                HIDE_QUEUE: {target: '#zenOrder.on.queue.hidden'},
                SHOW_QUEUE: {target: '#zenOrder.on.queue.shown'},
              },
              states: {
                inOrder: {description: 'The tray’s own order.'},
                shuffle: {description: 'A random order, drawn again each time Shuffle is chosen and each time Zen turns on in Shuffle.'},
              },
            },
          },
        },
        queue: {
          description: 'The box “Hide the queue” in the Ranking order menu.',
          initial: 'shown',
          states: {
            shown: {description: '“Hide the queue” is off: the queue shows after the item up next.'},
            hidden: {description: '“Hide the queue” is on: only the item up next shows.'},
          },
        },
        lastSettings: {type: 'history', history: 'deep', target: ['order.pickFreely', 'queue.shown']},
      },
    },
  },
});
