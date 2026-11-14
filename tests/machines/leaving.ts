import {createMachine} from 'xstate';

export const leavingMachine = createMachine({
  id: 'leaving',
  description: 'Leaving the editor by the logo link to Home, while the server holds its answer for Home until the test lets it answer (HOME_ANSWERS). A change is in the address and in the history at once, so a click on Home right after it loses nothing: Back from Home shows it. While Home is on its way, a dropped image address, which is neither a click nor a key, adds nothing, so nothing keeps the visitor from Home. A change the visitor makes with a key before Home comes is written at once, and the editor stays: the change cancels the trip home.',
  initial: 'editing',
  states: {
    editing: {
      description: 'The editor, before the click on Home.',
      initial: 'opened',
      states: {
        opened: {
          description: 'The list as opened, version 1, on screen and in the address.',
          on: {
            CHANGE_LIST: {target: 'changed'},
            CLICK_HOME: {target: '#leaving.leaving.fromOpened'},
          },
        },
        changed: {
          description: 'A change moved Mauga up into row F: version 2, on screen and in the address at once, as one new history entry. Nothing waits for the server.',
          on: {CLICK_HOME: {target: '#leaving.leaving.fromChanged'}},
        },
      },
    },
    leaving: {
      description: 'The visitor clicked the logo link to Home, and Home is on its way: the editor still shows, and the page is busy.',
      initial: 'fromOpened',
      states: {
        fromOpened: {
          description: 'Version 1 on screen and in the address.',
          on: {
            DROP_IMAGE_LINK: {description: 'An image address dropped on the list adds nothing while Home is on its way: the list and the address stay as they are.'},
            CHANGE_LIST: {target: '#leaving.stayed'},
            HOME_ANSWERS: {target: '#leaving.home.fromOpened'},
          },
        },
        fromChanged: {
          description: 'Version 2 on screen and in the address: the change was written before the click.',
          on: {
            DROP_IMAGE_LINK: {description: 'An image address dropped on the list adds nothing while Home is on its way: the list and the address stay as they are.'},
            HOME_ANSWERS: {target: '#leaving.home.fromChanged'},
          },
        },
      },
    },
    stayed: {
      description: 'The visitor moved Mauga up into row F with the keyboard before Home came: version 2, on screen and in the address at once, as one new history entry. Writing the address cancelled the trip home, so the editor stays.',
      initial: 'homeHeld',
      states: {
        homeHeld: {
          description: 'The server still holds its answer for Home. The page is not busy: the trip home was cancelled.',
          on: {HOME_ANSWERS: {target: 'homeAnswered'}},
        },
        homeAnswered: {
          description: 'The server answered the cancelled trip home, which changes nothing: the editor still shows version 2.',
        },
      },
    },
    home: {
      description: 'Home shows, and the visitor stays there.',
      initial: 'fromOpened',
      states: {
        fromOpened: {
          description: 'The visitor left from version 1.',
          on: {BROWSER_BACK: {target: '#leaving.back.opened'}},
        },
        fromChanged: {
          description: 'The visitor left from version 2.',
          on: {BROWSER_BACK: {target: '#leaving.back.changed'}},
        },
      },
    },
    back: {
      description: 'Back from Home: the editor again, with the version it was left on.',
      initial: 'opened',
      states: {
        opened: {description: 'Version 1, the list as opened, on screen and in the address.'},
        changed: {description: 'Version 2, on screen and in the address: the change made right before the click on Home was kept.'},
      },
    },
  },
});
