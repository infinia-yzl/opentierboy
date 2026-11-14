import {createMachine} from 'xstate';

export const linkWritesMachine = createMachine({
  id: 'linkWrites',
  description: 'The links of list changes on their way to the address while the server is slow, over four versions: the list as opened and three changes. A change shows on screen at once, and its link waits for the server. Up to two links wait, in order. When the server answers, they reach the address one after another, each as its own history entry, and Back then steps through every version. Back is never pressed while a link waits: router.push adds the entry only when the server answers, so the change would be lost, a known bug the owner chose to keep (2026-10-25).',
  initial: 'versions1',
  states: {
    versions1: {
      description: 'The history holds one version of the list: the list as opened, which is in the address.',
      initial: 'latest',
      states: {
        latest: {
          description: 'Version 1 on screen and in the address. Nothing waits. Back would leave the editor, so the model does not take it.',
          on: {CHANGE_LIST: {target: 'oneWaiting'}},
        },
        oneWaiting: {
          description: 'Version 2 on screen at once. Its link waits for the server: the address still holds version 1, and the page says it is busy.',
          on: {CHANGE_LIST: {target: 'twoWaiting'}, SERVER_ANSWERS: {target: '#linkWrites.versions2.latest'}},
        },
        twoWaiting: {
          description: 'Version 3 on screen at once. The links of versions 2 and 3 wait, in order: the address still holds version 1.',
          on: {SERVER_ANSWERS: {target: '#linkWrites.versions3.latest'}},
        },
      },
    },
    versions2: {
      description: 'The history holds two versions of the list, one entry each.',
      initial: 'latest',
      states: {
        latest: {
          description: 'Version 2 on screen and in the address. Nothing waits.',
          on: {CHANGE_LIST: {target: 'oneWaiting'}, BROWSER_BACK: {target: 'version1'}},
        },
        oneWaiting: {
          description: 'Version 3 on screen at once. Its link waits: the address still holds version 2.',
          on: {CHANGE_LIST: {target: 'twoWaiting'}, SERVER_ANSWERS: {target: '#linkWrites.versions3.latest'}},
        },
        twoWaiting: {
          description: 'Version 4 on screen at once. The links of versions 3 and 4 wait, in order: the address still holds version 2.',
          on: {SERVER_ANSWERS: {target: '#linkWrites.versions4.latest'}},
        },
        version1: {
          description: 'Back from version 2: version 1 on screen and in the address.',
        },
      },
    },
    versions3: {
      description: 'The history holds three versions of the list, one entry each.',
      initial: 'latest',
      states: {
        latest: {
          description: 'Version 3 on screen and in the address. Nothing waits.',
          on: {CHANGE_LIST: {target: 'oneWaiting'}, BROWSER_BACK: {target: 'version2'}},
        },
        oneWaiting: {
          description: 'Version 4 on screen at once. Its link waits: the address still holds version 3.',
          on: {SERVER_ANSWERS: {target: '#linkWrites.versions4.latest'}},
        },
        version2: {
          description: 'Back from version 3: version 2 on screen and in the address.',
          on: {BROWSER_BACK: {target: 'version1'}},
        },
        version1: {
          description: 'Back again: version 1 on screen and in the address.',
        },
      },
    },
    versions4: {
      description: 'The history holds four versions of the list, one entry each. Every Unranked item is ranked, so no change is left to make.',
      initial: 'latest',
      states: {
        latest: {
          description: 'Version 4 on screen and in the address. Nothing waits.',
          on: {BROWSER_BACK: {target: 'version3'}},
        },
        version3: {
          description: 'Back from version 4: version 3 on screen and in the address.',
          on: {BROWSER_BACK: {target: 'version2'}},
        },
        version2: {
          description: 'Back again: version 2 on screen and in the address.',
          on: {BROWSER_BACK: {target: 'version1'}},
        },
        version1: {
          description: 'Back again: version 1 on screen and in the address.',
        },
      },
    },
  },
});
