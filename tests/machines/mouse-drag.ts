import {createMachine} from 'xstate';

export const mouseDragMachine = createMachine({
  id: 'mouseDrag',
  description: 'Ranking with the mouse in a list of rows S and A and the Unranked tray, with two tiles: Mauga, which the user drags, and Winston, which starts in row S and moves only with the items of his row. Each drag is one press, move and release. A tile dropped on the free space of another row goes to its end; dropped on the left or right half of Winston, it goes just before or just after him. Each ranked row has two handles. Its stack moves only its items: dropped on the other row, the contents swap and the labels stay where they are; an empty row\'s stack is off. Its grip moves the whole row, name and items: dropped on the other row, the two rows swap places, and the colours stay with the places. Each drop that changes the list writes a new link and one new history entry. A drop where the tile started, or a release outside the rows, changes nothing.',
  type: 'parallel',
  on: {
    DROP_MAUGA_IN_PLACE: {description: 'Mauga dropped where it started: the list, the link and the history stay as they are.'},
    RELEASE_MAUGA_OUTSIDE_ROWS: {description: 'Mauga released outside the rows: the list, the link and the history stay as they are.'},
  },
  states: {
    tiles: {
      description: 'Which row holds each tile, by the row labels. A grip drag moves a row with its label, so it changes nothing here.',
      initial: 'winstonInS',
      states: {
        winstonInS: {
          description: 'Winston is in row S.',
          initial: 'maugaInUnranked',
          states: {
            maugaInUnranked: {
              description: 'S: Winston. A: empty. Unranked: Mauga. Row A has no items, so its stack is off.',
              on: {
                DRAG_MAUGA_TO_S: {target: 'maugaLast'},
                DRAG_MAUGA_TO_A: {target: 'maugaInA'},
                DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
                DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
                DRAG_ITEMS_OF_S_ONTO_A: {target: '#mouseDrag.tiles.winstonInA.maugaInUnranked'},
              },
            },
            maugaInA: {
              description: 'S: Winston. A: Mauga. Unranked: empty.',
              on: {
                DRAG_MAUGA_TO_S: {target: 'maugaLast'},
                DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
                DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
                DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
                DRAG_ITEMS_OF_S_ONTO_A: {target: '#mouseDrag.tiles.winstonInA.maugaInS'},
                DRAG_ITEMS_OF_A_ONTO_S: {target: '#mouseDrag.tiles.winstonInA.maugaInS'},
              },
            },
            maugaFirst: {
              description: 'S: Mauga, Winston. A: empty. Unranked: empty. A drag along row S to its free space passes over Winston, so Mauga lands after him or stays first by the way the pointer went: the model leaves that drag out.',
              on: {
                DRAG_MAUGA_TO_A: {target: 'maugaInA'},
                DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
                DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
                DRAG_ITEMS_OF_S_ONTO_A: {target: '#mouseDrag.tiles.winstonInA.maugaFirst'},
              },
            },
            maugaLast: {
              description: 'S: Winston, Mauga. A: empty. Unranked: empty.',
              on: {
                DRAG_MAUGA_TO_A: {target: 'maugaInA'},
                DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
                DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
                DRAG_ITEMS_OF_S_ONTO_A: {target: '#mouseDrag.tiles.winstonInA.maugaLast'},
              },
            },
          },
        },
        winstonInA: {
          description: 'Winston is in row A: a drag of a row stack moved him there.',
          initial: 'maugaInUnranked',
          states: {
            maugaInUnranked: {
              description: 'S: empty. A: Winston. Unranked: Mauga. Row S has no items, so its stack is off.',
              on: {
                DRAG_MAUGA_TO_S: {target: 'maugaInS'},
                DRAG_MAUGA_TO_A: {target: 'maugaLast'},
                DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
                DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
                DRAG_ITEMS_OF_A_ONTO_S: {target: '#mouseDrag.tiles.winstonInS.maugaInUnranked'},
              },
            },
            maugaInS: {
              description: 'S: Mauga. A: Winston. Unranked: empty.',
              on: {
                DRAG_MAUGA_TO_A: {target: 'maugaLast'},
                DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
                DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
                DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
                DRAG_ITEMS_OF_S_ONTO_A: {target: '#mouseDrag.tiles.winstonInS.maugaInA'},
                DRAG_ITEMS_OF_A_ONTO_S: {target: '#mouseDrag.tiles.winstonInS.maugaInA'},
              },
            },
            maugaFirst: {
              description: 'S: empty. A: Mauga, Winston. Unranked: empty. A drag along row A to its free space passes over Winston, so Mauga lands after him or stays first by the way the pointer went: the model leaves that drag out.',
              on: {
                DRAG_MAUGA_TO_S: {target: 'maugaInS'},
                DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
                DROP_MAUGA_AFTER_WINSTON: {target: 'maugaLast'},
                DRAG_ITEMS_OF_A_ONTO_S: {target: '#mouseDrag.tiles.winstonInS.maugaFirst'},
              },
            },
            maugaLast: {
              description: 'S: empty. A: Winston, Mauga. Unranked: empty.',
              on: {
                DRAG_MAUGA_TO_S: {target: 'maugaInS'},
                DRAG_MAUGA_TO_UNRANKED: {target: 'maugaInUnranked'},
                DROP_MAUGA_BEFORE_WINSTON: {target: 'maugaFirst'},
                DRAG_ITEMS_OF_A_ONTO_S: {target: '#mouseDrag.tiles.winstonInS.maugaLast'},
              },
            },
          },
        },
      },
    },
    order: {
      description: 'The order of the ranked rows, top to bottom. A stack drag moves only the items, so it changes nothing here.',
      initial: 'sFirst',
      states: {
        sFirst: {
          description: 'Row S, then row A, then the Unranked tray.',
          on: {
            DRAG_ROW_S_ONTO_A: {target: 'aFirst'},
            DRAG_ROW_A_ONTO_S: {target: 'aFirst'},
          },
        },
        aFirst: {
          description: 'Row A, then row S, then the Unranked tray: a grip drag moved a whole row.',
          on: {
            DRAG_ROW_S_ONTO_A: {target: 'sFirst'},
            DRAG_ROW_A_ONTO_S: {target: 'sFirst'},
          },
        },
      },
    },
  },
});
