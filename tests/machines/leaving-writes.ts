import {createMachine} from 'xstate';

export const leavingWritesMachine = createMachine({
  id: 'leavingWrites',
  description: 'Leaving the editor by the logo link to Home while list links are on their way. The server holds its answers to the list writes and to the trip home until the test lets it answer. A click on a link to another page stops the editor from writing links, so a change that comes without a click or a key, such as a dropped image address, never pulls the visitor back from the trip home. A link already sent goes nowhere: Home replaces the navigation. When the visitor clicks or types in the editor before Home comes, the link went nowhere: the writes go again, and the editor stays.',
  initial: 'editing',
  states: {
    editing: {
      description: 'The list as opened, version 1, on screen and in the address. Nothing waits.',
      on: {
        CHANGE_LIST: {target: 'waiting'},
        CLICK_HOME: {target: '#leavingWrites.leaving.nothingWaits'},
      },
    },
    waiting: {
      description: 'A change moved Mauga up into row F: version 2 on screen. Its link waits for the server, so the address still holds version 1, and the page is busy.',
      on: {CLICK_HOME: {target: '#leavingWrites.leaving.linkSent'}},
    },
    leaving: {
      description: 'The visitor clicked the logo link to Home, and Home is on its way: the editor still shows, and the page is busy.',
      initial: 'nothingWaits',
      states: {
        nothingWaits: {
          description: 'Version 1 on screen and in the address. No list link waits.',
          on: {
            DROP_IMAGE_LINK: {target: 'dropWaits'},
            CHANGE_LIST: {target: '#leavingWrites.cameBack.waiting'},
            HOME_ANSWERS: {target: '#leavingWrites.home.nothingHeld'},
          },
        },
        linkSent: {
          description: 'Version 2 on screen. Its link went out before the click and still waits for the server: the address holds version 1.',
          on: {
            SERVER_ANSWERS: {target: 'linkDropped'},
            HOME_ANSWERS: {target: '#leavingWrites.home.linkHeld'},
          },
        },
        linkDropped: {
          description: 'The server answered the link of version 2, but the trip home had replaced that navigation: version 2 on screen, version 1 in the address.',
          on: {HOME_ANSWERS: {target: '#leavingWrites.home.nothingHeld'}},
        },
        dropWaits: {
          description: 'An image address dropped on the list added Red to Unranked, without a click or a key. Its link is not written: no list write reaches the server, and the address holds version 1.',
          on: {HOME_ANSWERS: {target: '#leavingWrites.home.nothingHeld'}},
        },
      },
    },
    cameBack: {
      description: 'The visitor typed in the editor before Home came: the link went nowhere. The change moved Mauga up into row F, version 2, and its link goes to the server. That navigation replaces the trip home, so the editor stays.',
      initial: 'waiting',
      states: {
        waiting: {
          description: 'Version 2 on screen; its link waits for the server, so the address holds version 1, and the page is busy.',
          on: {HOME_ANSWERS: {target: 'homeAnswered'}},
        },
        homeAnswered: {
          description: 'The server answered the trip home, which changes nothing: the editor still shows version 2, and its link still waits.',
          on: {SERVER_ANSWERS: {target: 'saved'}},
        },
        saved: {
          description: 'The server answered the link: version 2 in the address, as one new history entry. The page is no longer busy.',
        },
      },
    },
    home: {
      description: 'Home shows, and the visitor stays there.',
      initial: 'nothingHeld',
      states: {
        linkHeld: {
          description: 'The link of version 2 still waits for the server.',
          on: {SERVER_ANSWERS: {target: 'nothingHeld'}},
        },
        nothingHeld: {
          description: 'No list link waits. A late answer pulled nothing back into the editor.',
        },
      },
    },
  },
});
