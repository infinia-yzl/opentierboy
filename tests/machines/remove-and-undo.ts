import {createMachine} from 'xstate';

export const removeAndUndoMachine = createMachine({
  id: 'removeAndUndo',
  description: 'Removing items and the toast’s Undo, on a list opened from a link. Delete, Reset and Remove All each change the list as a new history entry and show a toast with Undo. Undo closes the toast and puts the list back as a new change, unless the list on screen already holds it, as after Back: then nothing changes. The toast closes by itself after 4 seconds (TOAST_TIMES_OUT), but not while the pointer rests on it. Back and Forward step between the versions. Each run makes one removal.',
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
      description: 'The version on screen, out of the versions in the tab’s history, and whether the toast offers Undo. Back from the list as opened leaves the editor, so the model does not take it. Forward on the latest version changes nothing.',
      initial: 'opened',
      states: {
        opened: {
          description: 'Version 1 of 1: the list as opened. No toast.',
          on: {
            DELETE_ITEM: {target: 'undoOffered.removed'},
            CHOOSE_RESET: {target: 'undoOffered.removed'},
            OPEN_REMOVE_ALL: {target: 'confirming'},
          },
        },
        confirming: {
          description: 'The dialog “Are you sure?” over the list as opened.',
          on: {
            CONFIRM_REMOVE_ALL: {target: 'undoOffered.removed'},
            CANCEL_REMOVE_ALL: {target: 'opened'},
          },
        },
        undoOffered: {
          description: 'The toast of the removal shows, with Undo. It stays over Back and Forward.',
          initial: 'removed',
          states: {
            removed: {
              description: 'Version 2 of 2: the list after the removal.',
              on: {
                CLICK_UNDO: {target: '#removeAndUndo.list.undone.restored'},
                BROWSER_BACK: {target: 'asOpened'},
                TOAST_TIMES_OUT: {target: '#removeAndUndo.list.toastClosed.removed'},
              },
            },
            asOpened: {
              description: 'Version 1 of 2: the list as opened.',
              on: {
                CLICK_UNDO: {target: '#removeAndUndo.list.toastClosed.asOpened'},
                BROWSER_FORWARD: {target: 'removed'},
                TOAST_TIMES_OUT: {target: '#removeAndUndo.list.toastClosed.asOpened'},
              },
            },
          },
        },
        toastClosed: {
          description: 'The toast closed and the list did not change: it timed out, or Undo was clicked on the list as opened, which already holds what it puts back (no change and no history entry).',
          initial: 'asOpened',
          states: {
            asOpened: {
              description: 'Version 1 of 2: the list as opened.',
              on: {BROWSER_FORWARD: {target: 'removed'}},
            },
            removed: {
              description: 'Version 2 of 2: the list after the removal.',
              on: {BROWSER_BACK: {target: 'asOpened'}},
            },
          },
        },
        undone: {
          description: 'Undo put the list back as a new change: a third history entry. The toast closed.',
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
