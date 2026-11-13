import {createMachine} from 'xstate';

export const sharePanelMachine = createMachine({
  id: 'sharePanel',
  description: 'The Share panel of the editor, the clipboard that Copy Markdown fills, and the device images that the panel’s note counts. The panel opens on the URL tab each time. A Freeze Frame capture stays until the page reloads, so the Image tab shows it again after the panel closes and opens.',
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
              on: {CHOOSE_IMAGE_TAB: {target: 'imageTab.lastCapture'}},
            },
            imageTab: {
              description: 'The Image tab (Freeze Frame): Frame, Capture Preview and Options.',
              initial: 'noCapture',
              on: {CHOOSE_URL_TAB: {target: '#sharePanel.panel.open.urlTab'}},
              states: {
                noCapture: {
                  description: 'No picture yet: “Capture an image to get started.”',
                  on: {CAPTURE_PREVIEW: {target: 'captured'}},
                },
                captured: {
                  description: 'The captured picture, with Copy Image and Download. Capture Preview takes a new picture, and Download saves it with the list inside.',
                  on: {
                    CAPTURE_PREVIEW: {target: 'captured'},
                    DOWNLOAD: {target: 'captured'},
                  },
                },
                lastCapture: {type: 'history', target: 'noCapture'},
              },
            },
          },
        },
      },
    },
    clipboard: {
      description: 'What Copy Markdown wrote to the clipboard.',
      initial: 'empty',
      states: {
        empty: {on: {COPY_MARKDOWN: {target: 'holdsLink'}}},
        holdsLink: {
          description: 'The Markdown share text with the link of this page.',
          on: {COPY_MARKDOWN: {target: 'holdsLink'}},
        },
      },
    },
    deviceImages: {
      description: 'Images added from the device. The panel says how many are not in the link.',
      initial: 'none',
      states: {
        none: {
          description: 'The list holds only image-set items: the panel shows no note.',
          on: {ADD_DEVICE_IMAGE: {target: 'one'}},
        },
        one: {description: 'The note “1 image from your device isn’t in the link.”'},
      },
    },
  },
});
