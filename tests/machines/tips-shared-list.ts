import {createMachine} from 'xstate';

export const tipsSharedListMachine = createMachine({
  id: 'tipsSharedList',
  description: 'The shared-list tip of a new browser that opens a friend’s link. It shows for a link opened fresh until the browser has seen it or the link-save toast. It ends with Close, Hide tips or the first change, and About’s “Show the tips again” turns it on again. Opening the list from Recently viewed shows no tip.',
  initial: 'editor',
  states: {
    editor: {
      description: 'The editor on the friend’s list “Tanks by a friend”, with Mauga in S and Winston in A.',
      initial: 'sharedListTip',
      on: {SHOW_TIPS_AGAIN: {target: 'about'}},
      states: {
        sharedListTip: {
          description: 'The tip under the title. It is seen as soon as it shows.',
          on: {
            CLOSE_TIP: {target: 'noTip.sharedListSeen'},
            HIDE_TIPS: {target: 'tipsOff'},
            CHANGE_TITLE: {target: 'linkSaveToast.afterSharedListTip'},
            OPEN_SHARED_LINK: {target: 'noTip.sharedListSeen'},
            OPEN_FROM_RECENTLY_VIEWED: {target: 'noTip.sharedListSeen'},
          },
        },
        linkSaveToast: {
          description: 'The link-save toast shows. The first change ends the first-drag tip without showing it, because the rows already hold items. The toast ends by itself after 10 seconds, but not while the pointer rests on it.',
          initial: 'afterSharedListTip',
          on: {HIDE_TIPS: {target: 'tipsOff'}},
          states: {
            afterSharedListTip: {
              description: 'The shared-list tip was seen before the change.',
              on: {
                CLOSE_TOAST: {target: '#tipsSharedList.editor.noTip.allSeen'},
                OPEN_SHARED_LINK: {target: '#tipsSharedList.editor.noTip.allSeen'},
                OPEN_FROM_RECENTLY_VIEWED: {target: '#tipsSharedList.editor.noTip.allSeen'},
              },
            },
            withoutSharedListTip: {
              description: 'The list was opened from Recently viewed, so the shared-list tip never showed.',
              on: {
                CLOSE_TOAST: {target: '#tipsSharedList.editor.noTip.linkSaveSeen'},
                OPEN_SHARED_LINK: {target: '#tipsSharedList.editor.noTip.linkSaveSeen'},
                OPEN_FROM_RECENTLY_VIEWED: {target: '#tipsSharedList.editor.noTip.linkSaveSeen'},
              },
            },
          },
        },
        noTip: {
          description: 'No tip shows.',
          initial: 'nothingSeen',
          states: {
            nothingSeen: {
              description: 'Opened from Recently viewed after “Show the tips again”.',
              on: {
                OPEN_SHARED_LINK: {target: '#tipsSharedList.editor.sharedListTip'},
                CHANGE_TITLE: {target: '#tipsSharedList.editor.linkSaveToast.withoutSharedListTip'},
              },
            },
            sharedListSeen: {
              description: 'The shared-list tip is seen; the link-save toast is not.',
              on: {CHANGE_TITLE: {target: '#tipsSharedList.editor.linkSaveToast.afterSharedListTip'}},
            },
            linkSaveSeen: {description: 'The link-save toast is seen, so the shared-list tip does not show any more.'},
            allSeen: {description: 'The shared-list tip and the link-save toast are seen.'},
          },
        },
        tipsOff: {description: 'Hide tips turned every tip off.'},
      },
    },
    about: {
      description: 'About’s “Show the tips again” forgot every tip seen and turned the tips on.',
      on: {
        OPEN_SHARED_LINK: {target: 'editor.sharedListTip'},
        OPEN_FROM_RECENTLY_VIEWED: {target: 'editor.noTip.nothingSeen'},
      },
    },
  },
});
