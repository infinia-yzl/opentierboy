import {createMachine} from 'xstate';

export const keyboardDragMachine = createMachine({
  id: 'keyboardDrag',
  description: 'One tile, Mauga, moved with the keyboard in a list of rows S and A and the Unranked tray. Space or Enter picks the focused tile up, Up and Down move it one row, Space or Enter drops it and Escape cancels. Each step is read out by row label and item name. Only a drop that moves the tile changes the list: a new link and one new history entry.',
  initial: 'resting',
  states: {
    resting: {
      description: 'No tile is picked up. The rows and the link hold the tile in the same row. Up, Down and Escape do nothing.',
      initial: 'inUnranked',
      states: {
        inS: {
          description: 'Mauga rests in row S.',
          initial: 'dropped',
          on: {
            PRESS_SPACE: {target: '#keyboardDrag.carrying.fromS.pickedUp'},
            PRESS_ENTER: {target: '#keyboardDrag.carrying.fromS.pickedUp'},
          },
          states: {
            dropped: {description: 'Heard: “Dropped Mauga in tier S, position 1 of 1.”'},
            stayed: {description: 'Heard: “Dropped Mauga. It stays in tier S, position 1 of 1.”'},
            cancelled: {description: 'Heard: “Move cancelled. Mauga is back in tier S, position 1 of 1.”'},
          },
        },
        inA: {
          description: 'Mauga rests in row A.',
          initial: 'dropped',
          on: {
            PRESS_SPACE: {target: '#keyboardDrag.carrying.fromA.pickedUp'},
            PRESS_ENTER: {target: '#keyboardDrag.carrying.fromA.pickedUp'},
          },
          states: {
            dropped: {description: 'Heard: “Dropped Mauga in tier A, position 1 of 1.”'},
            stayed: {description: 'Heard: “Dropped Mauga. It stays in tier A, position 1 of 1.”'},
            cancelled: {description: 'Heard: “Move cancelled. Mauga is back in tier A, position 1 of 1.”'},
          },
        },
        inUnranked: {
          description: 'Mauga rests in the Unranked tray.',
          initial: 'opened',
          on: {
            PRESS_SPACE: {target: '#keyboardDrag.carrying.fromUnranked.pickedUp'},
            PRESS_ENTER: {target: '#keyboardDrag.carrying.fromUnranked.pickedUp'},
          },
          states: {
            opened: {description: 'The list as opened. Nothing is heard yet.'},
            dropped: {description: 'Heard: “Dropped Mauga in Unranked, position 1 of 1.”'},
            stayed: {description: 'Heard: “Dropped Mauga. It stays in Unranked, position 1 of 1.”'},
            cancelled: {description: 'Heard: “Move cancelled. Mauga is back in Unranked, position 1 of 1.”'},
          },
        },
      },
    },
    carrying: {
      description: 'Mauga is picked up. The rows show where it would land. The list and its link stay as they were until the drop.',
      initial: 'fromUnranked',
      states: {
        fromS: {
          description: 'Picked up in row S.',
          initial: 'pickedUp',
          on: {PRESS_ESCAPE: {target: '#keyboardDrag.resting.inS.cancelled'}},
          states: {
            pickedUp: {
              description: 'Heard: “Picked up Mauga, in tier S, position 1 of 1.” Row S is the top row, so Up does nothing.',
              on: {
                PRESS_DOWN: {target: 'overA'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inS.stayed'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inS.stayed'},
              },
            },
            overS: {
              description: 'Back over row S. Heard: “Mauga is back in tier S, position 1 of 1.” Up does nothing.',
              on: {
                PRESS_DOWN: {target: 'overA'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inS.stayed'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inS.stayed'},
              },
            },
            overA: {
              description: 'Heard: “Mauga moves to tier A, position 1 of 1.”',
              on: {
                PRESS_UP: {target: 'overS'},
                PRESS_DOWN: {target: 'overUnranked'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inA.dropped'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inA.dropped'},
              },
            },
            overUnranked: {
              description: 'Heard: “Mauga moves to Unranked, position 1 of 1.” Unranked is the bottom row, so Down does nothing.',
              on: {
                PRESS_UP: {target: 'overA'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inUnranked.dropped'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inUnranked.dropped'},
              },
            },
          },
        },
        fromA: {
          description: 'Picked up in row A.',
          initial: 'pickedUp',
          on: {PRESS_ESCAPE: {target: '#keyboardDrag.resting.inA.cancelled'}},
          states: {
            pickedUp: {
              description: 'Heard: “Picked up Mauga, in tier A, position 1 of 1.”',
              on: {
                PRESS_UP: {target: 'overS'},
                PRESS_DOWN: {target: 'overUnranked'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inA.stayed'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inA.stayed'},
              },
            },
            overS: {
              description: 'Heard: “Mauga moves to tier S, position 1 of 1.” Up does nothing.',
              on: {
                PRESS_DOWN: {target: 'overA'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inS.dropped'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inS.dropped'},
              },
            },
            overA: {
              description: 'Back over row A. Heard: “Mauga is back in tier A, position 1 of 1.”',
              on: {
                PRESS_UP: {target: 'overS'},
                PRESS_DOWN: {target: 'overUnranked'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inA.stayed'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inA.stayed'},
              },
            },
            overUnranked: {
              description: 'Heard: “Mauga moves to Unranked, position 1 of 1.” Down does nothing.',
              on: {
                PRESS_UP: {target: 'overA'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inUnranked.dropped'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inUnranked.dropped'},
              },
            },
          },
        },
        fromUnranked: {
          description: 'Picked up in the Unranked tray.',
          initial: 'pickedUp',
          on: {PRESS_ESCAPE: {target: '#keyboardDrag.resting.inUnranked.cancelled'}},
          states: {
            pickedUp: {
              description: 'Heard: “Picked up Mauga, in Unranked, position 1 of 1.” Unranked is the bottom row, so Down does nothing.',
              on: {
                PRESS_UP: {target: 'overA'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inUnranked.stayed'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inUnranked.stayed'},
              },
            },
            overS: {
              description: 'Heard: “Mauga moves to tier S, position 1 of 1.” Up does nothing.',
              on: {
                PRESS_DOWN: {target: 'overA'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inS.dropped'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inS.dropped'},
              },
            },
            overA: {
              description: 'Heard: “Mauga moves to tier A, position 1 of 1.”',
              on: {
                PRESS_UP: {target: 'overS'},
                PRESS_DOWN: {target: 'overUnranked'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inA.dropped'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inA.dropped'},
              },
            },
            overUnranked: {
              description: 'Back over Unranked. Heard: “Mauga is back in Unranked, position 1 of 1.” Down does nothing.',
              on: {
                PRESS_UP: {target: 'overA'},
                PRESS_SPACE: {target: '#keyboardDrag.resting.inUnranked.stayed'},
                PRESS_ENTER: {target: '#keyboardDrag.resting.inUnranked.stayed'},
              },
            },
          },
        },
      },
    },
  },
});
