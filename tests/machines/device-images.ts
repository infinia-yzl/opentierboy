import {createMachine} from 'xstate';

export const deviceImagesMachine = createMachine({
  id: 'deviceImages',
  description: 'The life of two images from the device, Red and Blue, in a list with Mauga in S. Add images › From your device adds each image to Unranked, keeps its picture in this browser (IndexedDB) and writes only its id and name to the link. The toast “Items Added” offers Undo, which removes the image as a new change but keeps its picture in this browser. Back and Forward step between the versions of the list, and each image shows its picture again. A reload keeps the pictures. The same link in a new browser, which never had the pictures, shows the placeholder image with each name.',
  initial: 'thisBrowser',
  states: {
    thisBrowser: {
      description: 'The tab of the browser that added the images. Each image in the list shows its own picture.',
      initial: 'noImages',
      states: {
        noImages: {
          description: 'The list as opened: Mauga in S. Unranked is empty. Back would leave the editor, so the model does not take it.',
          on: {
            UPLOAD_RED: {target: 'redAdded'},
            RELOAD: {target: 'noImages'},
          },
        },
        redAdded: {
          description: 'Red in Unranked. The toast “Items Added” says 1 item(s) have been added, with Undo.',
          on: {
            UNDO: {target: 'redUndone'},
            TOAST_TIMES_OUT: {target: 'redUnranked'},
            RELOAD: {target: 'redUnranked'},
          },
        },
        redUndone: {
          description: 'Undo removed Red as a new change: Unranked is empty, and the toast closed. Back goes to the list with Red.',
          on: {
            BROWSER_BACK: {target: 'redBackAfterUndo'},
            RELOAD: {target: 'redUndone'},
          },
        },
        redBackAfterUndo: {
          description: 'Back after Undo: Red in Unranked again, with its picture from this browser. Forward goes to the list without Red.',
          on: {
            BROWSER_FORWARD: {target: 'redUndone'},
            RELOAD: {target: 'redBackAfterUndo'},
          },
        },
        asOpenedBeforeRed: {
          description: 'Back after the upload: the list as opened, Unranked empty. Forward goes to the list with Red.',
          on: {
            BROWSER_FORWARD: {target: 'redUnranked'},
            RELOAD: {target: 'asOpenedBeforeRed'},
          },
        },
        redUnranked: {
          description: 'Red in Unranked.',
          on: {
            RANK_RED: {target: 'redRanked'},
            BROWSER_BACK: {target: 'asOpenedBeforeRed'},
            RELOAD: {target: 'redUnranked'},
            OPEN_IN_NEW_BROWSER: {target: '#deviceImages.newBrowser.redUnranked'},
          },
        },
        redRanked: {
          description: 'Red in S after Mauga. Unranked is empty.',
          on: {
            UPLOAD_BLUE: {target: 'blueAdded'},
            RELOAD: {target: 'redRanked'},
            OPEN_IN_NEW_BROWSER: {target: '#deviceImages.newBrowser.redRanked'},
          },
        },
        blueAdded: {
          description: 'Red in S, Blue in Unranked. The toast “Items Added” says 1 item(s) have been added, with Undo, which removes Blue only.',
          on: {
            UNDO: {target: 'redRanked'},
            TOAST_TIMES_OUT: {target: 'redRankedBlueUnranked'},
            RELOAD: {target: 'redRankedBlueUnranked'},
          },
        },
        redRankedBlueUnranked: {
          description: 'Red in S, Blue in Unranked.',
          on: {
            RELOAD: {target: 'redRankedBlueUnranked'},
            OPEN_IN_NEW_BROWSER: {target: '#deviceImages.newBrowser.redRankedBlueUnranked'},
          },
        },
        lastList: {type: 'history', target: 'noImages'},
      },
    },
    newBrowser: {
      description: 'The same link in a new browser, which has none of the pictures. Each image shows the placeholder image with its name, in the same place. The first browser’s tab stays as it was.',
      initial: 'redUnranked',
      on: {CLOSE_NEW_BROWSER: {target: '#deviceImages.thisBrowser.lastList'}},
      states: {
        redUnranked: {description: 'Red in Unranked.'},
        redRanked: {description: 'Red in S after Mauga.'},
        redRankedBlueUnranked: {description: 'Red in S, Blue in Unranked.'},
      },
    },
  },
});
