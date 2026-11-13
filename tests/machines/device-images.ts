import {createMachine} from 'xstate';

export const deviceImagesMachine = createMachine({
  id: 'deviceImages',
  description: 'The life of two images from the device, Red and Blue, in a list with Mauga in S. Add images › From your device adds each image to Unranked, keeps its picture in this browser (IndexedDB) and writes only its id and name to the link. The toast “Items Added” offers Undo. A reload keeps the pictures. The same link in a new browser, which never had the pictures, shows the placeholder image with each name.',
  initial: 'thisBrowser',
  states: {
    thisBrowser: {
      description: 'The tab of the browser that added the images. Each image in the list shows its own picture.',
      initial: 'noImages',
      states: {
        noImages: {
          description: 'Mauga in S. Unranked is empty.',
          on: {
            UPLOAD_RED: {target: 'redAdded'},
            RELOAD: {target: 'noImages'},
          },
        },
        redAdded: {
          description: 'Red in Unranked. The toast “Items Added” says 1 item(s) have been added, with Undo.',
          on: {
            UNDO: {target: 'noImages'},
            TOAST_TIMES_OUT: {target: 'redUnranked'},
            RELOAD: {target: 'redUnranked'},
          },
        },
        redUnranked: {
          description: 'Red in Unranked.',
          on: {
            RANK_RED: {target: 'redRanked'},
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
