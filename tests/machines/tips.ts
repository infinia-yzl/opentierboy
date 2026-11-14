import {createMachine} from 'xstate';

export const tipsMachine = createMachine({
  id: 'tips',
  description: 'The first-drag tip and the link-save and device-images toasts of a new browser on a template. One tip shows at a time: a tip that becomes useful while another shows waits for it, also while a toast shows. A tip that ended is seen and does not return. A toast ends by itself after 10 seconds (TOAST_TIMES_OUT). Hide tips turns the tips off, and About’s “Show the tips again” turns them on.',
  initial: 'editor',
  states: {
    editor: {
      description: 'The editor, opened on the OVERWATCH Tank template with its 13 tanks in Unranked.',
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
              description: 'No other tip waits.',
              on: {
                CHANGE_TITLE: {target: 'linkSaveWaits'},
                ADD_DEVICE_IMAGE: {target: 'linkSaveAndDeviceImagesWait'},
                DROP_IN_ROW: {target: '#tips.editor.linkSaveToast.nothingWaits'},
                CLOSE_TIP: {target: '#tips.editor.noTip.firstDragSeen'},
              },
            },
            linkSaveWaits: {
              description: 'The title changed: the link-save toast waits for this tip.',
              on: {
                ADD_DEVICE_IMAGE: {target: 'linkSaveAndDeviceImagesWait'},
                DROP_IN_ROW: {target: '#tips.editor.linkSaveToast.nothingWaits'},
                CLOSE_TIP: {target: '#tips.editor.linkSaveToast.nothingWaits'},
              },
            },
            linkSaveAndDeviceImagesWait: {
              description: 'An image from the device was added: the link-save toast and then the device-images toast wait for this tip.',
              on: {
                DROP_IN_ROW: {target: '#tips.editor.linkSaveToast.deviceImagesWaits'},
                CLOSE_TIP: {target: '#tips.editor.linkSaveToast.deviceImagesWaits'},
              },
            },
          },
        },
        linkSaveToast: {
          description: 'The link-save toast shows. The first-drag and link-save tips are seen. A drop or a new title changes no tip.',
          initial: 'nothingWaits',
          on: {
            HIDE_TIPS: {target: 'tipsOff'},
            OPEN_TEMPLATE: {target: 'noTip.linkSaveSeen'},
          },
          states: {
            nothingWaits: {
              description: 'No other tip waits.',
              on: {
                ADD_DEVICE_IMAGE: {target: 'deviceImagesWaits'},
                CLOSE_TOAST: {target: '#tips.editor.noTip.linkSaveSeen'},
                TOAST_TIMES_OUT: {target: '#tips.editor.noTip.linkSaveSeen'},
              },
            },
            deviceImagesWaits: {
              description: 'An image from the device was added: the device-images toast waits for this one. Another image changes nothing.',
              on: {
                CLOSE_TOAST: {target: '#tips.editor.deviceImagesToast'},
                TOAST_TIMES_OUT: {target: '#tips.editor.deviceImagesToast'},
              },
            },
          },
        },
        deviceImagesToast: {
          description: 'The device-images toast shows. Every tip is seen, so a change shows no other tip.',
          on: {
            CLOSE_TOAST: {target: 'noTip.allSeen'},
            TOAST_TIMES_OUT: {target: 'noTip.allSeen'},
            HIDE_TIPS: {target: 'tipsOff'},
            OPEN_TEMPLATE: {target: 'noTip.allSeen'},
          },
        },
        noTip: {
          description: 'No tip shows.',
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
              description: 'The first-drag and link-save tips are seen. A drop or a new title shows no tip.',
              on: {ADD_DEVICE_IMAGE: {target: '#tips.editor.deviceImagesToast'}},
            },
            allSeen: {description: 'Every tip is seen: no change shows a tip.'},
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
