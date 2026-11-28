import {createMachine} from 'xstate';

export const inkHistoryMachine = createMachine({
  id: 'inkHistory',
  description: 'The browser history of scribbles, in Zen with the pen on. A run of drawing between two changes to the list is one history entry: its first ink change adds the entry and each later one updates it. A change to the list, Back, Forward and a reload end the run. A browser can refuse a history write: the note then stays on screen, and the next ink change writes it. The pen also limits how often it writes: a note past the limit waits on screen, and turning the pen off writes it. Each state says how many notes the ink layer has, what the Zen bar’s step count reads, and whether the address has an ink value.',
  initial: 'opened',
  states: {
    opened: {
      description: 'The list as opened: no note, step 1 / 1, no ink value.',
      on: {
        DRAW_NOTE: {target: 'runOfOneNote'},
        DRAW_NOTE_REFUSED: {target: 'noteNotWritten'},
      },
    },
    noteNotWritten: {
      description: 'The browser refused the history write of the note: the note is on screen and not in the address. 1 note, step 1 / 1, no ink value.',
      on: {DRAW_NOTE: {target: 'runOfTwoNotes'}},
    },
    runOfOneNote: {
      description: 'A run is open with 1 note: step 2 / 2, with an ink value.',
      on: {
        DRAW_NOTE: {target: 'runOfTwoNotes'},
        DRAW_NOTE_PAST_LIMIT: {target: 'noteWaiting'},
        REMOVE_LAST_NOTE: {target: 'runWithoutNotes'},
        CLEAR: {target: 'runWithoutNotes'},
        RELOAD: {target: 'reloaded'},
      },
    },
    noteWaiting: {
      description: 'The pen wrote as often as its limit allows, so the second note waits: 2 notes on screen, step 2 / 2, and the address still has the ink value of 1 note.',
      on: {
        PEN_OFF_AND_ON: {target: 'runOfTwoNotes'},
        BACK: {target: 'backFromWaitingNote'},
      },
    },
    backFromWaitingNote: {
      description: 'Back from the run while a note waited: the whole run is gone, and the waiting note with it. No note, step 1 / 2, no ink value.',
      on: {FORWARD: {target: 'forwardWithoutWaitingNote'}},
    },
    forwardWithoutWaitingNote: {
      description: 'Forward onto the run: the 1 note that was written is there again, step 2 / 2. The note that waited is gone.',
    },
    runOfTwoNotes: {
      description: 'A run with 2 notes: step 2 / 2, with an ink value. It is the same run as with 1 note, also after the pen was turned off to write a waiting note, or the run that a second note opens after a refused write.',
      on: {
        REMOVE_LAST_NOTE: {target: 'runOfOneNote'},
        CLEAR: {target: 'runWithoutNotes'},
        CHANGE_LIST: {target: 'listChanged'},
        BACK: {target: 'backFromRun'},
      },
    },
    runWithoutNotes: {
      description: 'The same run after its notes were removed: no note and no ink value, still step 2 / 2. The entry of the run stays.',
      on: {DRAW_NOTE: {target: 'runOfOneNote'}},
    },
    backFromRun: {
      description: 'Back from the run: the whole run is gone. No note, step 1 / 2, no ink value.',
      on: {FORWARD: {target: 'forwardOnRun'}},
    },
    forwardOnRun: {
      description: 'Forward onto the run: its 2 notes are there again, step 2 / 2. The run is closed.',
      on: {DRAW_NOTE: {target: 'runAfterForward'}},
    },
    runAfterForward: {
      description: 'A note drawn after Forward starts a new run with a new entry: 3 notes, step 3 / 3.',
    },
    listChanged: {
      description: 'An item moved to row A: the change to the list has its own entry and keeps the ink. 2 notes, step 3 / 3.',
      on: {
        DRAW_NOTE: {target: 'runAfterListChange'},
        BACK: {target: 'backFromListChange'},
      },
    },
    runAfterListChange: {
      description: 'A note drawn after the change to the list starts a new run with a new entry: 3 notes, step 4 / 4.',
    },
    backFromListChange: {
      description: 'Back from the change to the list: the item is in its row again and the 2 notes of the run stay. Step 2 / 3.',
    },
    reloaded: {
      description: 'The page was loaded again: the note comes from the address. 1 note, step 2 / 2. The run is closed.',
      on: {DRAW_NOTE: {target: 'runAfterReload'}},
    },
    runAfterReload: {
      description: 'A note drawn after the reload starts a new run with a new entry: 2 notes, step 3 / 3.',
    },
  },
});
