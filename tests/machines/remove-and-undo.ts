import {createMachine} from 'xstate';

export const removeAndUndoMachine = createMachine({
  id: 'removeAndUndo',
  description: 'Removing items and the toast’s Undo, on a list opened from a link. Delete, Reset and Remove All each change the list as a new history entry and show a toast with Undo. Undo, clicked right after the removal, puts the list back as a new change. How long the toast stays is up to the toast library, so the model clicks Undo straight away or leaves the toast alone. Back and Forward step between the versions. Each run makes one removal.',
  type: 'parallel',
  states: {
    removal: {
      description: 'The removal of this run: what the toast says, and what the list lacks after it.',
      initial: 'none',
      states: {
        none: {
          description: 'Nothing removed yet.',
          on: {
            DELETE_ITEM: {target: 'oneItemDeleted'},
            CHOOSE_RESET: {target: 'itemsReset'},
            OPEN_REMOVE_ALL: {target: 'removeAllAsked'},
          },
        },
        removeAllAsked: {
          description: 'Add images › Remove All asks first.',
          on: {
            CONFIRM_REMOVE_ALL: {target: 'allItemsRemoved'},
            CANCEL_REMOVE_ALL: {target: 'none'},
          },
        },
        oneItemDeleted: {
          description: 'Delete in the right-click menu of the first item of row S. The toast is “Item deleted”, and its Undo shows the toast “Item restored”.',
        },
        itemsReset: {
          description: 'Add images › Reset puts every item in Unranked, sorted by label. The toast is “Items Reset”.',
        },
        allItemsRemoved: {
          description: 'Add images › Remove All, confirmed, leaves no item. The toast is “All Items Deleted”.',
        },
      },
    },
    list: {
      description: 'The version on screen, out of the versions in the tab’s history. Back from the list as opened leaves the editor, so the model does not take it. Forward on the latest version changes nothing.',
      initial: 'opened',
      states: {
        opened: {
          description: 'Version 1 of 1: the list as opened. No toast.',
          on: {
            DELETE_ITEM: {target: 'undoOffered'},
            CHOOSE_RESET: {target: 'undoOffered'},
            OPEN_REMOVE_ALL: {target: 'confirming'},
          },
        },
        confirming: {
          description: 'The dialog “Are you sure?” over the list as opened.',
          on: {
            CONFIRM_REMOVE_ALL: {target: 'undoOffered'},
            CANCEL_REMOVE_ALL: {target: 'opened'},
          },
        },
        undoOffered: {
          description: 'Version 2 of 2: the list after the removal, right after it, with the toast of the removal and its Undo.',
          on: {
            CLICK_UNDO: {target: '#removeAndUndo.list.undone.restored'},
            BROWSER_BACK: {target: '#removeAndUndo.list.removed.asOpened'},
          },
        },
        removed: {
          description: 'The removal stays: Back and Forward step between the list as opened and the list after the removal.',
          initial: 'asOpened',
          states: {
            asOpened: {
              description: 'Version 1 of 2: the list as opened.',
              on: {BROWSER_FORWARD: {target: 'afterRemoval'}},
            },
            afterRemoval: {
              description: 'Version 2 of 2: the list after the removal.',
              on: {BROWSER_BACK: {target: 'asOpened'}},
            },
          },
        },
        undone: {
          description: 'Undo put the list back as a new change: a third history entry.',
          initial: 'restored',
          states: {
            restored: {
              description: 'Version 3 of 3: the items as opened, each at its old place.',
              on: {BROWSER_BACK: {target: 'removed'}},
            },
            removed: {
              description: 'Version 2 of 3: the list after the removal.',
              on: {BROWSER_BACK: {target: 'asOpened'}, BROWSER_FORWARD: {target: 'restored'}},
            },
            asOpened: {
              description: 'Version 1 of 3: the list as opened.',
              on: {BROWSER_FORWARD: {target: 'removed'}},
            },
          },
        },
      },
    },
  },
});
