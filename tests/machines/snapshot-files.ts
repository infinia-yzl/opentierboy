import {createMachine} from 'xstate';

export const snapshotFilesMachine = createMachine({
  id: 'snapshotFiles',
  description: 'Files opened in the editor with Open a Freeze Frame…, dropped on it or pasted into it. A picture becomes an item, one Back step for each file. A file with a list (a Freeze Frame download) asks first: Open list goes to its list with one Back step, Cancel changes nothing. A broken file or a file that is not a picture shows a message. Files that come with a list file are not added. Leaving the editor drops the files that wait. A message closes by itself after 4 seconds (TOAST_TIMES_OUT), but not while the pointer rests on it.',
  initial: 'editor',
  states: {
    editor: {
      initial: 'before',
      states: {
        before: {
          description: 'The lists before a list file opens, with Back from one to the one before it.',
          initial: 'ownList',
          on: {
            OPEN_LIST_FILE: {target: 'asking'},
            DROP_LIST_FILE: {target: 'asking'},
            PASTE_LIST_FILE: {target: 'asking'},
            DROP_LIST_FILE_AND_PASTE_PICTURE: {target: 'asking.filesNotAdded'},
          },
          states: {
            ownList: {
              description: 'The list as opened, titled Before, with nothing in Unranked. Back would leave the editor, so the model does not take it.',
              initial: 'quiet',
              on: {
                OPEN_PICTURE_FILE: {target: 'withPicture'},
                DROP_PICTURE_FILE: {target: 'withPicture'},
                PASTE_PICTURE_FILE: {target: 'withPicture'},
                PASTE_TWO_PICTURES_AT_ONCE: {target: 'withTwoPictures'},
                OPEN_BROKEN_FILE: {target: '.brokenFileMessage'},
                DROP_TEXT_FILE: {target: '.notAPictureMessage'},
                LEAVE_WHILE_PICTURES_WAIT: {target: '#snapshotFiles.left'},
              },
              states: {
                quiet: {},
                brokenFileMessage: {
                  description: 'The message “Could not open the file” says the file is damaged. The list stays as it is.',
                  on: {TOAST_TIMES_OUT: {target: 'quiet'}},
                },
                notAPictureMessage: {
                  description: 'The message “Could not open the file” names the text file: it is not a picture. The list stays as it is.',
                  on: {TOAST_TIMES_OUT: {target: 'quiet'}},
                },
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
        asking: {
          description: 'The dialog asks “Open the list in this file? Your current list stays one Back step away.” over the list before. A paste lands in the dialog and a drop on it does nothing.',
          initial: 'nothingWaits',
          on: {
            CANCEL: {target: 'before.lastList'},
            PRESS_ESCAPE: {target: 'before.lastList'},
            OPEN_LIST: {target: 'opening'},
          },
          states: {
            nothingWaits: {},
            filesNotAdded: {
              description: 'The picture pasted right after the list file waited, and the message “Files not added” names it. The dialog makes the page ignore the pointer, so nothing holds the message: it closes by itself after 4 seconds.',
              on: {TOAST_TIMES_OUT: {target: 'nothingWaits'}},
            },
          },
        },
        opening: {
          description: 'Open list was clicked and the server has not answered yet. The dialog says “Opening the list…” and stays: Cancel, Escape, a paste and a drop change nothing.',
          on: {SERVER_ANSWERS: {target: 'fileList'}},
        },
        fileList: {
          description: 'The list in the file, titled Snapshot list, with its picture in row S. Back goes to the list before.',
          on: {
            BROWSER_BACK: {target: 'before.lastList'},
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
      on: {BROWSER_BACK: {target: '#snapshotFiles.editor.before.ownList'}},
    },
  },
});
