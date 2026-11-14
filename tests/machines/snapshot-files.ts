import {createMachine} from 'xstate';

export const snapshotFilesMachine = createMachine({
  id: 'snapshotFiles',
  description: 'Files opened in the editor with Open a Freeze Frame…, dropped on it or pasted into it. A picture becomes an item, one Back step for each file. A file with a list (a Freeze Frame download) asks first: Open list goes to its list with one Back step (a list of this page opens in place, without a request), Cancel changes nothing. A broken file or a file that is not a picture shows a message, and no other message shows. Files that come with a list file are not added. Leaving the editor drops the files that wait. A message closes by itself after 4 seconds (TOAST_TIMES_OUT), but not while the pointer rests on it. While a message shows, the visitor of this machine only reads it until it closes: what a change does while a message still shows is left out, since every list would need a state with each message.',
  initial: 'editor',
  states: {
    editor: {
      description: 'The editor, on the list Before (Mauga in S) or on the list in the file.',
      initial: 'before',
      on: {
        PASTE_TEXT_FILE: {description: 'A paste takes pictures only: a pasted text file changes nothing and shows no message.'},
      },
      states: {
        before: {
          description: 'The lists before a list file opens, with Back from one to the one before it, and the messages over the list as opened.',
          initial: 'lists',
          states: {
            lists: {
              description: 'A list before a list file opens, with no message.',
              initial: 'ownList',
              on: {
                OPEN_LIST_FILE: {target: '#snapshotFiles.editor.asking'},
                DROP_LIST_FILE: {target: '#snapshotFiles.editor.asking'},
                PASTE_LIST_FILE: {target: '#snapshotFiles.editor.asking'},
                DROP_LIST_FILE_AND_PASTE_PICTURE: {target: '#snapshotFiles.editor.asking.filesNotAdded'},
              },
              states: {
                ownList: {
                  description: 'The list as opened, titled Before, with nothing in Unranked. Back would leave the editor, so the model does not take it.',
                  on: {
                    OPEN_PICTURE_FILE: {target: 'withPicture'},
                    DROP_PICTURE_FILE: {target: 'withPicture'},
                    PASTE_PICTURE_FILE: {target: 'withPicture'},
                    PASTE_TWO_PICTURES_AT_ONCE: {target: 'withTwoPictures'},
                    OPEN_BROKEN_FILE: {target: '#snapshotFiles.editor.before.brokenFileMessage'},
                    DROP_TEXT_FILE: {target: '#snapshotFiles.editor.before.notAPictureMessage'},
                    LEAVE_WHILE_PICTURES_WAIT: {target: '#snapshotFiles.left'},
                  },
                },
                withPicture: {
                  description: 'The list as opened with one picture in Unranked. Back goes to the list as opened.',
                  on: {BROWSER_BACK: {target: 'ownList'}},
                },
                withTwoPictures: {
                  description: 'Two pictures pasted at once, each its own Back step. Back goes to the list with the first picture.',
                  on: {BROWSER_BACK: {target: 'withPicture'}},
                },
                lastList: {type: 'history', target: 'ownList'},
              },
            },
            brokenFileMessage: {
              description: 'The message “Could not open the file” says the file is damaged, over the list as opened, which stays as it is.',
              on: {TOAST_TIMES_OUT: {target: 'lists.ownList'}},
            },
            notAPictureMessage: {
              description: 'The message “Could not open the file” names the text file: it is not a picture. The list as opened stays as it is.',
              on: {TOAST_TIMES_OUT: {target: 'lists.ownList'}},
            },
          },
        },
        asking: {
          description: 'The dialog asks “Open the list in this file? Your current list stays one Back step away.” over the list before. A paste lands in the dialog and a drop on it does nothing.',
          initial: 'nothingWaits',
          states: {
            nothingWaits: {
              description: 'No message shows.',
              on: {
                CANCEL: {target: '#snapshotFiles.editor.before.lists.lastList'},
                PRESS_ESCAPE: {target: '#snapshotFiles.editor.before.lists.lastList'},
                OPEN_LIST: {target: '#snapshotFiles.editor.fileList'},
              },
            },
            filesNotAdded: {
              description: 'The picture pasted right after the list file waited, and the message “Files not added” names it. The dialog makes the page ignore the pointer, so nothing holds the message: it closes by itself after 4 seconds (TOAST_TIMES_OUT).',
              on: {TOAST_TIMES_OUT: {target: 'nothingWaits'}},
            },
          },
        },
        fileList: {
          description: 'Open list stored the file’s picture and opened its list in place, as one new history entry: titled Snapshot list, with its picture in row S. Back goes to the list before.',
          on: {
            BROWSER_BACK: {target: 'before.lists.lastList'},
            OPEN_LIST_FILE: {target: 'askingAgain'},
            DROP_LIST_FILE: {target: 'askingAgain'},
            PASTE_LIST_FILE: {target: 'askingAgain'},
          },
        },
        askingAgain: {
          description: 'The dialog asks about the same file again. The address shows its list already, so Open list changes nothing.',
          on: {
            CANCEL: {target: 'fileList'},
            PRESS_ESCAPE: {target: 'fileList'},
            OPEN_LIST: {target: 'fileList'},
          },
        },
      },
    },
    left: {
      description: 'The visitor pasted pictures and left for the landing page while they waited. The pictures that waited were dropped quietly and nothing brings the visitor back. Recently viewed lists the list as opened once.',
      on: {BROWSER_BACK: {target: '#snapshotFiles.editor.before.lists.ownList'}},
    },
  },
});
