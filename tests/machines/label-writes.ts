import {createMachine} from 'xstate';

export const labelWritesMachine = createMachine({
  id: 'labelWrites',
  description: 'A label setting, Row options › Label position › Top, beside a change to the list, while the server is slow. A change shows at once and its link adds a history entry; a label setting shows at once and its link replaces the current entry (A3), so it adds no Back step. Links go to the server one at a time, in order: a setting chosen while a change waits goes after it, onto the change’s entry, and a change made while a setting waits goes after it, onto a new entry. Back then shows the list before the change, with the labels kept on Top on screen.',
  initial: 'opened',
  states: {
    opened: {
      description: 'The list as opened, version 1, labels on the left, on screen and in the address. Nothing waits.',
      on: {
        CHANGE_LIST: {target: 'changeWaits'},
        CHOOSE_TOP: {target: 'topWaits'},
      },
    },
    changeWaits: {
      description: 'Version 2 (Mauga in row F) on screen, labels on the left. Its link waits for the server: the address holds version 1, and the page is busy.',
      on: {CHOOSE_TOP: {target: 'changeThenTopWait'}},
    },
    topWaits: {
      description: 'Version 1 on screen with the labels on Top. The setting’s link waits for the server: the address holds version 1 with labels on the left, and the page is busy.',
      on: {
        CHANGE_LIST: {target: 'topThenChangeWait'},
        SERVER_ANSWERS: {target: 'topSaved'},
      },
    },
    changeThenTopWait: {
      description: 'Version 2 with labels on Top on screen. The change’s link waits, the setting’s link after it: the address holds version 1.',
      on: {SERVER_ANSWERS: {target: 'changeThenTopSaved'}},
    },
    topThenChangeWait: {
      description: 'Version 2 with labels on Top on screen. The setting’s link waits, the change’s link after it: the address holds version 1.',
      on: {SERVER_ANSWERS: {target: 'topThenChangeSaved'}},
    },
    topSaved: {
      description: 'Version 1 with labels on Top in the address, in place of the entry as opened: no new history entry.',
    },
    changeThenTopSaved: {
      description: 'Version 2 with labels on Top in the address, as one new history entry. The entry before still holds the list as opened.',
      on: {BROWSER_BACK: {target: 'backToOpened'}},
    },
    topThenChangeSaved: {
      description: 'Version 2 with labels on Top in the address, as one new history entry. The entry before holds version 1 with labels on Top.',
      on: {BROWSER_BACK: {target: 'backToTop'}},
    },
    backToOpened: {
      description: 'Back: version 1 on screen, labels kept on Top. The address is the list as opened.',
    },
    backToTop: {
      description: 'Back: version 1 on screen, labels on Top. The address holds version 1 with labels on Top.',
    },
  },
});
