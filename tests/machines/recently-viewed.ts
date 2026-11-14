import {createMachine} from 'xstate';

export const recentlyViewedMachine = createMachine({
  id: 'recentlyViewed',
  description: 'Home’s Recently viewed while the visitor opens two lists, Tanks list and Support list, and pins, unpins, removes and reopens them. Local storage starts one list short of each cap: 19 other pinned lists (the cap is 20) and 29 other unpinned lists (the cap is 30), all opened later than the two lists. So at most one of the two lists is pinned, and Pin on the other one shows a toast. And at most one of them is unpinned: when the other one joins the unpinned lists, the one already there is now the oldest and drops off. A pinned list shows first, above the other pinned lists. An unpinned list shows last. Open is a link from outside Home, for a list that Recently viewed does not show. Reopen is the list’s link in Recently viewed. Both record the list again and keep its pin.',
  initial: 'nonePinned',
  states: {
    nonePinned: {
      description: 'Neither list is pinned.',
      initial: 'noneListed',
      states: {
        noneListed: {
          description: 'Only the other lists show.',
          on: {
            OPEN_TANKS: {target: 'tanksRecent'},
            OPEN_SUPPORT: {target: 'supportRecent'},
          },
        },
        tanksRecent: {
          description: 'Tanks list shows last.',
          on: {
            REOPEN_TANKS: {target: 'tanksRecent'},
            PIN_TANKS: {target: '#recentlyViewed.tanksPinned.supportUnlisted'},
            REMOVE_TANKS: {target: 'noneListed'},
            OPEN_SUPPORT: {target: 'supportRecent'},
          },
        },
        supportRecent: {
          description: 'Support list shows last.',
          on: {
            REOPEN_SUPPORT: {target: 'supportRecent'},
            PIN_SUPPORT: {target: '#recentlyViewed.supportPinned.tanksUnlisted'},
            REMOVE_SUPPORT: {target: 'noneListed'},
            OPEN_TANKS: {target: 'tanksRecent'},
          },
        },
      },
    },
    tanksPinned: {
      description: 'Tanks list is pinned and shows first. 20 lists are pinned: the cap.',
      initial: 'supportUnlisted',
      states: {
        supportUnlisted: {
          description: 'Support list does not show.',
          on: {
            REOPEN_TANKS: {target: 'supportUnlisted'},
            UNPIN_TANKS: {target: '#recentlyViewed.nonePinned.tanksRecent'},
            REMOVE_TANKS: {target: '#recentlyViewed.nonePinned.noneListed'},
            OPEN_SUPPORT: {target: 'supportRecent'},
          },
        },
        supportRecent: {
          description: 'Support list shows last. 30 lists are unpinned: the cap.',
          on: {
            REOPEN_TANKS: {target: 'supportRecent'},
            UNPIN_TANKS: {target: '#recentlyViewed.nonePinned.tanksRecent'},
            REMOVE_TANKS: {target: '#recentlyViewed.nonePinned.supportRecent'},
            REOPEN_SUPPORT: {target: 'supportRecent'},
            PIN_SUPPORT: {target: 'supportPinRefused'},
            REMOVE_SUPPORT: {target: 'supportUnlisted'},
          },
        },
        supportPinRefused: {
          description: 'Pin Support list was refused: the toast “You can pin up to 20 lists” shows, and the lists are as they were. The model waits for the toast to end by itself.',
          on: {TOAST_TIMES_OUT: {target: 'supportRecent'}},
        },
      },
    },
    supportPinned: {
      description: 'Support list is pinned and shows first. 20 lists are pinned: the cap.',
      initial: 'tanksUnlisted',
      states: {
        tanksUnlisted: {
          description: 'Tanks list does not show.',
          on: {
            REOPEN_SUPPORT: {target: 'tanksUnlisted'},
            UNPIN_SUPPORT: {target: '#recentlyViewed.nonePinned.supportRecent'},
            REMOVE_SUPPORT: {target: '#recentlyViewed.nonePinned.noneListed'},
            OPEN_TANKS: {target: 'tanksRecent'},
          },
        },
        tanksRecent: {
          description: 'Tanks list shows last. 30 lists are unpinned: the cap.',
          on: {
            REOPEN_SUPPORT: {target: 'tanksRecent'},
            UNPIN_SUPPORT: {target: '#recentlyViewed.nonePinned.supportRecent'},
            REMOVE_SUPPORT: {target: '#recentlyViewed.nonePinned.tanksRecent'},
            REOPEN_TANKS: {target: 'tanksRecent'},
            PIN_TANKS: {target: 'tanksPinRefused'},
            REMOVE_TANKS: {target: 'tanksUnlisted'},
          },
        },
        tanksPinRefused: {
          description: 'Pin Tanks list was refused: the toast “You can pin up to 20 lists” shows, and the lists are as they were. The model waits for the toast to end by itself.',
          on: {TOAST_TIMES_OUT: {target: 'tanksRecent'}},
        },
      },
    },
  },
});
