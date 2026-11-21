import {createMachine} from 'xstate';

export const historyMachine = createMachine({
  id: 'history',
  description: 'Browser history as the list’s undo, over four versions: the list as opened and three changes. Each change adds a version, Back and Forward step between versions, a change after Back drops the later versions, and the label settings add no version.',
  type: 'parallel',
  states: {
    list: {
      description: 'The version on screen, out of the versions in the tab’s history. Back from version 1 leaves the editor, so the model does not take it. Forward on the latest version changes nothing.',
      initial: 'version1of1',
      states: {
        version1of1: {
          description: 'Version 1 of 1: the list as opened, the only version.',
          on: {CHANGE_LIST: {target: 'version2of2'}},
        },
        version1of2: {
          description: 'Version 1 of 2, on screen and in the address. The tab’s history holds 2 versions, 1 later version for Forward.',
          on: {CHANGE_LIST: {target: 'version2of2'}, BROWSER_FORWARD: {target: 'version2of2'}},
        },
        version2of2: {
          description: 'Version 2 of 2: the latest version, on screen and in the address.',
          on: {CHANGE_LIST: {target: 'version3of3'}, BROWSER_BACK: {target: 'version1of2'}},
        },
        version1of3: {
          description: 'Version 1 of 3, on screen and in the address. The tab’s history holds 3 versions, 2 later versions for Forward.',
          on: {CHANGE_LIST: {target: 'version2of2'}, BROWSER_FORWARD: {target: 'version2of3'}},
        },
        version2of3: {
          description: 'Version 2 of 3, on screen and in the address. The tab’s history holds 3 versions, 1 later version for Forward.',
          on: {CHANGE_LIST: {target: 'version3of3'}, BROWSER_BACK: {target: 'version1of3'}, BROWSER_FORWARD: {target: 'version3of3'}},
        },
        version3of3: {
          description: 'Version 3 of 3: the latest version, on screen and in the address.',
          on: {CHANGE_LIST: {target: 'version4of4'}, BROWSER_BACK: {target: 'version2of3'}},
        },
        version1of4: {
          description: 'Version 1 of 4, on screen and in the address. The tab’s history holds 4 versions, 3 later versions for Forward.',
          on: {CHANGE_LIST: {target: 'version2of2'}, BROWSER_FORWARD: {target: 'version2of4'}},
        },
        version2of4: {
          description: 'Version 2 of 4, on screen and in the address. The tab’s history holds 4 versions, 2 later versions for Forward.',
          on: {CHANGE_LIST: {target: 'version3of3'}, BROWSER_BACK: {target: 'version1of4'}, BROWSER_FORWARD: {target: 'version3of4'}},
        },
        version3of4: {
          description: 'Version 3 of 4, on screen and in the address. The tab’s history holds 4 versions, 1 later version for Forward.',
          on: {CHANGE_LIST: {target: 'version4of4'}, BROWSER_BACK: {target: 'version2of4'}, BROWSER_FORWARD: {target: 'version4of4'}},
        },
        version4of4: {
          description: 'Version 4 of 4: the latest version, on screen and in the address.',
          on: {BROWSER_BACK: {target: 'version3of4'}},
        },
      },
    },
    labelPosition: {
      description: 'Row options › Label position. Back and Forward keep it as it is on screen.',
      initial: 'left',
      states: {
        left: {description: 'Tier labels on the left of their rows.', on: {CHOOSE_TOP: {target: 'top'}}},
        top: {description: 'Tier labels above their rows.', on: {CHOOSE_LEFT: {target: 'left'}}},
      },
    },
    itemLabels: {
      description: 'Row options › Item labels. Back and Forward keep it as it is on screen.',
      initial: 'shown',
      states: {
        shown: {description: 'Each tile shows its name.', on: {HIDE_ITEM_LABELS: {target: 'hidden'}}},
        hidden: {description: 'The tiles show no names.', on: {SHOW_ITEM_LABELS: {target: 'shown'}}},
      },
    },
  },
});
