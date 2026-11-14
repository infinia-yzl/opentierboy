import {createMachine} from 'xstate';

export const linkDialogMachine = createMachine({
  id: 'linkDialog',
  description: 'The dialog “Add an Image from a Link” (Add images › From a link). An address that fails the address check is refused at once. Any other address is checked by loading its image once: the page is busy and the button says “Checking the image…” until the image site answers, which it does when the test says so. A picture is added, and the dialog closes. An answer that is not a picture, a picture that is too large, or no answer within 10 seconds shows why, and “Add Anyway” adds the image as a tile with its name. Escape closes the dialog and adds nothing, also while the image is checked: a late answer then changes nothing. Each site is a trusted site, with one address: i.imgur.com has a picture, upload.wikimedia.org has a web page, and static.wikia.nocookie.net has a picture 8,193 pixels wide.',
  initial: 'closed',
  states: {
    closed: {
      description: 'The list: Mauga in row S and nothing in Unranked. The dialog is closed.',
      on: {OPEN_DIALOG: {target: 'open'}},
    },
    open: {
      description: 'The dialog is open. Escape closes it and adds nothing.',
      initial: 'empty',
      on: {CANCEL: {target: 'closed'}},
      states: {
        empty: {
          description: 'Both fields are empty, and no message shows: Add Item is off.',
          on: {
            ENTER_REFUSED_ADDRESS: {target: 'refused'},
            ENTER_PICTURE_ADDRESS: {target: 'checkingPicture'},
            ENTER_WEB_PAGE_ADDRESS: {target: 'checkingWebPage'},
            ENTER_LARGE_PICTURE_ADDRESS: {target: 'checkingLargePicture'},
          },
        },
        refused: {
          description: 'An address with the http scheme was submitted: the message asks for one that starts with https, the address is marked invalid, and Add Item is on. Nothing was loaded.',
          on: {ENTER_PICTURE_ADDRESS: {target: 'checkingPicture'}},
        },
        checkingPicture: {
          description: 'The page asked i.imgur.com for the picture, and the site has not answered: the page is busy, and the button says “Checking the image…” and is off.',
          on: {
            IMAGE_SITE_ANSWERS: {target: '#linkDialog.added.picture'},
            IMAGE_CHECK_TIMES_OUT: {target: 'timedOut'},
            CANCEL: {target: '#linkDialog.cancelledWhileChecking'},
          },
        },
        checkingWebPage: {
          description: 'The page asked upload.wikimedia.org for the image, and the site has not answered: the page is busy, and the button says “Checking the image…” and is off.',
          on: {
            IMAGE_SITE_ANSWERS: {target: 'notAPicture'},
            CANCEL: {target: '#linkDialog.cancelledWhileChecking'},
          },
        },
        checkingLargePicture: {
          description: 'The page asked static.wikia.nocookie.net for the image, and the site has not answered: the page is busy, and the button says “Checking the image…” and is off.',
          on: {
            IMAGE_SITE_ANSWERS: {target: 'tooLarge'},
            CANCEL: {target: '#linkDialog.cancelledWhileChecking'},
          },
        },
        notAPicture: {
          description: 'The site answered with a web page: the message says the image did not load, and that it can be added anyway. The button says “Add Anyway”.',
          on: {ADD_ANYWAY: {target: '#linkDialog.added.webPageTile'}},
        },
        tooLarge: {
          description: 'The site answered with a picture wider than 8,192 pixels: the message says the image is too large. The button says “Add Anyway”.',
          on: {ADD_ANYWAY: {target: '#linkDialog.added.largePictureTile'}},
        },
        timedOut: {
          description: 'The site had not answered after 10 seconds, so the page gave up: the message says the image took too long. A late answer changes nothing. The button says “Add Anyway”.',
          on: {ADD_ANYWAY: {target: '#linkDialog.added.picture'}},
        },
      },
    },
    cancelledWhileChecking: {
      description: 'Escape closed the dialog while the image was checked: nothing was added, and the page is no longer busy, though the site still holds its answer.',
      on: {IMAGE_SITE_ANSWERS: {target: 'closed'}},
    },
    added: {
      description: 'The dialog closed, and the image is the one item in Unranked.',
      initial: 'picture',
      states: {
        picture: {description: 'Green, from i.imgur.com, shows its picture.'},
        webPageTile: {description: 'Broken, from upload.wikimedia.org, is a tile with its name and its site, without a picture.'},
        largePictureTile: {description: 'Huge, from static.wikia.nocookie.net, is a tile with its name and its site, without a picture.'},
      },
    },
  },
});
