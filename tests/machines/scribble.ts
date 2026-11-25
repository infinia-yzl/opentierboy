import {createMachine} from 'xstate';

export const scribbleMachine = createMachine({
  id: 'scribble',
  description: 'Scribble, the pen of Zen: the button “Scribble” and the key D turn the pen on and off, Escape turns the pen off before it exits Zen, and the pen draws notes. Ink is view state: it writes no link and no history entry, it hides when Zen goes off, and it is there again when Zen comes back. Leaving Zen turns the pen off.',
  initial: 'blank',
  states: {
    blank: {
      description: 'No note was drawn, or every note was removed.',
      initial: 'zenOff',
      states: {
        zenOff: {
          description: 'Zen is off: no Zen bar and no ink layer.',
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
      description: 'One note is on the list.',
      initial: 'penOn',
      states: {
        zenOff: {
          description: 'Zen is off: the note is hidden, with no ink layer on the page.',
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
          description: 'Zen is off: the notes are hidden, with no ink layer on the page.',
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
