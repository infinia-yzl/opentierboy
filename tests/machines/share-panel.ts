import {createMachine} from 'xstate';

export const sharePanelMachine = createMachine({
  id: 'sharePanel',
  description: 'The Share panel of the editor, the clipboard that Copy Markdown fills, the Freeze Frame picture that Capture Preview takes, and the device image that the panel’s note counts. The panel opens on the URL tab each time. The copied link and the picture hold the list as it was when they were made: a device image added later is in neither. A picture stays until the page reloads, so the Image tab shows it again after the panel closes and opens.',
  type: 'parallel',
  states: {
    panel: {
      description: 'The panel is a popover under the Share button. It has no close button: the Share button, Escape and a click outside it close it.',
      initial: 'closed',
      states: {
        closed: {
          description: 'Only the Share button shows.',
          on: {OPEN_SHARE_PANEL: {target: 'open'}},
        },
        open: {
          description: 'The panel “Share Your Rankings” with the tabs URL and Image.',
          initial: 'urlTab',
          on: {
            CLOSE_WITH_SHARE_BUTTON: {target: 'closed'},
            PRESS_ESCAPE: {target: 'closed'},
            CLICK_OUTSIDE: {target: 'closed'},
          },
          states: {
            urlTab: {
              description: 'The URL tab: Copy Markdown, and the Facebook and X buttons.',
              on: {CHOOSE_IMAGE_TAB: {target: 'imageTab'}},
            },
            imageTab: {
              description: 'The Image tab (Freeze Frame): Frame, Capture Preview and Options. With a picture, it shows the picture with Copy Image and Download; without one, “Capture an image to get started.”',
              on: {CHOOSE_URL_TAB: {target: 'urlTab'}},
            },
          },
        },
      },
    },
    picture: {
      description: 'The picture that Capture Preview took, in the Image tab, and the list it shows. Download saves the picture with that list inside.',
      initial: 'none',
      states: {
        none: {
          description: 'No picture yet.',
          on: {CAPTURE_PREVIEW: {target: 'thisList'}},
        },
        thisList: {
          description: 'The picture shows the list on screen. Download saves that list.',
          on: {
            CAPTURE_PREVIEW: {target: 'thisList'},
            DOWNLOAD: {target: 'thisList'},
            ADD_DEVICE_IMAGE: {target: 'listBefore'},
          },
        },
        listBefore: {
          description: 'The picture was taken before the device image was added. Download saves the list as it was then, without the device image. Capture Preview takes a new picture of the list on screen.',
          on: {
            CAPTURE_PREVIEW: {target: 'thisList'},
            DOWNLOAD: {target: 'listBefore'},
          },
        },
      },
    },
    clipboard: {
      description: 'What Copy Markdown wrote to the clipboard: the Markdown share text with the link of the list on screen, from the editor’s own copy of the list (A46).',
      initial: 'empty',
      states: {
        empty: {
          description: 'Nothing was copied.',
          on: {COPY_MARKDOWN: {target: 'thisList'}},
        },
        thisList: {
          description: 'The link of the list on screen.',
          on: {
            COPY_MARKDOWN: {target: 'thisList'},
            ADD_DEVICE_IMAGE: {target: 'listBefore'},
          },
        },
        listBefore: {
          description: 'The link of the list before the device image was added. Copy Markdown copies the list on screen again.',
          on: {COPY_MARKDOWN: {target: 'thisList'}},
        },
      },
    },
    deviceImages: {
      description: 'Images added from the device, with the panel closed. The panel says how many show as placeholders for others. The model adds one.',
      initial: 'none',
      states: {
        none: {
          description: 'The list holds only image-set items: the panel shows no note.',
          on: {ADD_DEVICE_IMAGE: {target: 'one'}},
        },
        one: {description: 'The note “1 device image shows as a placeholder.”'},
      },
    },
  },
});
