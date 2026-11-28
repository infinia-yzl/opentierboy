import {createMachine} from 'xstate';

export const sharePanelMachine = createMachine({
  id: 'sharePanel',
  description: 'The Share panel of the editor, the clipboard that Copy Markdown fills, the Freeze Frame picture that Capture Preview takes, and the device image that the panel’s note counts. The panel opens on the URL tab each time. A capture runs in three steps, and the Image tab lists them while it runs: the browser holds its answer for the encoded picture until the test lets it answer (ENCODER_ANSWERS). The copied link and the picture hold the list as it was when they were made: a device image added later is in neither. A picture stays until the page reloads, so the Image tab shows it again after the panel closes and opens. The list of this machine has no scribbles, so the URL tab has no group “Include scribbles” and no Copy link: the machine shareScribbles describes the panel of a list with scribbles.',
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
              description: 'The Image tab (Freeze Frame): Frame, Capture Preview and Options. With a picture, it shows the picture with Copy Image and Download; without one, “Capture an image to get started.” No capture runs, so the tab lists no capture steps.',
              on: {
                CHOOSE_URL_TAB: {target: 'urlTab'},
                CAPTURE_PREVIEW: {target: '#sharePanel.panel.capturing.imageTab'},
              },
            },
          },
        },
        capturing: {
          description: 'A capture runs: it has loaded its images and drawn the image, and waits for the browser to encode the picture. The Share button is disabled until the capture ends, so it neither closes nor opens the panel. The picture of an earlier capture stays until the new one is ready.',
          initial: 'imageTab',
          states: {
            imageTab: {
              description: 'The Image tab lists the three capture steps under “Freeze frame!”: “Loading images” and “Drawing the image” read Done, and “Saving the image” is the current step, “Step 3 of 3”. Capture Preview reads “Capturing...” and is disabled.',
              on: {
                ENCODER_ANSWERS: {target: '#sharePanel.panel.open.imageTab'},
                CHOOSE_URL_TAB: {target: 'urlTab'},
                PRESS_ESCAPE: {target: 'closed'},
                CLICK_OUTSIDE: {target: 'closed'},
              },
            },
            urlTab: {
              description: 'The URL tab, as without a capture. The capture goes on.',
              on: {
                ENCODER_ANSWERS: {target: '#sharePanel.panel.open.urlTab'},
                CHOOSE_IMAGE_TAB: {target: 'imageTab'},
                PRESS_ESCAPE: {target: 'closed'},
                CLICK_OUTSIDE: {target: 'closed'},
              },
            },
            closed: {
              description: 'The panel is closed and the capture goes on: the Share button shows, disabled.',
              on: {ENCODER_ANSWERS: {target: '#sharePanel.panel.closed'}},
            },
          },
        },
      },
    },
    picture: {
      description: 'The picture of the last capture that ended, in the Image tab, and the list it shows. Download saves the picture with that list inside.',
      initial: 'none',
      states: {
        none: {
          description: 'No picture yet.',
          on: {ENCODER_ANSWERS: {target: 'thisList'}},
        },
        thisList: {
          description: 'The picture shows the list on screen. Download saves that list.',
          on: {
            ENCODER_ANSWERS: {target: 'thisList'},
            DOWNLOAD: {target: 'thisList'},
            ADD_DEVICE_IMAGE: {target: 'listBefore'},
          },
        },
        listBefore: {
          description: 'The picture was taken before the device image was added. Download saves the list as it was then, without the device image. A capture that ends puts a new picture of the list on screen in its place.',
          on: {
            ENCODER_ANSWERS: {target: 'thisList'},
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
