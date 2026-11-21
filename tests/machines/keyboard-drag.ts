import {createMachine} from 'xstate';

export const keyboardDragMachine = createMachine({
  id: 'keyboardDrag',
  description: 'One tile, Mauga, moved with the keyboard in a list of rows S and A and the Unranked tray. Space or Enter picks the focused tile up, Up and Down move it one row, Space or Enter drops it and Escape cancels. Each step is read out by row label and item name. Only a drop that moves the tile changes the list: a new link and one new history entry. Between moves of the tile, row S moves whole with the keyboard by its grip (Space, Down or Up, Space), name and items, and focus goes back to the tile: the order of the rows changes, and so do the rows that Up and Down reach.',
  initial: 'sFirst',
  states: {
    sFirst: {
      description: 'Row S, then row A, then the Unranked tray.',
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
                PRESS_SPACE: {target: '#keyboardDrag.sFirst.carrying.fromS.pickedUp'},
                PRESS_ENTER: {target: '#keyboardDrag.sFirst.carrying.fromS.pickedUp'},
                MOVE_ROW_S_DOWN: {target: '#keyboardDrag.aFirst.resting.inS.rowDown'},
              },
              states: {
                dropped: {description: 'Heard: “Dropped Mauga in row S, position 1 of 1.”'},
                stayed: {description: 'Heard: “Dropped Mauga. It stays in row S, position 1 of 1.”'},
                cancelled: {description: 'Heard: “Move cancelled. Mauga is back in row S, position 1 of 1.”'},
                rowUp: {description: 'Row S was moved up by its grip, and focus went back to Mauga. Heard: “Dropped row S at position 1 of 2.”'},
              },
            },
            inA: {
              description: 'Mauga rests in row A.',
              initial: 'dropped',
              on: {
                PRESS_SPACE: {target: '#keyboardDrag.sFirst.carrying.fromA.pickedUp'},
                PRESS_ENTER: {target: '#keyboardDrag.sFirst.carrying.fromA.pickedUp'},
                MOVE_ROW_S_DOWN: {target: '#keyboardDrag.aFirst.resting.inA.rowDown'},
              },
              states: {
                dropped: {description: 'Heard: “Dropped Mauga in row A, position 1 of 1.”'},
                stayed: {description: 'Heard: “Dropped Mauga. It stays in row A, position 1 of 1.”'},
                cancelled: {description: 'Heard: “Move cancelled. Mauga is back in row A, position 1 of 1.”'},
                rowUp: {description: 'Row S was moved up by its grip, and focus went back to Mauga. Heard: “Dropped row S at position 1 of 2.”'},
              },
            },
            inUnranked: {
              description: 'Mauga rests in the Unranked tray.',
              initial: 'opened',
              on: {
                PRESS_SPACE: {target: '#keyboardDrag.sFirst.carrying.fromUnranked.pickedUp'},
                PRESS_ENTER: {target: '#keyboardDrag.sFirst.carrying.fromUnranked.pickedUp'},
                MOVE_ROW_S_DOWN: {target: '#keyboardDrag.aFirst.resting.inUnranked.rowDown'},
              },
              states: {
                opened: {description: 'The list as opened. Nothing is heard yet.'},
                dropped: {description: 'Heard: “Dropped Mauga in Unranked, position 1 of 1.”'},
                stayed: {description: 'Heard: “Dropped Mauga. It stays in Unranked, position 1 of 1.”'},
                cancelled: {description: 'Heard: “Move cancelled. Mauga is back in Unranked, position 1 of 1.”'},
                rowUp: {description: 'Row S was moved up by its grip, and focus went back to Mauga. Heard: “Dropped row S at position 1 of 2.”'},
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
              on: {PRESS_ESCAPE: {target: '#keyboardDrag.sFirst.resting.inS.cancelled'}},
              states: {
                pickedUp: {
                  description: 'Heard: “Picked up Mauga, in row S, position 1 of 1.” Row S is the top row, so Up does nothing.',
                  on: {
                    PRESS_DOWN: {target: 'overA'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inS.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inS.stayed'},
                  },
                },
                overS: {
                  description: 'Back over row S. Heard: “Mauga is back in row S, position 1 of 1.” Row S is the top row, so Up does nothing.',
                  on: {
                    PRESS_DOWN: {target: 'overA'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inS.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inS.stayed'},
                  },
                },
                overA: {
                  description: 'Heard: “Mauga moves to row A, position 1 of 1.”',
                  on: {
                    PRESS_UP: {target: 'overS'},
                    PRESS_DOWN: {target: 'overUnranked'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inA.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inA.dropped'},
                  },
                },
                overUnranked: {
                  description: 'Heard: “Mauga moves to Unranked, position 1 of 1.” Unranked is the bottom row, so Down does nothing.',
                  on: {
                    PRESS_UP: {target: 'overA'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inUnranked.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inUnranked.dropped'},
                  },
                },
              },
            },
            fromA: {
              description: 'Picked up in row A.',
              initial: 'pickedUp',
              on: {PRESS_ESCAPE: {target: '#keyboardDrag.sFirst.resting.inA.cancelled'}},
              states: {
                pickedUp: {
                  description: 'Heard: “Picked up Mauga, in row A, position 1 of 1.”',
                  on: {
                    PRESS_UP: {target: 'overS'},
                    PRESS_DOWN: {target: 'overUnranked'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inA.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inA.stayed'},
                  },
                },
                overS: {
                  description: 'Heard: “Mauga moves to row S, position 1 of 1.” Row S is the top row, so Up does nothing.',
                  on: {
                    PRESS_DOWN: {target: 'overA'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inS.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inS.dropped'},
                  },
                },
                overA: {
                  description: 'Back over row A. Heard: “Mauga is back in row A, position 1 of 1.”',
                  on: {
                    PRESS_UP: {target: 'overS'},
                    PRESS_DOWN: {target: 'overUnranked'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inA.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inA.stayed'},
                  },
                },
                overUnranked: {
                  description: 'Heard: “Mauga moves to Unranked, position 1 of 1.” Unranked is the bottom row, so Down does nothing.',
                  on: {
                    PRESS_UP: {target: 'overA'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inUnranked.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inUnranked.dropped'},
                  },
                },
              },
            },
            fromUnranked: {
              description: 'Picked up in the Unranked tray.',
              initial: 'pickedUp',
              on: {PRESS_ESCAPE: {target: '#keyboardDrag.sFirst.resting.inUnranked.cancelled'}},
              states: {
                pickedUp: {
                  description: 'Heard: “Picked up Mauga, in Unranked, position 1 of 1.” Unranked is the bottom row, so Down does nothing.',
                  on: {
                    PRESS_UP: {target: 'overA'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inUnranked.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inUnranked.stayed'},
                  },
                },
                overS: {
                  description: 'Heard: “Mauga moves to row S, position 1 of 1.” Row S is the top row, so Up does nothing.',
                  on: {
                    PRESS_DOWN: {target: 'overA'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inS.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inS.dropped'},
                  },
                },
                overA: {
                  description: 'Heard: “Mauga moves to row A, position 1 of 1.”',
                  on: {
                    PRESS_UP: {target: 'overS'},
                    PRESS_DOWN: {target: 'overUnranked'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inA.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inA.dropped'},
                  },
                },
                overUnranked: {
                  description: 'Back over Unranked. Heard: “Mauga is back in Unranked, position 1 of 1.” Unranked is the bottom row, so Down does nothing.',
                  on: {
                    PRESS_UP: {target: 'overA'},
                    PRESS_SPACE: {target: '#keyboardDrag.sFirst.resting.inUnranked.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.sFirst.resting.inUnranked.stayed'},
                  },
                },
              },
            },
          },
        },
      },
    },
    aFirst: {
      description: 'Row A, then row S, then the Unranked tray: row S was moved down by its grip.',
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
                PRESS_SPACE: {target: '#keyboardDrag.aFirst.carrying.fromS.pickedUp'},
                PRESS_ENTER: {target: '#keyboardDrag.aFirst.carrying.fromS.pickedUp'},
                MOVE_ROW_S_UP: {target: '#keyboardDrag.sFirst.resting.inS.rowUp'},
              },
              states: {
                dropped: {description: 'Heard: “Dropped Mauga in row S, position 1 of 1.”'},
                stayed: {description: 'Heard: “Dropped Mauga. It stays in row S, position 1 of 1.”'},
                cancelled: {description: 'Heard: “Move cancelled. Mauga is back in row S, position 1 of 1.”'},
                rowDown: {description: 'Row S was moved down by its grip, and focus went back to Mauga. Heard: “Dropped row S at position 2 of 2.”'},
              },
            },
            inA: {
              description: 'Mauga rests in row A.',
              initial: 'dropped',
              on: {
                PRESS_SPACE: {target: '#keyboardDrag.aFirst.carrying.fromA.pickedUp'},
                PRESS_ENTER: {target: '#keyboardDrag.aFirst.carrying.fromA.pickedUp'},
                MOVE_ROW_S_UP: {target: '#keyboardDrag.sFirst.resting.inA.rowUp'},
              },
              states: {
                dropped: {description: 'Heard: “Dropped Mauga in row A, position 1 of 1.”'},
                stayed: {description: 'Heard: “Dropped Mauga. It stays in row A, position 1 of 1.”'},
                cancelled: {description: 'Heard: “Move cancelled. Mauga is back in row A, position 1 of 1.”'},
                rowDown: {description: 'Row S was moved down by its grip, and focus went back to Mauga. Heard: “Dropped row S at position 2 of 2.”'},
              },
            },
            inUnranked: {
              description: 'Mauga rests in the Unranked tray.',
              initial: 'dropped',
              on: {
                PRESS_SPACE: {target: '#keyboardDrag.aFirst.carrying.fromUnranked.pickedUp'},
                PRESS_ENTER: {target: '#keyboardDrag.aFirst.carrying.fromUnranked.pickedUp'},
                MOVE_ROW_S_UP: {target: '#keyboardDrag.sFirst.resting.inUnranked.rowUp'},
              },
              states: {
                dropped: {description: 'Heard: “Dropped Mauga in Unranked, position 1 of 1.”'},
                stayed: {description: 'Heard: “Dropped Mauga. It stays in Unranked, position 1 of 1.”'},
                cancelled: {description: 'Heard: “Move cancelled. Mauga is back in Unranked, position 1 of 1.”'},
                rowDown: {description: 'Row S was moved down by its grip, and focus went back to Mauga. Heard: “Dropped row S at position 2 of 2.”'},
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
              on: {PRESS_ESCAPE: {target: '#keyboardDrag.aFirst.resting.inS.cancelled'}},
              states: {
                pickedUp: {
                  description: 'Heard: “Picked up Mauga, in row S, position 1 of 1.”',
                  on: {
                    PRESS_UP: {target: 'overA'},
                    PRESS_DOWN: {target: 'overUnranked'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inS.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inS.stayed'},
                  },
                },
                overA: {
                  description: 'Heard: “Mauga moves to row A, position 1 of 1.” Row A is the top row, so Up does nothing.',
                  on: {
                    PRESS_DOWN: {target: 'overS'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inA.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inA.dropped'},
                  },
                },
                overS: {
                  description: 'Back over row S. Heard: “Mauga is back in row S, position 1 of 1.”',
                  on: {
                    PRESS_UP: {target: 'overA'},
                    PRESS_DOWN: {target: 'overUnranked'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inS.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inS.stayed'},
                  },
                },
                overUnranked: {
                  description: 'Heard: “Mauga moves to Unranked, position 1 of 1.” Unranked is the bottom row, so Down does nothing.',
                  on: {
                    PRESS_UP: {target: 'overS'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inUnranked.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inUnranked.dropped'},
                  },
                },
              },
            },
            fromA: {
              description: 'Picked up in row A.',
              initial: 'pickedUp',
              on: {PRESS_ESCAPE: {target: '#keyboardDrag.aFirst.resting.inA.cancelled'}},
              states: {
                pickedUp: {
                  description: 'Heard: “Picked up Mauga, in row A, position 1 of 1.” Row A is the top row, so Up does nothing.',
                  on: {
                    PRESS_DOWN: {target: 'overS'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inA.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inA.stayed'},
                  },
                },
                overA: {
                  description: 'Back over row A. Heard: “Mauga is back in row A, position 1 of 1.” Row A is the top row, so Up does nothing.',
                  on: {
                    PRESS_DOWN: {target: 'overS'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inA.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inA.stayed'},
                  },
                },
                overS: {
                  description: 'Heard: “Mauga moves to row S, position 1 of 1.”',
                  on: {
                    PRESS_UP: {target: 'overA'},
                    PRESS_DOWN: {target: 'overUnranked'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inS.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inS.dropped'},
                  },
                },
                overUnranked: {
                  description: 'Heard: “Mauga moves to Unranked, position 1 of 1.” Unranked is the bottom row, so Down does nothing.',
                  on: {
                    PRESS_UP: {target: 'overS'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inUnranked.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inUnranked.dropped'},
                  },
                },
              },
            },
            fromUnranked: {
              description: 'Picked up in the Unranked tray.',
              initial: 'pickedUp',
              on: {PRESS_ESCAPE: {target: '#keyboardDrag.aFirst.resting.inUnranked.cancelled'}},
              states: {
                pickedUp: {
                  description: 'Heard: “Picked up Mauga, in Unranked, position 1 of 1.” Unranked is the bottom row, so Down does nothing.',
                  on: {
                    PRESS_UP: {target: 'overS'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inUnranked.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inUnranked.stayed'},
                  },
                },
                overA: {
                  description: 'Heard: “Mauga moves to row A, position 1 of 1.” Row A is the top row, so Up does nothing.',
                  on: {
                    PRESS_DOWN: {target: 'overS'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inA.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inA.dropped'},
                  },
                },
                overS: {
                  description: 'Heard: “Mauga moves to row S, position 1 of 1.”',
                  on: {
                    PRESS_UP: {target: 'overA'},
                    PRESS_DOWN: {target: 'overUnranked'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inS.dropped'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inS.dropped'},
                  },
                },
                overUnranked: {
                  description: 'Back over Unranked. Heard: “Mauga is back in Unranked, position 1 of 1.” Unranked is the bottom row, so Down does nothing.',
                  on: {
                    PRESS_UP: {target: 'overS'},
                    PRESS_SPACE: {target: '#keyboardDrag.aFirst.resting.inUnranked.stayed'},
                    PRESS_ENTER: {target: '#keyboardDrag.aFirst.resting.inUnranked.stayed'},
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});
