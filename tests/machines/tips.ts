import {createMachine} from 'xstate';

export const tipsMachine = createMachine({
  id: 'tips',
  description: 'The first-drag tip and the link-save and device-images toasts of a new browser on a template. One tip shows at a time and the others wait for it. A tip that ended is seen and does not return. Hide tips turns the tips off, and About’s “Show the tips again” turns them on.',
  initial: 'editor',
  states: {
    editor: {
      initial: 'firstDragTip',
      on: {SHOW_TIPS_AGAIN: {target: 'about'}},
      states: {
        firstDragTip: {
          description: 'Nothing is seen yet. The tip in the Unranked tray asks for the first drag into a row.',
          initial: 'nothingWaits',
          on: {
            HIDE_TIPS: {target: 'tipsOff'},
            OPEN_TEMPLATE: {target: '.nothingWaits'},
          },
          states: {
            nothingWaits: {
              on: {
                CHANGE_TITLE: {target: 'linkSaveWaits'},
                ADD_DEVICE_IMAGE: {target: 'linkSaveAndDeviceImagesWait'},
                DROP_IN_ROW: {target: '#tips.editor.linkSaveToast.nothingWaits'},
                CLOSE_TIP: {target: '#tips.editor.noTip.firstDragSeen'},
              },
            },
            linkSaveWaits: {
              on: {
                ADD_DEVICE_IMAGE: {target: 'linkSaveAndDeviceImagesWait'},
                DROP_IN_ROW: {target: '#tips.editor.linkSaveToast.nothingWaits'},
                CLOSE_TIP: {target: '#tips.editor.linkSaveToast.nothingWaits'},
              },
            },
            linkSaveAndDeviceImagesWait: {
              on: {
                DROP_IN_ROW: {target: '#tips.editor.linkSaveToast.deviceImagesWaits'},
                CLOSE_TIP: {target: '#tips.editor.linkSaveToast.deviceImagesWaits'},
              },
            },
          },
        },
        linkSaveToast: {
          description: 'The first-drag and link-save tips are seen. A toast ends by itself after 10 seconds, so the model makes no change to the list while a toast shows.',
          initial: 'nothingWaits',
          on: {
            HIDE_TIPS: {target: 'tipsOff'},
            OPEN_TEMPLATE: {target: 'noTip.linkSaveSeen'},
          },
          states: {
            nothingWaits: {
              on: {
                CLOSE_TOAST: {target: '#tips.editor.noTip.linkSaveSeen'},
                TOAST_TIMES_OUT: {target: '#tips.editor.noTip.linkSaveSeen'},
              },
            },
            deviceImagesWaits: {
              on: {
                CLOSE_TOAST: {target: '#tips.editor.deviceImagesToast'},
                TOAST_TIMES_OUT: {target: '#tips.editor.deviceImagesToast'},
              },
            },
          },
        },
        deviceImagesToast: {
          description: 'Every tip is seen.',
          on: {
            CLOSE_TOAST: {target: 'noTip.allSeen'},
            TOAST_TIMES_OUT: {target: 'noTip.allSeen'},
            HIDE_TIPS: {target: 'tipsOff'},
            OPEN_TEMPLATE: {target: 'noTip.allSeen'},
          },
        },
        noTip: {
          initial: 'firstDragSeen',
          states: {
            firstDragSeen: {
              description: 'The first-drag tip was closed without a drag.',
              on: {
                CHANGE_TITLE: {target: '#tips.editor.linkSaveToast.nothingWaits'},
                DROP_IN_ROW: {target: '#tips.editor.linkSaveToast.nothingWaits'},
                ADD_DEVICE_IMAGE: {target: '#tips.editor.linkSaveToast.deviceImagesWaits'},
              },
            },
            linkSaveSeen: {
              on: {ADD_DEVICE_IMAGE: {target: '#tips.editor.deviceImagesToast'}},
            },
            allSeen: {},
          },
        },
        tipsOff: {description: 'Hide tips turned every tip off.'},
      },
    },
    about: {
      description: 'About’s “Show the tips again” forgot every tip seen and turned the tips on.',
      on: {OPEN_TEMPLATE: {target: 'editor'}},
    },
  },
});
