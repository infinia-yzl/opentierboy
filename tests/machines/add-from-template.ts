import {createMachine} from 'xstate';

export const addFromTemplateMachine = createMachine({
  id: 'addFromTemplate',
  description: 'Adding images from a template to an empty list: the template picker, opened from Add images › From template or from the empty list’s Template, and OVERWATCH’s Tank (13) and Support (11) sets. Choosing a set closes the picker, adds to Unranked the images the list does not hold yet, and shows the toast “Items Added”, whose Undo removes only what that add added. The picker keeps its page when it closes, so after OVERWATCH’s page it opens there again. The model clicks Undo, or waits for the toast to end by itself, before it does anything else.',
  initial: 'empty',
  states: {
    empty: {
      description: 'Unranked is empty, and its drop area offers Template, Upload and Link.',
      initial: 'closed',
      states: {
        closed: {
          on: {
            OPEN_FROM_MENU: {target: 'picker.lastPage'},
            OPEN_FROM_DROP_AREA: {target: 'picker.lastPage'},
          },
        },
        picker: {
          initial: 'packages',
          on: {PRESS_ESCAPE: {target: 'closed'}},
          states: {
            packages: {
              description: 'The picker lists the packages: OVERWATCH and THE FINALS.',
              on: {OPEN_OVERWATCH: {target: 'overwatch'}},
            },
            overwatch: {
              description: 'The picker lists OVERWATCH’s sets.',
              on: {
                CHOOSE_TANK: {target: '#addFromTemplate.tank.tankAdded'},
                CHOOSE_SUPPORT: {target: '#addFromTemplate.support.supportAdded'},
              },
            },
            lastPage: {type: 'history', target: 'packages'},
          },
        },
      },
    },
    tank: {
      description: 'Unranked holds the 13 tanks.',
      initial: 'closed',
      states: {
        closed: {on: {OPEN_FROM_MENU: {target: 'picker'}}},
        picker: {
          description: 'The picker lists OVERWATCH’s sets, the page it was on.',
          on: {
            PRESS_ESCAPE: {target: 'closed'},
            CHOOSE_TANK: {target: 'nothingAdded'},
            CHOOSE_SUPPORT: {target: '#addFromTemplate.both.supportAdded'},
          },
        },
        tankAdded: {
          description: 'The toast shows. Its Undo removes the tanks.',
          on: {UNDO: {target: '#addFromTemplate.empty'}, TOAST_TIMES_OUT: {target: 'closed'}},
        },
        nothingAdded: {
          description: 'The list held every tank already. The toast says so, without Undo.',
          on: {TOAST_TIMES_OUT: {target: 'closed'}},
        },
      },
    },
    support: {
      description: 'Unranked holds the 11 supports.',
      initial: 'closed',
      states: {
        closed: {on: {OPEN_FROM_MENU: {target: 'picker'}}},
        picker: {
          description: 'The picker lists OVERWATCH’s sets, the page it was on.',
          on: {
            PRESS_ESCAPE: {target: 'closed'},
            CHOOSE_TANK: {target: '#addFromTemplate.both.tankAdded'},
            CHOOSE_SUPPORT: {target: 'nothingAdded'},
          },
        },
        supportAdded: {
          description: 'The toast shows. Its Undo removes the supports.',
          on: {UNDO: {target: '#addFromTemplate.empty'}, TOAST_TIMES_OUT: {target: 'closed'}},
        },
        nothingAdded: {
          description: 'The list held every support already. The toast says so, without Undo.',
          on: {TOAST_TIMES_OUT: {target: 'closed'}},
        },
      },
    },
    both: {
      description: 'Unranked holds the 13 tanks and the 11 supports, each once.',
      initial: 'closed',
      states: {
        closed: {on: {OPEN_FROM_MENU: {target: 'picker'}}},
        picker: {
          description: 'The picker lists OVERWATCH’s sets, the page it was on.',
          on: {
            PRESS_ESCAPE: {target: 'closed'},
            CHOOSE_TANK: {target: 'nothingAdded'},
            CHOOSE_SUPPORT: {target: 'nothingAdded'},
          },
        },
        tankAdded: {
          description: 'The toast shows. Its Undo removes the tanks and keeps the supports.',
          on: {UNDO: {target: '#addFromTemplate.support.closed'}, TOAST_TIMES_OUT: {target: 'closed'}},
        },
        supportAdded: {
          description: 'The toast shows. Its Undo removes the supports and keeps the tanks.',
          on: {UNDO: {target: '#addFromTemplate.tank.closed'}, TOAST_TIMES_OUT: {target: 'closed'}},
        },
        nothingAdded: {
          description: 'The list held every image of the set already. The toast says so, without Undo.',
          on: {TOAST_TIMES_OUT: {target: 'closed'}},
        },
      },
    },
  },
});
