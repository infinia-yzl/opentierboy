import {createMachine} from 'xstate';

export const linkWritesMachine = createMachine({
  id: 'linkWrites',
  description: 'The links of list changes on their way to the address while the server is slow, over four versions: the list as opened and three changes. A change shows on screen at once, and its link waits for the server. Up to two links wait, in order. When the server answers, they reach the address one after another, each as its own history entry, and Back and Forward then step through the versions. A change after Back drops the later versions when its link reaches the address. Back and Forward are never pressed while a link waits: router.push adds the entry only when the server answers, so the change would be lost, a known bug the owner chose to keep (2026-10-25).',
  initial: 'versions1',
  states: {
    versions1: {
      description: 'The history holds one version of the list: the list as opened.',
      initial: 'version1',
      states: {
        version1: {
          description: 'Version 1 on screen and in the address. Nothing waits. Back would leave the editor, so the model does not take it, and Forward changes nothing.',
          on: {
            CHANGE_LIST: {target: 'version1OneWaiting'},
          },
        },
        version1OneWaiting: {
          description: 'A change from version 1: version 2 on screen at once. Its link waits for the server: the address still holds version 1.',
          on: {
            CHANGE_LIST: {target: 'version1TwoWaiting'},
            SERVER_ANSWERS: {target: '#linkWrites.versions2.version2'},
          },
        },
        version1TwoWaiting: {
          description: 'Another change: version 3 on screen at once. The links of versions 2 and 3 wait, in order: the address still holds version 1.',
          on: {
            SERVER_ANSWERS: {target: '#linkWrites.versions3.version3'},
          },
        },
      },
    },
    versions2: {
      description: 'The history holds 2 versions of the list, one entry each.',
      initial: 'version2',
      states: {
        version2: {
          description: 'Version 2, the latest, on screen and in the address. Nothing waits. Forward changes nothing.',
          on: {
            CHANGE_LIST: {target: 'version2OneWaiting'},
            BROWSER_BACK: {target: 'version1'},
          },
        },
        version1: {
          description: 'Back to version 1: on screen and in the address. Back would leave the editor, so the model does not take it.',
          on: {
            CHANGE_LIST: {target: 'version1OneWaiting'},
            BROWSER_FORWARD: {target: 'version2'},
          },
        },
        version2OneWaiting: {
          description: 'A change from version 2: version 3 on screen at once. Its link waits for the server: the address still holds version 2.',
          on: {
            CHANGE_LIST: {target: 'version2TwoWaiting'},
            SERVER_ANSWERS: {target: '#linkWrites.versions3.version3'},
          },
        },
        version2TwoWaiting: {
          description: 'Another change: version 4 on screen at once. The links of versions 3 and 4 wait, in order: the address still holds version 2.',
          on: {
            SERVER_ANSWERS: {target: '#linkWrites.versions4.version4'},
          },
        },
        version1OneWaiting: {
          description: 'A change from version 1: version 2 on screen at once. Its link waits for the server: the address still holds version 1, and the history still holds the later version until a link reaches the address.',
          on: {
            CHANGE_LIST: {target: 'version1TwoWaiting'},
            SERVER_ANSWERS: {target: '#linkWrites.versions2.version2'},
          },
        },
        version1TwoWaiting: {
          description: 'Another change: version 3 on screen at once. The links of versions 2 and 3 wait, in order: the address still holds version 1, and the history still holds the later version until a link reaches the address.',
          on: {
            SERVER_ANSWERS: {target: '#linkWrites.versions3.version3'},
          },
        },
      },
    },
    versions3: {
      description: 'The history holds 3 versions of the list, one entry each.',
      initial: 'version3',
      states: {
        version3: {
          description: 'Version 3, the latest, on screen and in the address. Nothing waits. Forward changes nothing.',
          on: {
            CHANGE_LIST: {target: 'version3OneWaiting'},
            BROWSER_BACK: {target: 'version2'},
          },
        },
        version2: {
          description: 'Back or Forward to version 2: on screen and in the address.',
          on: {
            CHANGE_LIST: {target: 'version2OneWaiting'},
            BROWSER_BACK: {target: 'version1'},
            BROWSER_FORWARD: {target: 'version3'},
          },
        },
        version1: {
          description: 'Back to version 1: on screen and in the address. Back would leave the editor, so the model does not take it.',
          on: {
            CHANGE_LIST: {target: 'version1OneWaiting'},
            BROWSER_FORWARD: {target: 'version2'},
          },
        },
        version3OneWaiting: {
          description: 'A change from version 3: version 4 on screen at once. Its link waits for the server: the address still holds version 3.',
          on: {
            SERVER_ANSWERS: {target: '#linkWrites.versions4.version4'},
          },
        },
        version2OneWaiting: {
          description: 'A change from version 2: version 3 on screen at once. Its link waits for the server: the address still holds version 2, and the history still holds the later version until a link reaches the address.',
          on: {
            CHANGE_LIST: {target: 'version2TwoWaiting'},
            SERVER_ANSWERS: {target: '#linkWrites.versions3.version3'},
          },
        },
        version2TwoWaiting: {
          description: 'Another change: version 4 on screen at once. The links of versions 3 and 4 wait, in order: the address still holds version 2, and the history still holds the later version until a link reaches the address.',
          on: {
            SERVER_ANSWERS: {target: '#linkWrites.versions4.version4'},
          },
        },
        version1OneWaiting: {
          description: 'A change from version 1: version 2 on screen at once. Its link waits for the server: the address still holds version 1, and the history still holds the 2 later versions until a link reaches the address.',
          on: {
            CHANGE_LIST: {target: 'version1TwoWaiting'},
            SERVER_ANSWERS: {target: '#linkWrites.versions2.version2'},
          },
        },
        version1TwoWaiting: {
          description: 'Another change: version 3 on screen at once. The links of versions 2 and 3 wait, in order: the address still holds version 1, and the history still holds the 2 later versions until a link reaches the address.',
          on: {
            SERVER_ANSWERS: {target: '#linkWrites.versions3.version3'},
          },
        },
      },
    },
    versions4: {
      description: 'The history holds 4 versions of the list, one entry each.',
      initial: 'version4',
      states: {
        version4: {
          description: 'Version 4 on screen and in the address. Nothing waits. Every Unranked item is ranked, so no change is left to make, and Forward changes nothing.',
          on: {
            BROWSER_BACK: {target: 'version3'},
          },
        },
        version3: {
          description: 'Back or Forward to version 3: on screen and in the address.',
          on: {
            CHANGE_LIST: {target: 'version3OneWaiting'},
            BROWSER_BACK: {target: 'version2'},
            BROWSER_FORWARD: {target: 'version4'},
          },
        },
        version2: {
          description: 'Back or Forward to version 2: on screen and in the address.',
          on: {
            CHANGE_LIST: {target: 'version2OneWaiting'},
            BROWSER_BACK: {target: 'version1'},
            BROWSER_FORWARD: {target: 'version3'},
          },
        },
        version1: {
          description: 'Back to version 1: on screen and in the address. Back would leave the editor, so the model does not take it.',
          on: {
            CHANGE_LIST: {target: 'version1OneWaiting'},
            BROWSER_FORWARD: {target: 'version2'},
          },
        },
        version3OneWaiting: {
          description: 'A change from version 3: version 4 on screen at once. Its link waits for the server: the address still holds version 3, and the history still holds the later version until a link reaches the address.',
          on: {
            SERVER_ANSWERS: {target: '#linkWrites.versions4.version4'},
          },
        },
        version2OneWaiting: {
          description: 'A change from version 2: version 3 on screen at once. Its link waits for the server: the address still holds version 2, and the history still holds the 2 later versions until a link reaches the address.',
          on: {
            CHANGE_LIST: {target: 'version2TwoWaiting'},
            SERVER_ANSWERS: {target: '#linkWrites.versions3.version3'},
          },
        },
        version2TwoWaiting: {
          description: 'Another change: version 4 on screen at once. The links of versions 3 and 4 wait, in order: the address still holds version 2, and the history still holds the 2 later versions until a link reaches the address.',
          on: {
            SERVER_ANSWERS: {target: '#linkWrites.versions4.version4'},
          },
        },
        version1OneWaiting: {
          description: 'A change from version 1: version 2 on screen at once. Its link waits for the server: the address still holds version 1, and the history still holds the 3 later versions until a link reaches the address.',
          on: {
            CHANGE_LIST: {target: 'version1TwoWaiting'},
            SERVER_ANSWERS: {target: '#linkWrites.versions2.version2'},
          },
        },
        version1TwoWaiting: {
          description: 'Another change: version 3 on screen at once. The links of versions 2 and 3 wait, in order: the address still holds version 1, and the history still holds the 3 later versions until a link reaches the address.',
          on: {
            SERVER_ANSWERS: {target: '#linkWrites.versions3.version3'},
          },
        },
      },
    },
  },
});
