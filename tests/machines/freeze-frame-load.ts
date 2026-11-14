import {createMachine} from 'xstate';

export const freezeFrameLoadMachine = createMachine({
  id: 'freezeFrameLoad',
  description: 'A Freeze Frame file on its way: made in the editor, downloaded, and opened again. The list “Mixed bag” holds Mauga and Winston from OVERWATCH, a picture from the device, an image from i.imgur.com (a trusted site) and one from images.example.org (a site OpenTierBoy does not know, loaded for this page). The file opens in the same browser, from the editor or from Home, and in a new browser that never held the picture. Open list adds one Back step, unless the address shows that list already. The file must exist before it can be opened, so every walk starts with the same two steps, Capture Preview and Download; the choices come after them.',
  initial: 'sameBrowser',
  states: {
    sameBrowser: {
      description: 'The browser that made the list. Its device store holds the picture under the id the file names, so opening the file here stores nothing new and keeps the file’s own link.',
      initial: 'editor',
      states: {
        editor: {
          description: 'The editor of the browser that made the list.',
          initial: 'listMade',
          states: {
            listMade: {
              description: 'The editor shows Mixed bag, every image loaded. The visitor clicked Load in the notice, so images.example.org loads on this page.',
              on: {CAPTURE_PREVIEW: {target: 'captured'}},
            },
            captured: {
              description: 'The Image tab of the Share panel shows the captured picture and Download.',
              on: {DOWNLOAD: {target: 'fileSaved'}},
            },
            fileSaved: {
              description: 'Download saved the file with the list inside, and the panel closed. The editor still shows Mixed bag, the list in the file.',
              on: {
                OPEN_FILE_IN_EDITOR: {target: 'askingOverSameList'},
                CHANGE_TITLE: {target: 'listChanged'},
                GO_HOME: {target: '#freezeFrameLoad.sameBrowser.home'},
                OPEN_NEW_BROWSER: {target: '#freezeFrameLoad.newBrowser'},
              },
            },
            askingOverSameList: {
              description: 'The dialog asks “Open the list in this file? Your current list stays one Back step away.” over Mixed bag.',
              on: {
                CANCEL: {target: 'fileSaved'},
                OPEN_LIST: {target: 'fileSaved'},
              },
            },
            listChanged: {
              description: 'The title is now Changed later. The rest of the list is as in the file.',
              on: {OPEN_FILE_IN_EDITOR: {target: 'askingOverChangedList'}},
            },
            askingOverChangedList: {
              description: 'The dialog asks “Open the list in this file? Your current list stays one Back step away.” over Changed later.',
              on: {
                CANCEL: {target: 'listChanged'},
                OPEN_LIST: {target: 'fileList'},
              },
            },
            fileList: {
              description: 'The list in the file, Mixed bag, at the file’s own link. Every image loads: the picture from this browser’s store, and images.example.org because this page still allows it.',
              on: {BROWSER_BACK: {target: 'listChanged'}},
            },
          },
        },
        home: {
          description: 'The landing page of the same browser, and the editor it opens.',
          initial: 'landing',
          states: {
            landing: {
              description: 'The landing page, with Open a Freeze Frame in Your own list.',
              on: {OPEN_FILE_ON_HOME: {target: 'asking'}},
            },
            asking: {
              description: 'The dialog asks “Open the list in this file? This page stays one Back step away.”',
              on: {
                CANCEL: {target: 'landing'},
                OPEN_LIST: {target: 'fileList'},
              },
            },
            fileList: {
              description: 'The editor shows Mixed bag at the file’s own link, with the picture from this browser’s store. The new page has not allowed images.example.org: its image waits behind the notice.',
              on: {BROWSER_BACK: {target: 'landing'}},
            },
          },
        },
      },
    },
    newBrowser: {
      description: 'Another browser, with nothing stored: the picture is not in its device store and no site is allowed.',
      initial: 'blankList',
      states: {
        blankList: {
          description: 'The editor at /rank with the blank list.',
          on: {OPEN_FILE_IN_EDITOR: {target: 'asking'}},
        },
        asking: {
          description: 'The dialog asks “Open the list in this file? Your current list stays one Back step away.” over the blank list.',
          on: {
            CANCEL: {target: 'blankList'},
            OPEN_LIST: {target: 'fileList'},
          },
        },
        fileList: {
          description: 'The editor shows Mixed bag. The picture comes from the file, drawn again and stored under a new snap- id, so the link names that id. The image from i.imgur.com loads.',
          initial: 'otherSiteWaits',
          on: {BROWSER_BACK: {target: 'blankList'}},
          states: {
            otherSiteWaits: {
              description: 'The notice lists images.example.org, and its image shows as a label tile. A reload shows the same.',
              on: {
                LOAD_IMAGES: {target: 'otherSiteLoads'},
                RELOAD: {target: 'otherSiteWaits'},
              },
            },
            otherSiteLoads: {
              description: 'Load allowed images.example.org for this page: no notice, and its image loads. A reload forgets it, and keeps the picture.',
              on: {RELOAD: {target: 'otherSiteWaits'}},
            },
          },
        },
      },
    },
  },
});
