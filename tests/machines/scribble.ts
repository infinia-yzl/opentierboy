import {createMachine} from 'xstate';

export const scribbleMachine = createMachine({
  id: 'scribble',
  description: 'Scribble, the pen of Zen: the button “Scribble” and the key D turn the pen on and off, Escape turns the pen off before it exits Zen, and the pen draws notes. The notes live in the ink value of the address, beside the list: the notes that the model draws, removes and clears share one history entry, since the list does not change between them. With Zen off the notes still show, read only. Leaving Zen turns the pen off.',
  initial: 'blank',
  states: {
    blank: {
      description: 'No note was drawn, or every note was removed: the address has no ink value.',
      initial: 'zenOff',
      states: {
        zenOff: {
          description: 'Zen is off: no Zen bar, no ink layer and no ink value in the address.',
          on: {TOGGLE_ZEN: {target: 'penOff'}},
        },
        penOff: {
          description: 'Zen is on and the pen is off: the button “Scribble” is not pressed, the pen controls are absent, and there is no ink layer.',
          on: {
            PRESS_SCRIBBLE: {target: 'penOn'},
            PRESS_D: {target: 'penOn'},
            PRESS_ESCAPE: {target: 'zenOff'},
            EXIT_ZEN: {target: 'zenOff'},
          },
        },
        penOn: {
          description: 'The pen is on: the button “Scribble” is pressed, the toolbar “Scribble” is there, and the ink layer says “no notes”.',
          on: {
            PRESS_SCRIBBLE: {target: 'penOff'},
            PRESS_D: {target: 'penOff'},
            PRESS_ESCAPE: {target: 'penOff'},
            EXIT_ZEN: {target: 'zenOff'},
            DRAW_NOTE: {target: '#scribble.oneNote.penOn'},
          },
        },
      },
    },
    oneNote: {
      description: 'One note is on the list, and the address has an ink value.',
      initial: 'penOn',
      states: {
        zenOff: {
          description: 'Zen is off: the ink layer says “1 note”, read only, with no Zen bar and no pen controls.',
          on: {TOGGLE_ZEN: {target: 'penOff'}},
        },
        penOff: {
          description: 'Zen is on and the pen is off: the ink layer says “1 note”, and the pen controls are absent.',
          on: {
            PRESS_SCRIBBLE: {target: 'penOn'},
            PRESS_D: {target: 'penOn'},
            PRESS_ESCAPE: {target: 'zenOff'},
            EXIT_ZEN: {target: 'zenOff'},
          },
        },
        penOn: {
          description: 'The pen is on: the ink layer says “1 note”, and the toolbar “Scribble” is there.',
          on: {
            PRESS_SCRIBBLE: {target: 'penOff'},
            PRESS_D: {target: 'penOff'},
            PRESS_ESCAPE: {target: 'penOff'},
            EXIT_ZEN: {target: 'zenOff'},
            DRAW_NOTE: {target: '#scribble.twoNotes.penOn'},
            REMOVE_LAST_NOTE: {target: '#scribble.blank.penOn'},
            CLEAR: {target: '#scribble.blank.penOn'},
          },
        },
      },
    },
    twoNotes: {
      description: 'Two notes are on the list, the second far from the first.',
      initial: 'penOn',
      states: {
        zenOff: {
          description: 'Zen is off: the ink layer says “2 notes”, read only, with no Zen bar and no pen controls.',
          on: {TOGGLE_ZEN: {target: 'penOff'}},
        },
        penOff: {
          description: 'Zen is on and the pen is off: the ink layer says “2 notes”, and the pen controls are absent.',
          on: {
            PRESS_SCRIBBLE: {target: 'penOn'},
            PRESS_D: {target: 'penOn'},
            PRESS_ESCAPE: {target: 'zenOff'},
            EXIT_ZEN: {target: 'zenOff'},
          },
        },
        penOn: {
          description: 'The pen is on: the ink layer says “2 notes”, and the toolbar “Scribble” is there.',
          on: {
            PRESS_SCRIBBLE: {target: 'penOff'},
            PRESS_D: {target: 'penOff'},
            PRESS_ESCAPE: {target: 'penOff'},
            EXIT_ZEN: {target: 'zenOff'},
            REMOVE_LAST_NOTE: {target: '#scribble.oneNote.penOn'},
            CLEAR: {target: '#scribble.blank.penOn'},
          },
        },
      },
    },
  },
});
